using CatalogInventory.Application;
using CatalogInventory.Domain.Entities;
using CatalogInventory.Infrastructure;
using CatalogInventory.Infrastructure.Persistence;
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

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
    options.AddPolicy("DealerOnly", policy => policy.RequireRole("Dealer"));
});

builder.Services.AddCatalogInventoryApplication();
builder.Services.AddCatalogInventoryInfrastructure(builder.Configuration);

builder.Services.AddHealthChecks();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<CatalogInventoryDbContext>();
    var startupLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("CatalogInventory.Startup");
    await dbContext.Database.MigrateAsync();

    var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync();
    if (pendingMigrations.Any())
    {
        startupLogger.LogWarning("CatalogInventory has pending migrations after startup: {PendingMigrations}", string.Join(",", pendingMigrations));
    }

    var appliedMigrations = await dbContext.Database.GetAppliedMigrationsAsync();
    startupLogger.LogInformation("CatalogInventory migrations applied count: {AppliedCount}", appliedMigrations.Count());

    await SeedCatalogAsync(dbContext);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "CatalogInventory API v1");
        options.RoutePrefix = "swagger";
    });
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

app.MapGet("/health", () => Results.Ok(new { service = "CatalogInventory", status = "Healthy", utc = DateTime.UtcNow }));

app.Run();

static async Task SeedCatalogAsync(CatalogInventoryDbContext dbContext)
{
    var categoryNames = new[] { "Electrical", "Safety" };
    var categoriesByName = await dbContext.Categories.ToDictionaryAsync(c => c.Name);

    var missingCategories = categoryNames
        .Where(name => !categoriesByName.ContainsKey(name))
        .Select(name => Category.Create(name))
        .ToList();

    if (missingCategories.Count > 0)
    {
        await dbContext.Categories.AddRangeAsync(missingCategories);
        await dbContext.SaveChangesAsync();
        categoriesByName = await dbContext.Categories.ToDictionaryAsync(c => c.Name);
    }

    var products = new[]
    {
        new SeedCatalogProduct(
            "CBL-001",
            "High-Capacity Copper Power Cable 10m",
            "Industrial-grade insulated copper cable for high-load distribution and maintenance operations.",
            "Electrical",
            1899m,
            1,
            240,
            "https://image.pollinations.ai/prompt/enterprise%20copper%20power%20cable%20on%20industrial%20warehouse%20shelf%20photorealistic%20product%20shot?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "MTR-002",
            "Smart Three-Phase Energy Meter",
            "Three-phase smart meter with telemetry-ready diagnostics for enterprise utility monitoring.",
            "Electrical",
            4799m,
            1,
            75,
            "https://image.pollinations.ai/prompt/smart%20three%20phase%20energy%20meter%20product%20photography%20studio%20lighting%20enterprise%20hardware?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "GLV-003",
            "Arc-Flash Insulated Safety Gloves",
            "Class-rated arc-flash gloves engineered for electrical installation and field service safety.",
            "Safety",
            699m,
            2,
            320,
            "https://image.pollinations.ai/prompt/arc%20flash%20insulated%20safety%20gloves%20industrial%20product%20photo%20clean%20background?width=1024&height=768&nologo=true")
    };

    var productSkus = products.Select(x => x.Sku).ToArray();
    var existingProducts = await dbContext.Products
        .Where(p => productSkus.Contains(p.Sku))
        .ToDictionaryAsync(p => p.Sku);

    var changed = false;

    foreach (var seed in products)
    {
        var category = categoriesByName[seed.CategoryName];
        if (existingProducts.TryGetValue(seed.Sku, out var existingProduct))
        {
            existingProduct.Update(
                seed.Name,
                seed.Description,
                category.CategoryId,
                seed.UnitPrice,
                seed.MinOrderQty,
                seed.ImageUrl,
                true);
            changed = true;
            continue;
        }

        await dbContext.Products.AddAsync(Product.Create(
            seed.Sku,
            seed.Name,
            seed.Description,
            category.CategoryId,
            seed.UnitPrice,
            seed.MinOrderQty,
            seed.OpeningStock,
            seed.ImageUrl));
        changed = true;
    }

    if (changed)
    {
        await dbContext.SaveChangesAsync();
    }
}

internal sealed record SeedCatalogProduct(
    string Sku,
    string Name,
    string Description,
    string CategoryName,
    decimal UnitPrice,
    int MinOrderQty,
    int OpeningStock,
    string ImageUrl);
