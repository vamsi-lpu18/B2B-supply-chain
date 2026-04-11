using Hangfire;
using Hangfire.SqlServer;
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

var hangfireConnection = builder.Configuration.GetConnectionString("InventoryDb")
    ?? throw new InvalidOperationException("Connection string 'InventoryDb' is missing for Hangfire.");

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

RecurringJob.AddOrUpdate<HangfireHeartbeatJob>(
    "cataloginventory-heartbeat",
    job => job.RunAsync(),
    Cron.Minutely);

app.Run();

static async Task SeedCatalogAsync(CatalogInventoryDbContext dbContext)
{
    var categorySeeds = new[]
    {
        new SeedCatalogCategory("Electrical"),
        new SeedCatalogCategory("Safety"),
        new SeedCatalogCategory("Electronics"),
        new SeedCatalogCategory("Spare Parts"),
        new SeedCatalogCategory("Computer Parts"),
        new SeedCatalogCategory("Networking"),
        new SeedCatalogCategory("Automation"),
        new SeedCatalogCategory("Tools"),
        new SeedCatalogCategory("Packaging"),
        new SeedCatalogCategory("Office Supplies"),
        new SeedCatalogCategory("Logistics Equipment"),
        new SeedCatalogCategory("Maintenance"),
        new SeedCatalogCategory("Sensors", "Electronics"),
        new SeedCatalogCategory("Displays", "Electronics"),
        new SeedCatalogCategory("Mobile Devices", "Electronics"),
        new SeedCatalogCategory("Processors", "Computer Parts"),
        new SeedCatalogCategory("Memory Modules", "Computer Parts"),
        new SeedCatalogCategory("Storage Drives", "Computer Parts"),
        new SeedCatalogCategory("Motherboards", "Computer Parts"),
        new SeedCatalogCategory("Graphics Cards", "Computer Parts"),
        new SeedCatalogCategory("Peripherals", "Computer Parts"),
        new SeedCatalogCategory("Mechanical Spares", "Spare Parts"),
        new SeedCatalogCategory("Electrical Spares", "Spare Parts")
    };
    var categoriesByName = await dbContext.Categories.ToDictionaryAsync(c => c.Name);

    var topLevelCategoriesAdded = false;
    foreach (var seed in categorySeeds.Where(seed => seed.ParentCategoryName is null))
    {
        if (categoriesByName.ContainsKey(seed.Name))
        {
            continue;
        }

        await dbContext.Categories.AddAsync(Category.Create(seed.Name));
        topLevelCategoriesAdded = true;
    }

    if (topLevelCategoriesAdded)
    {
        await dbContext.SaveChangesAsync();
        categoriesByName = await dbContext.Categories.ToDictionaryAsync(c => c.Name);
    }

    var childCategoriesAdded = false;
    foreach (var seed in categorySeeds.Where(seed => !string.IsNullOrWhiteSpace(seed.ParentCategoryName)))
    {
        if (categoriesByName.ContainsKey(seed.Name))
        {
            continue;
        }

        if (!categoriesByName.TryGetValue(seed.ParentCategoryName!, out var parentCategory))
        {
            continue;
        }

        await dbContext.Categories.AddAsync(Category.Create(seed.Name, parentCategory.CategoryId));
        childCategoriesAdded = true;
    }

    if (childCategoriesAdded)
    {
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
            "https://image.pollinations.ai/prompt/arc%20flash%20insulated%20safety%20gloves%20industrial%20product%20photo%20clean%20background?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "ELE-101",
            "Rugged Industrial Tablet 10-inch",
            "Shock-resistant field tablet for warehouse, logistics, and plant-floor workflows.",
            "Electronics",
            28999m,
            1,
            40,
            "https://image.pollinations.ai/prompt/rugged%20industrial%20tablet%20device%20enterprise%20product%20photography%20white%20background?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "SPR-201",
            "Hydraulic Pump Seal Kit",
            "Maintenance-grade replacement seal kit for heavy-duty hydraulic pumps.",
            "Spare Parts",
            1399m,
            2,
            220,
            "https://image.pollinations.ai/prompt/hydraulic%20pump%20seal%20kit%20industrial%20spare%20parts%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "CPU-301",
            "Rackmount Compute Node",
            "High-reliability server compute node for edge workloads and control systems.",
            "Computer Parts",
            84999m,
            1,
            18,
            "https://image.pollinations.ai/prompt/rackmount%20compute%20server%20node%20enterprise%20hardware%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "NET-401",
            "Managed 24-Port Gigabit Switch",
            "Layer-2 managed switch with VLAN, QoS, and monitoring for warehouse LAN segments.",
            "Networking",
            12499m,
            1,
            55,
            "https://image.pollinations.ai/prompt/managed%2024%20port%20gigabit%20network%20switch%20enterprise%20product%20shot?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "AUT-501",
            "PLC I/O Expansion Module",
            "DIN-rail mount expansion module for programmable logic controller deployments.",
            "Automation",
            6799m,
            1,
            90,
            "https://image.pollinations.ai/prompt/plc%20io%20expansion%20module%20industrial%20automation%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "TLS-601",
            "Digital Torque Wrench",
            "Precision torque wrench with digital readout for assembly and service operations.",
            "Tools",
            3599m,
            1,
            110,
            "https://image.pollinations.ai/prompt/digital%20torque%20wrench%20industrial%20tool%20product%20photography?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "PKG-701",
            "Heavy-Duty Corrugated Pallet Box",
            "Stackable corrugated pallet box for outbound shipment packaging.",
            "Packaging",
            499m,
            5,
            600,
            "https://image.pollinations.ai/prompt/heavy%20duty%20corrugated%20pallet%20box%20warehouse%20packaging%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "OFF-801",
            "Thermal Label Printer",
            "High-throughput thermal label printer for invoices, bins, and shipping labels.",
            "Office Supplies",
            8999m,
            1,
            46,
            "https://image.pollinations.ai/prompt/thermal%20label%20printer%20office%20logistics%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "LOG-901",
            "Handheld Barcode Scanner",
            "Fast-reading handheld barcode scanner optimized for warehouse and dispatch operations.",
            "Logistics Equipment",
            2799m,
            1,
            180,
            "https://image.pollinations.ai/prompt/handheld%20barcode%20scanner%20warehouse%20equipment%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "MNT-951",
            "Industrial Lubricant Cartridge",
            "High-performance lubricant cartridge for preventive maintenance programs.",
            "Maintenance",
            349m,
            10,
            900,
            "https://image.pollinations.ai/prompt/industrial%20lubricant%20cartridge%20maintenance%20consumable%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "SNS-111",
            "IoT Temperature And Humidity Sensor",
            "Industrial sensor node with calibrated telemetry for warehouse condition monitoring.",
            "Sensors",
            2199m,
            1,
            140,
            "https://image.pollinations.ai/prompt/iot%20temperature%20humidity%20sensor%20industrial%20product%20photo%20clean%20background?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "DSP-112",
            "24-inch Industrial HMI Display",
            "High-brightness touch display for production line supervision and control dashboards.",
            "Displays",
            18499m,
            1,
            34,
            "https://image.pollinations.ai/prompt/industrial%20hmi%20touch%20display%20enterprise%20hardware%20product%20shot?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "MOB-113",
            "Rugged Warehouse Handheld Terminal",
            "Android-based handheld terminal with barcode engine and long-shift battery life.",
            "Mobile Devices",
            22999m,
            1,
            52,
            "https://image.pollinations.ai/prompt/rugged%20warehouse%20handheld%20terminal%20barcode%20device%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "CPU-321",
            "Industrial Multi-Core Processor",
            "Energy-efficient enterprise processor tuned for edge compute workloads.",
            "Processors",
            32999m,
            1,
            28,
            "https://image.pollinations.ai/prompt/industrial%20multi%20core%20processor%20chip%20enterprise%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "RAM-322",
            "ECC DDR5 32GB Memory Module",
            "Server-grade ECC memory module for mission-critical workloads.",
            "Memory Modules",
            9799m,
            2,
            86,
            "https://image.pollinations.ai/prompt/ecc%20ddr5%20memory%20module%20enterprise%20hardware%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "SSD-323",
            "Enterprise NVMe SSD 2TB",
            "High endurance NVMe drive optimized for transactional systems and analytics.",
            "Storage Drives",
            16999m,
            1,
            74,
            "https://image.pollinations.ai/prompt/enterprise%20nvme%20ssd%202tb%20storage%20product%20photography?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "MBD-324",
            "Industrial ATX Motherboard",
            "Long-lifecycle motherboard with remote management and hardened I/O.",
            "Motherboards",
            14799m,
            1,
            40,
            "https://image.pollinations.ai/prompt/industrial%20atx%20motherboard%20enterprise%20hardware%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "GPU-325",
            "Workstation GPU 16GB",
            "Professional graphics accelerator for visualization and AI-assisted planning.",
            "Graphics Cards",
            58999m,
            1,
            20,
            "https://image.pollinations.ai/prompt/workstation%20gpu%20graphics%20card%20enterprise%20product%20shot?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "PRF-326",
            "Rugged Mechanical Keyboard",
            "Spill-resistant mechanical keyboard built for continuous operations desks.",
            "Peripherals",
            3699m,
            1,
            160,
            "https://image.pollinations.ai/prompt/rugged%20mechanical%20keyboard%20peripheral%20product%20photography?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "MSP-411",
            "Conveyor Drive Roller Spare",
            "Precision-machined spare roller for conveyor maintenance cycles.",
            "Mechanical Spares",
            899m,
            4,
            260,
            "https://image.pollinations.ai/prompt/conveyor%20drive%20roller%20spare%20part%20industrial%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "ESP-412",
            "Panel Fuse Replacement Pack",
            "Certified electrical fuse replacement pack for panel safety maintenance.",
            "Electrical Spares",
            299m,
            10,
            520,
            "https://image.pollinations.ai/prompt/electrical%20fuse%20replacement%20pack%20industrial%20spare%20product%20photo?width=1024&height=768&nologo=true")
    };

    var productSkus = products.Select(x => x.Sku).ToArray();
    var existingProducts = await dbContext.Products
        .Where(p => productSkus.Contains(p.Sku))
        .ToDictionaryAsync(p => p.Sku);

    var productsChanged = false;

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
            productsChanged = true;
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
        productsChanged = true;
    }

    if (productsChanged)
    {
        await dbContext.SaveChangesAsync();
    }
}

internal sealed record SeedCatalogCategory(
    string Name,
    string? ParentCategoryName = null);

internal sealed record SeedCatalogProduct(
    string Sku,
    string Name,
    string Description,
    string CategoryName,
    decimal UnitPrice,
    int MinOrderQty,
    int OpeningStock,
    string ImageUrl);

internal sealed class HangfireHeartbeatJob(ILogger<HangfireHeartbeatJob> logger)
{
    public Task RunAsync()
    {
        logger.LogInformation("Hangfire heartbeat job executed at {UtcNow}", DateTime.UtcNow);
        return Task.CompletedTask;
    }
}
