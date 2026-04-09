using Hangfire;
using Hangfire.SqlServer;
using IdentityAuth.API.Jobs;
using IdentityAuth.Application;
using IdentityAuth.Application.Abstractions;
using IdentityAuth.Domain.Entities;
using IdentityAuth.Domain.Enums;
using IdentityAuth.Infrastructure;
using IdentityAuth.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using System.Security.Claims;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

var jwtSecret = builder.Configuration["Jwt:SecretKey"]
    ?? throw new InvalidOperationException("Jwt:SecretKey is missing.");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "SupplyChainPlatform";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "SupplyChainPlatform.Client";
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));

builder.Host.UseSerilog((context, loggerConfiguration) =>
{
    loggerConfiguration.ReadFrom.Configuration(context.Configuration);
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var hangfireConnection = builder.Configuration.GetConnectionString("IdentityDb")
    ?? throw new InvalidOperationException("Connection string 'IdentityDb' is missing for Hangfire.");

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
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var jti = context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Jti);
                if (string.IsNullOrWhiteSpace(jti))
                {
                    context.Fail("Token JTI is missing.");
                    return;
                }

                var revocationStore = context.HttpContext.RequestServices.GetRequiredService<ITokenRevocationStore>();
                var isRevoked = await revocationStore.IsRevokedAsync(jti, context.HttpContext.RequestAborted);
                if (isRevoked)
                {
                    context.Fail("Token has been revoked.");
                }
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole(UserRole.Admin.ToString()));
    options.AddPolicy("DealerOnly", policy => policy.RequireRole(UserRole.Dealer.ToString()));
});

builder.Services.AddIdentityAuthApplication();
builder.Services.AddIdentityAuthInfrastructure(builder.Configuration);

builder.Services.AddHealthChecks();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<IdentityAuthDbContext>();
    var startupLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("IdentityAuth.Startup");
    await dbContext.Database.MigrateAsync();

    var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync();
    if (pendingMigrations.Any())
    {
        startupLogger.LogWarning("IdentityAuth has pending migrations after startup: {PendingMigrations}", string.Join(",", pendingMigrations));
    }

    var appliedMigrations = await dbContext.Database.GetAppliedMigrationsAsync();
    startupLogger.LogInformation("IdentityAuth migrations applied count: {AppliedCount}", appliedMigrations.Count());

    await SeedAdminAsync(scope.ServiceProvider, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "IdentityAuth API v1");
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
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new
        {
            message = "Validation failed.",
            errors = ex.Errors.Select(e => new { e.PropertyName, e.ErrorMessage })
        });
    }
    catch (UnauthorizedAccessException ex)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { message = ex.Message });
    }
    catch (InvalidOperationException ex)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { message = ex.Message });
    }
});

app.UseSerilogRequestLogging();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { service = "IdentityAuth", status = "Healthy", utc = DateTime.UtcNow }));

RecurringJob.AddOrUpdate<HangfireHeartbeatJob>(
    "identityauth-heartbeat",
    job => job.RunAsync(),
    Cron.Minutely);

app.Run();

static async Task SeedAdminAsync(IServiceProvider services, IConfiguration configuration)
{
    var dbContext = services.GetRequiredService<IdentityAuthDbContext>();
    var passwordService = services.GetRequiredService<IPasswordService>();

    var email = configuration["AdminSeed:Email"] ?? "admin@supplychain.local";
    var password = configuration["AdminSeed:Password"] ?? "Admin@1234";
    var fullName = configuration["AdminSeed:FullName"] ?? "Platform Admin";
    var phone = configuration["AdminSeed:PhoneNumber"] ?? "9999999999";
    var normalizedEmail = email.Trim().ToLowerInvariant();

    var seededAdmin = await dbContext.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);
    if (seededAdmin is not null)
    {
        dbContext.Entry(seededAdmin).Property(u => u.Role).CurrentValue = UserRole.Admin;
        dbContext.Entry(seededAdmin).Property(u => u.Status).CurrentValue = UserStatus.Active;
        seededAdmin.UpdatePassword(passwordService.HashPassword(password));
        await dbContext.SaveChangesAsync();
        return;
    }

    var adminUser = User.CreateStaff(
        normalizedEmail,
        passwordService.HashPassword(password),
        fullName,
        phone,
        UserRole.Admin);

    await dbContext.Users.AddAsync(adminUser);
    await dbContext.SaveChangesAsync();
}
