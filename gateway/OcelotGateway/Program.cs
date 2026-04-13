using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Ocelot.DependencyInjection;
using Ocelot.Middleware;
using Ocelot.Provider.Polly;
using Serilog;
using System.Text;
using System.Threading.RateLimiting;
using System.Linq;
/// <summary>
/// Ocelot API Gateway for the Supply Chain Management Platform.
/// This gateway routes requests to the appropriate microservices based on the configuration defined in ocelot.json.
/// It also handles cross-cutting concerns such as authentication, logging, and resilience.
/// </summary>
/// <remarks>
/// The Ocelot API Gateway is configured to use JWT Bearer authentication, allowing it to validate tokens issued by the IdentityAuth service before forwarding requests to downstream services.
/// It also uses Serilog for structured logging and Polly for implementing resilience policies on outgoing HTTP requests.
/// </remarks>
var builder = WebApplication.CreateBuilder(args);

builder.Configuration
    .AddJsonFile("ocelot.json", optional: false, reloadOnChange: true)
    .AddEnvironmentVariables();

builder.Host.UseSerilog((context, loggerConfiguration) =>
{
    loggerConfiguration.ReadFrom.Configuration(context.Configuration);
});

var jwtSecret = builder.Configuration["Jwt:SecretKey"]
    ?? "ThisIsADevelopmentOnlySecretKey_ChangeForProduction_2026";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "SupplyChainPlatform";
var jwtAudiences = builder.Configuration.GetSection("Jwt:Audiences").Get<string[]>();
if (jwtAudiences is null || jwtAudiences.Length == 0)
{
    jwtAudiences = new[] { builder.Configuration["Jwt:Audience"] ?? "SupplyChainPlatform.Client" };
}
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        var correlationId = context.HttpContext.Request.Headers.TryGetValue("X-Correlation-Id", out var header)
            && !string.IsNullOrWhiteSpace(header)
            ? header.ToString()
            : context.HttpContext.TraceIdentifier;

        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            code = "throttle.too-many-requests",
            message = "Too many requests. Please retry after a short delay.",
            retryable = true,
            correlationId
        }, cancellationToken);
    };

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
    {
        var clientId = httpContext.Request.Headers["Oc-Client"].FirstOrDefault();
        var remoteIp = httpContext.Connection.RemoteIpAddress?.ToString();
        var partitionKey = !string.IsNullOrWhiteSpace(clientId)
            ? $"client:{clientId}"
            : $"ip:{remoteIp ?? "unknown"}";

        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
});

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

        options.RequireHttpsMetadata = false;
        options.SaveToken = true;
    });

builder.Services.AddAuthorization();
builder.Services.AddOcelot(builder.Configuration).AddPolly();

var app = builder.Build();

app.UseSerilogRequestLogging();
app.UseCors();

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Unhandled gateway exception for {Method} {Path}", context.Request.Method, context.Request.Path);
        await WriteGatewayErrorAsync(
            context,
            StatusCodes.Status500InternalServerError,
            "gateway.unexpected",
            "Gateway failed to process the request.",
            retryable: true);
    }
});

app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

await app.UseOcelot();
app.Run();

static Task WriteGatewayErrorAsync(HttpContext context, int statusCode, string code, string message, bool retryable)
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
        correlationId
    });
}
