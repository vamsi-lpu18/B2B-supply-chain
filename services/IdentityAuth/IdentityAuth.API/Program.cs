using Hangfire;
using Hangfire.SqlServer;
using IdentityAuth.API.Jobs;
using IdentityAuth.Application;
using IdentityAuth.Application.Abstractions;
using IdentityAuth.Application.Exceptions;
using IdentityAuth.Domain.Entities;
using IdentityAuth.Domain.Enums;
using IdentityAuth.Domain.ValueObjects;
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
            ValidAudiences = jwtAudiences,
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

    await SeedDemoUsersAsync(scope.ServiceProvider, app.Configuration);
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
    catch (DomainValidationException ex)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
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

static async Task SeedDemoUsersAsync(IServiceProvider services, IConfiguration configuration)
{
    var dbContext = services.GetRequiredService<IdentityAuthDbContext>();
    var passwordService = services.GetRequiredService<IPasswordService>();

    await UpsertStaffUserAsync(
        dbContext,
        passwordService,
        UserRole.Admin,
        configuration["AdminSeed:Email"] ?? "admin@supplychain.local",
        configuration["AdminSeed:Password"] ?? "Admin@1234",
        configuration["AdminSeed:FullName"] ?? "Platform Admin",
        configuration["AdminSeed:PhoneNumber"] ?? "9999999999");

    await UpsertStaffUserAsync(
        dbContext,
        passwordService,
        UserRole.Warehouse,
        configuration["WarehouseSeed:Email"] ?? "warehouse@supplychain.local",
        configuration["WarehouseSeed:Password"] ?? "Warehouse@123",
        configuration["WarehouseSeed:FullName"] ?? "Warehouse Operator",
        configuration["WarehouseSeed:PhoneNumber"] ?? "9000000001");

    await UpsertStaffUserAsync(
        dbContext,
        passwordService,
        UserRole.Logistics,
        configuration["LogisticsSeed:Email"] ?? "logistics@supplychain.local",
        configuration["LogisticsSeed:Password"] ?? "Logistics@123",
        configuration["LogisticsSeed:FullName"] ?? "Logistics Coordinator",
        configuration["LogisticsSeed:PhoneNumber"] ?? "9000000002");

    await UpsertStaffUserAsync(
        dbContext,
        passwordService,
        UserRole.Agent,
        configuration["AgentSeed:Email"] ?? "agent@supplychain.local",
        configuration["AgentSeed:Password"] ?? "Agent@123",
        configuration["AgentSeed:FullName"] ?? "Delivery Agent",
        configuration["AgentSeed:PhoneNumber"] ?? "9000000003");

    await UpsertDealerUserAsync(
        dbContext,
        passwordService,
        configuration["DealerSeed:Email"] ?? "dealer@supplychain.local",
        configuration["DealerSeed:Password"] ?? "Dealer@123",
        configuration["DealerSeed:FullName"] ?? "Demo Dealer",
        configuration["DealerSeed:PhoneNumber"] ?? "9000000004",
        configuration["DealerSeed:BusinessName"] ?? "Demo Traders Pvt Ltd",
        configuration["DealerSeed:GstNumber"] ?? "37ABCDE1234F1Z5",
        configuration["DealerSeed:TradeLicenseNo"] ?? "TL-DEM-0001",
        configuration["DealerSeed:Address"] ?? "12 Market Street",
        configuration["DealerSeed:City"] ?? "Hyderabad",
        configuration["DealerSeed:State"] ?? "Telangana",
        configuration["DealerSeed:PinCode"] ?? "500001",
        configuration.GetValue<bool?>("DealerSeed:IsInterstate") ?? true);

    await dbContext.SaveChangesAsync();
}

static async Task UpsertStaffUserAsync(
    IdentityAuthDbContext dbContext,
    IPasswordService passwordService,
    UserRole role,
    string email,
    string password,
    string fullName,
    string phoneNumber)
{
    var normalizedEmail = email.Trim().ToLowerInvariant();
    var existingUser = await dbContext.Users
        .Include(x => x.DealerProfile)
        .FirstOrDefaultAsync(u => u.Email == normalizedEmail);

    if (existingUser is null)
    {
        var user = User.CreateStaff(
            normalizedEmail,
            passwordService.HashPassword(password),
            fullName,
            phoneNumber,
            role);

        await dbContext.Users.AddAsync(user);
        return;
    }

    dbContext.Entry(existingUser).Property(u => u.Role).CurrentValue = role;
    dbContext.Entry(existingUser).Property(u => u.Status).CurrentValue = UserStatus.Active;
    dbContext.Entry(existingUser).Property(u => u.FullName).CurrentValue = fullName.Trim();
    dbContext.Entry(existingUser).Property(u => u.PhoneNumber).CurrentValue = phoneNumber.Trim();
    existingUser.UpdatePassword(passwordService.HashPassword(password));
}

static async Task UpsertDealerUserAsync(
    IdentityAuthDbContext dbContext,
    IPasswordService passwordService,
    string email,
    string password,
    string fullName,
    string phoneNumber,
    string businessName,
    string gstNumber,
    string tradeLicenseNo,
    string address,
    string city,
    string state,
    string pinCode,
    bool isInterstate)
{
    var normalizedEmail = email.Trim().ToLowerInvariant();
    var existingUser = await dbContext.Users
        .Include(x => x.DealerProfile)
        .FirstOrDefaultAsync(u => u.Email == normalizedEmail);

    if (existingUser is null)
    {
        var dealer = User.CreateDealer(
            normalizedEmail,
            passwordService.HashPassword(password),
            fullName,
            phoneNumber,
            businessName,
            gstNumber,
            tradeLicenseNo,
            address,
            city,
            state,
            pinCode,
            isInterstate);

        dealer.ApproveDealer();
        await dbContext.Users.AddAsync(dealer);
        return;
    }

    dbContext.Entry(existingUser).Property(u => u.Role).CurrentValue = UserRole.Dealer;
    dbContext.Entry(existingUser).Property(u => u.Status).CurrentValue = UserStatus.Active;
    dbContext.Entry(existingUser).Property(u => u.FullName).CurrentValue = fullName.Trim();
    dbContext.Entry(existingUser).Property(u => u.PhoneNumber).CurrentValue = phoneNumber.Trim();
    existingUser.UpdatePassword(passwordService.HashPassword(password));

    if (existingUser.DealerProfile is null)
    {
        var dealerProfile = DealerProfile.Create(
            existingUser.UserId,
            businessName,
            gstNumber,
            tradeLicenseNo,
            address,
            city,
            state,
            pinCode,
            isInterstate);

        await dbContext.DealerProfiles.AddAsync(dealerProfile);
    }
}
