using Hangfire;
using Hangfire.SqlServer;
using Order.Application;
using Order.Infrastructure;
using Order.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

var jwtSecret = builder.Configuration["Jwt:SecretKey"]
    ?? "ThisIsADevelopmentOnlySecretKey_ChangeForProduction_2026";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "SupplyChainPlatform";
var jwtAudiences = builder.Configuration.GetSection("Jwt:Audiences").Get<string[]>();
if (jwtAudiences is null || jwtAudiences.Length == 0)
{
    jwtAudiences = new[] { builder.Configuration["Jwt:Audience"] ?? "SupplyChainPlatform.Client" };
}
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));

builder.Host.UseSerilog((context, loggerConfiguration) =>
{
    loggerConfiguration.ReadFrom.Configuration(context.Configuration);
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var hangfireConnection = builder.Configuration.GetConnectionString("OrderDb")
    ?? throw new InvalidOperationException("Connection string 'OrderDb' is missing for Hangfire.");

builder.Services.AddHangfire(configuration => configuration
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSqlServerStorage(hangfireConnection, new SqlServerStorageOptions
    {
        PrepareSchemaIfNecessary = true
    }));
builder.Services.AddHangfireServer();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudiences = jwtAudiences,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                var hasJti = !string.IsNullOrWhiteSpace(context.Principal?.FindFirst(JwtRegisteredClaimNames.Jti)?.Value);
                if (!hasJti)
                {
                    context.Fail("Token JTI is missing.");
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddOrderApplication();
builder.Services.AddOrderInfrastructure(builder.Configuration);

builder.Services.AddHealthChecks();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<OrderDbContext>();
    var startupLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Order.Startup");
    await dbContext.Database.MigrateAsync();

    var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync();
    if (pendingMigrations.Any())
    {
        startupLogger.LogWarning("Order has pending migrations after startup: {PendingMigrations}", string.Join(",", pendingMigrations));
    }

    var appliedMigrations = await dbContext.Database.GetAppliedMigrationsAsync();
    startupLogger.LogInformation("Order migrations applied count: {AppliedCount}", appliedMigrations.Count());
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Order API v1");
        options.RoutePrefix = "swagger";
    });

    app.MapHangfireDashboard("/hangfire");
}

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (ValidationException ex)
    {
        await WriteErrorAsync(
            context,
            StatusCodes.Status400BadRequest,
            "validation.failed",
            "Validation failed.",
            retryable: false,
            details: ex.Errors.Select(e => new { field = e.PropertyName, error = e.ErrorMessage }));
    }
    catch (UnauthorizedAccessException ex)
    {
        await WriteErrorAsync(
            context,
            StatusCodes.Status401Unauthorized,
            "auth.unauthorized",
            ex.Message,
            retryable: false);
    }
    catch (KeyNotFoundException ex)
    {
        await WriteErrorAsync(
            context,
            StatusCodes.Status404NotFound,
            "resource.not-found",
            ex.Message,
            retryable: false);
    }
    catch (HttpRequestException ex)
    {
        app.Logger.LogWarning(ex, "Order dependency call failed.");
        await WriteErrorAsync(
            context,
            StatusCodes.Status503ServiceUnavailable,
            "dependency.unavailable",
            "A downstream service is unavailable. Please retry.",
            retryable: true);
    }
    catch (TaskCanceledException ex) when (!context.RequestAborted.IsCancellationRequested)
    {
        app.Logger.LogWarning(ex, "Order dependency call timed out.");
        await WriteErrorAsync(
            context,
            StatusCodes.Status504GatewayTimeout,
            "dependency.timeout",
            "A downstream service timed out. Please retry.",
            retryable: true);
    }
    catch (InvalidOperationException ex)
    {
        var mapped = MapInvalidOperation(ex.Message);
        await WriteErrorAsync(
            context,
            mapped.StatusCode,
            mapped.Code,
            ex.Message,
            mapped.Retryable);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Unhandled Order API exception for {Method} {Path}", context.Request.Method, context.Request.Path);
        await WriteErrorAsync(
            context,
            StatusCodes.Status500InternalServerError,
            "internal.unexpected",
            "Unexpected server error.",
            retryable: true);
    }
});

static (int StatusCode, string Code, bool Retryable) MapInvalidOperation(string message)
{
    if (message.Contains("gateway is disabled", StringComparison.OrdinalIgnoreCase)
        || message.Contains("downstream service", StringComparison.OrdinalIgnoreCase))
    {
        return (StatusCodes.Status503ServiceUnavailable, "dependency.unavailable", true);
    }

    if (message.Contains("cannot transition", StringComparison.OrdinalIgnoreCase)
        || message.Contains("cannot move", StringComparison.OrdinalIgnoreCase)
        || message.Contains("unable to reserve stock", StringComparison.OrdinalIgnoreCase)
        || message.Contains("unable to deduct", StringComparison.OrdinalIgnoreCase)
        || message.Contains("unable to release", StringComparison.OrdinalIgnoreCase)
        || message.Contains("insufficient", StringComparison.OrdinalIgnoreCase))
    {
        return (StatusCodes.Status409Conflict, "business.conflict", false);
    }

    return (StatusCodes.Status400BadRequest, "business.rule-violation", false);
}

static Task WriteErrorAsync(HttpContext context, int statusCode, string code, string message, bool retryable, object? details = null)
{
    if (context.Response.HasStarted)
    {
        return Task.CompletedTask;
    }

    context.Response.StatusCode = statusCode;
    context.Response.ContentType = "application/json";

    var correlationId = context.Request.Headers.TryGetValue("X-Correlation-Id", out var header)
        && !string.IsNullOrWhiteSpace(header)
        ? header.ToString()
        : context.TraceIdentifier;

    return context.Response.WriteAsJsonAsync(new
    {
        code,
        message,
        retryable,
        correlationId,
        details
    });
}

app.UseSerilogRequestLogging();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { service = "Order", status = "Healthy", utc = DateTime.UtcNow }));

RecurringJob.AddOrUpdate<HangfireHeartbeatJob>(
    "order-heartbeat",
    job => job.RunAsync(),
    Cron.Minutely);

app.Run();

internal sealed class HangfireHeartbeatJob(ILogger<HangfireHeartbeatJob> logger)
{
    public Task RunAsync()
    {
        logger.LogInformation("Hangfire heartbeat job executed at {UtcNow}", DateTime.UtcNow);
        return Task.CompletedTask;
    }
}
