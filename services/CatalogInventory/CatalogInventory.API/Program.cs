using Hangfire;
using Hangfire.SqlServer;
using CatalogInventory.Application;
using CatalogInventory.Application.Abstractions;
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

    await SeedCatalogAsync(dbContext, scope.ServiceProvider);
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
        app.Logger.LogWarning(ex, "CatalogInventory dependency call failed.");
        await WriteErrorAsync(
            context,
            StatusCodes.Status503ServiceUnavailable,
            "dependency.unavailable",
            "A downstream service is unavailable. Please retry.",
            retryable: true);
    }
    catch (TaskCanceledException ex) when (!context.RequestAborted.IsCancellationRequested)
    {
        app.Logger.LogWarning(ex, "CatalogInventory dependency call timed out.");
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
        app.Logger.LogError(ex, "Unhandled CatalogInventory API exception for {Method} {Path}", context.Request.Method, context.Request.Path);
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

    if (message.Contains("insufficient", StringComparison.OrdinalIgnoreCase)
        || message.Contains("already exists", StringComparison.OrdinalIgnoreCase)
        || message.Contains("stock", StringComparison.OrdinalIgnoreCase)
        || message.Contains("cannot", StringComparison.OrdinalIgnoreCase))
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

app.MapGet("/health", () => Results.Ok(new { service = "CatalogInventory", status = "Healthy", utc = DateTime.UtcNow }));

RecurringJob.AddOrUpdate<HangfireHeartbeatJob>(
    "cataloginventory-heartbeat",
    job => job.RunAsync(),
    Cron.Minutely);

app.Run();

static async Task SeedCatalogAsync(CatalogInventoryDbContext dbContext, IServiceProvider serviceProvider)
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
            "https://image.pollinations.ai/prompt/electrical%20fuse%20replacement%20pack%20industrial%20spare%20product%20photo?width=1024&height=768&nologo=true"),
        new SeedCatalogProduct(
            "AIV-611",
            "AI Vision Defect Inspection Camera",
            "AI-generated catalog item for demo: edge vision camera optimized for automated defect detection on production lines.",
            "Sensors",
            26999m,
            1,
            22,
            string.Empty),
        new SeedCatalogProduct(
            "AIG-612",
            "AI Route Optimization Edge Gateway",
            "AI-generated catalog item for demo: on-prem edge gateway for route planning and fleet ETA optimization.",
            "Networking",
            31999m,
            1,
            16,
            string.Empty),
        new SeedCatalogProduct(
            "AIP-613",
            "Predictive Maintenance Sensor Hub",
            "AI-generated catalog item for demo: sensor fusion hub for predicting failures across rotating equipment.",
            "Automation",
            21499m,
            1,
            30,
            string.Empty),
        new SeedCatalogProduct(
            "AID-614",
            "Generative Demand Forecast Console",
            "AI-generated catalog item for demo: touchscreen console that summarizes SKU demand projections and replenishment advice.",
            "Displays",
            28999m,
            1,
            14,
            string.Empty),
        new SeedCatalogProduct(
            "AIR-615",
            "Autonomous Picking Robot Controller",
            "AI-generated catalog item for demo: industrial control module for orchestrating autonomous picking robots.",
            "Electronics",
            45999m,
            1,
            10,
            string.Empty)
    };

    var productSkus = products.Select(x => x.Sku).ToArray();
    var categoryNamesById = categoriesByName.Values.ToDictionary(c => c.CategoryId, c => c.Name);
    var existingProducts = await dbContext.Products
        .Where(p => productSkus.Contains(p.Sku))
        .ToDictionaryAsync(p => p.Sku);

    var productsChanged = false;
    var touchedProductIds = new HashSet<Guid>();

    foreach (var seed in products)
    {
        var category = categoriesByName[seed.CategoryName];
        var resolvedImageUrl = ResolveSeedImageUrl(seed);
        if (existingProducts.TryGetValue(seed.Sku, out var existingProduct))
        {
            existingProduct.Update(
                seed.Name,
                seed.Description,
                category.CategoryId,
                seed.UnitPrice,
                seed.MinOrderQty,
                resolvedImageUrl,
                true);
            productsChanged = true;
            touchedProductIds.Add(existingProduct.ProductId);
            continue;
        }

        var createdProduct = Product.Create(
            seed.Sku,
            seed.Name,
            seed.Description,
            category.CategoryId,
            seed.UnitPrice,
            seed.MinOrderQty,
            seed.OpeningStock,
            resolvedImageUrl);

        await dbContext.Products.AddAsync(createdProduct);
        productsChanged = true;
        touchedProductIds.Add(createdProduct.ProductId);
    }

    var productsMissingImage = await dbContext.Products
        .Where(p => p.ImageUrl == null
            || p.ImageUrl == ""
            || p.ImageUrl.Contains("picsum.photos/seed/scp-")
            || p.ImageUrl.Contains("image.pollinations.ai"))
        .ToListAsync();

    foreach (var product in productsMissingImage)
    {
        var categoryName = categoryNamesById.TryGetValue(product.CategoryId, out var resolvedCategoryName)
            ? resolvedCategoryName
            : null;

        product.Update(
            product.Name,
            product.Description,
            product.CategoryId,
            product.UnitPrice,
            product.MinOrderQty,
            BuildRelevantAiImageUrl(product.Name, product.Sku, categoryName),
            product.IsActive);
        productsChanged = true;
        touchedProductIds.Add(product.ProductId);
    }

    if (productsChanged)
    {
        await dbContext.SaveChangesAsync();
        await InvalidateCatalogCachesAfterSeedAsync(serviceProvider, touchedProductIds);
    }
}

static async Task InvalidateCatalogCachesAfterSeedAsync(IServiceProvider serviceProvider, IEnumerable<Guid> productIds)
{
    var cacheStore = serviceProvider.GetService<IInventoryCacheStore>();
    if (cacheStore is null)
    {
        return;
    }

    await cacheStore.InvalidateTrackedKeysAsync("catalog:products:keys");
    await cacheStore.InvalidateTrackedKeysAsync("catalog:search:keys");

    foreach (var productId in productIds.Distinct())
    {
        await cacheStore.DeleteAsync($"catalog:product:{productId}");
        await cacheStore.DeleteAsync($"inventory:available:{productId}");
    }
}

static string ResolveSeedImageUrl(SeedCatalogProduct seed)
{
    if (string.IsNullOrWhiteSpace(seed.ImageUrl)
        || seed.ImageUrl.Contains("image.pollinations.ai", StringComparison.OrdinalIgnoreCase)
        || seed.ImageUrl.Contains("picsum.photos/seed/scp-", StringComparison.OrdinalIgnoreCase))
    {
        return BuildRelevantAiImageUrl(seed.Name, seed.Sku, seed.CategoryName);
    }

    return seed.ImageUrl;
}

static string BuildRelevantAiImageUrl(string productName, string sku, string? categoryName = null)
{
    var safeName = NormalizeForPrompt(productName, 90);
    var safeSku = NormalizeForPrompt(sku, 24).ToUpperInvariant();
    var safeCategory = NormalizeForPrompt(categoryName ?? "Industrial catalog", 48);

    var paletteHex = ResolveCategoryPaletteHex(safeCategory);
    var text = Uri.EscapeDataString($"{safeName}\n{safeCategory}\n{safeSku}");
    return $"https://placehold.co/1200x900/{paletteHex}/FFFFFF/png?text={text}";
}

static string ResolveCategoryPaletteHex(string categoryName)
{
    var normalized = categoryName.Trim().ToLowerInvariant();

    if (normalized.Contains("electrical")) return "1E3A8A";
    if (normalized.Contains("safety")) return "7C2D12";
    if (normalized.Contains("network")) return "0F766E";
    if (normalized.Contains("automation")) return "4C1D95";
    if (normalized.Contains("sensor")) return "155E75";
    if (normalized.Contains("display")) return "1D4ED8";
    if (normalized.Contains("mobile")) return "0F766E";
    if (normalized.Contains("computer") || normalized.Contains("processor") || normalized.Contains("memory") || normalized.Contains("storage") || normalized.Contains("motherboard") || normalized.Contains("graphics") || normalized.Contains("peripheral")) return "1E293B";
    if (normalized.Contains("spare") || normalized.Contains("maintenance")) return "92400E";
    if (normalized.Contains("packaging")) return "9A3412";
    if (normalized.Contains("office")) return "374151";
    if (normalized.Contains("tool")) return "1F2937";
    if (normalized.Contains("logistics")) return "14532D";

    return "1F3A8A";
}

static string NormalizeForPrompt(string value, int maxLength)
{
    if (string.IsNullOrWhiteSpace(value))
    {
        return string.Empty;
    }

    var normalized = string.Join(' ', value.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
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
