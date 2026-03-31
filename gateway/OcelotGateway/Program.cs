using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.Tokens;
using Ocelot.DependencyInjection;
using Ocelot.Middleware;
using Ocelot.Provider.Polly;
using Serilog;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;

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
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "SupplyChainPlatform.Client";
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

        options.RequireHttpsMetadata = false;
        options.SaveToken = true;
    });

builder.Services.AddAuthorization();
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<GatewayLatencyMetricsStore>();
builder.Services.AddSingleton<GatewayRouteMatcher>();
builder.Services.AddOcelot(builder.Configuration).AddPolly();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "Gateway API v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseSerilogRequestLogging();
app.UseCors();

app.UseWhen(context => context.Request.Path.Equals("/health", StringComparison.OrdinalIgnoreCase), branch =>
{
    branch.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status200OK;
        await context.Response.WriteAsJsonAsync(new
        {
            status = "Healthy",
            gateway = "OcelotGateway",
            checkedAtUtc = DateTime.UtcNow
        });
    });
});

app.UseWhen(context => context.Request.Path.StartsWithSegments("/gateway"), branch =>
{
    branch.Run(async context =>
    {
        var path = context.Request.Path.Value?.ToLowerInvariant();

        if (path == "/gateway/routes")
        {
            var config = context.RequestServices.GetRequiredService<IConfiguration>();
            var routes = config.GetSection("Routes").GetChildren()
                .Select(route => new GatewayRouteInfo(
                    route["UpstreamPathTemplate"] ?? string.Empty,
                    route["DownstreamPathTemplate"] ?? string.Empty,
                    route.GetSection("UpstreamHttpMethod").GetChildren().Select(x => x.Value ?? string.Empty).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray(),
                    route.GetSection("DownstreamHostAndPorts").GetChildren().Select(h => new GatewayHostInfo(h["Host"] ?? string.Empty, int.TryParse(h["Port"], out var p) ? p : 0)).ToArray()))
                .ToArray();

            context.Response.StatusCode = StatusCodes.Status200OK;
            await context.Response.WriteAsJsonAsync(new
            {
                gateway = "OcelotGateway",
                routeCount = routes.Length,
                routes
            });
            return;
        }

        if (path == "/gateway/health")
        {
            var config = context.RequestServices.GetRequiredService<IConfiguration>();
            var clientFactory = context.RequestServices.GetRequiredService<IHttpClientFactory>();
            var httpClient = clientFactory.CreateClient();
            var serviceHealthUrls = config.GetSection("ServiceHealthUrls").GetChildren();

            var results = new List<GatewayHealthCheckResult>();

            foreach (var item in serviceHealthUrls)
            {
                try
                {
                    var response = await httpClient.GetAsync(item.Value + "/health", context.RequestAborted);
                    results.Add(new GatewayHealthCheckResult(item.Key, response.IsSuccessStatusCode, (int)response.StatusCode, null));
                }
                catch (Exception ex)
                {
                    results.Add(new GatewayHealthCheckResult(item.Key, false, null, ex.Message));
                }
            }

            var isHealthy = results.All(r => r.Healthy);
            context.Response.StatusCode = StatusCodes.Status200OK;
            await context.Response.WriteAsJsonAsync(new { status = isHealthy ? "Healthy" : "Degraded", checks = results });
            return;
        }

        if (path == "/gateway/metrics")
        {
            var metrics = context.RequestServices.GetRequiredService<GatewayLatencyMetricsStore>();
            context.Response.StatusCode = StatusCodes.Status200OK;
            await context.Response.WriteAsJsonAsync(metrics.CreateSnapshot());
            return;
        }

        context.Response.StatusCode = StatusCodes.Status404NotFound;
    });
});

app.Use(async (context, next) =>
{
    var routeMatcher = context.RequestServices.GetRequiredService<GatewayRouteMatcher>();
    var metricsStore = context.RequestServices.GetRequiredService<GatewayLatencyMetricsStore>();
    var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("GatewayAudit");
    var stopwatch = Stopwatch.StartNew();
    var routeKey = routeMatcher.ResolveRoute(context.Request.Path);

    if (!context.Request.Headers.TryGetValue("X-Correlation-Id", out var correlationId) || string.IsNullOrWhiteSpace(correlationId))
    {
        correlationId = Guid.NewGuid().ToString("N");
        context.Request.Headers["X-Correlation-Id"] = correlationId;
    }

    if (!context.Request.Headers.TryGetValue("Oc-Client", out var clientId) || string.IsNullOrWhiteSpace(clientId))
    {
        context.Request.Headers["Oc-Client"] = ResolveFallbackClientId(context);
    }

    context.Response.Headers["X-Correlation-Id"] = correlationId.ToString();

    try
    {
        await next();
    }
    finally
    {
        stopwatch.Stop();
        metricsStore.Record(routeKey, stopwatch.Elapsed.TotalMilliseconds, context.Response.StatusCode);

        logger.LogInformation(
            "Gateway audit correlation={CorrelationId} method={Method} path={Path} route={Route} status={StatusCode} durationMs={DurationMs}",
            correlationId.ToString(),
            context.Request.Method,
            context.Request.Path.Value,
            routeKey,
            context.Response.StatusCode,
            Math.Round(stopwatch.Elapsed.TotalMilliseconds, 2));
    }
});

app.UseAuthentication();
app.UseAuthorization();

await app.UseOcelot();
app.Run();

static string ResolveFallbackClientId(HttpContext context)
{
    var forwardedFor = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
    if (!string.IsNullOrWhiteSpace(forwardedFor))
    {
        return $"anon-{forwardedFor.Trim()}";
    }

    var remoteIp = context.Connection.RemoteIpAddress?.ToString();
    if (!string.IsNullOrWhiteSpace(remoteIp))
    {
        return $"anon-{remoteIp}";
    }

    return "anon-unknown";
}

internal sealed record GatewayHealthCheckResult(string Service, bool Healthy, int? StatusCode, string? Error);
internal sealed record GatewayRouteInfo(string UpstreamPath, string DownstreamPath, string[] Methods, GatewayHostInfo[] Hosts);
internal sealed record GatewayHostInfo(string Host, int Port);

internal sealed record GatewayRouteLatencyMetrics(string Route, long Count, double AvgMs, double MinMs, double MaxMs, long SuccessCount, long ClientErrorCount, long ServerErrorCount);

internal sealed class GatewayLatencyMetricsStore
{
    private readonly ConcurrentDictionary<string, RouteMetricAccumulator> _metrics = new(StringComparer.OrdinalIgnoreCase);

    public void Record(string route, double durationMs, int statusCode)
    {
        var accumulator = _metrics.GetOrAdd(route, _ => new RouteMetricAccumulator());
        accumulator.Add(durationMs, statusCode);
    }

    public object CreateSnapshot()
    {
        var routes = _metrics
            .OrderBy(x => x.Key)
            .Select(x => x.Value.ToDto(x.Key))
            .ToArray();

        return new
        {
            capturedAtUtc = DateTime.UtcNow,
            routeCount = routes.Length,
            routes
        };
    }

    private sealed class RouteMetricAccumulator
    {
        private readonly object _sync = new();
        private long _count;
        private double _totalMs;
        private double _minMs = double.MaxValue;
        private double _maxMs;
        private long _successCount;
        private long _clientErrorCount;
        private long _serverErrorCount;

        public void Add(double durationMs, int statusCode)
        {
            lock (_sync)
            {
                _count += 1;
                _totalMs += durationMs;
                _minMs = Math.Min(_minMs, durationMs);
                _maxMs = Math.Max(_maxMs, durationMs);

                if (statusCode >= 500)
                {
                    _serverErrorCount += 1;
                }
                else if (statusCode >= 400)
                {
                    _clientErrorCount += 1;
                }
                else
                {
                    _successCount += 1;
                }
            }
        }

        public GatewayRouteLatencyMetrics ToDto(string route)
        {
            lock (_sync)
            {
                var avg = _count == 0 ? 0d : _totalMs / _count;
                var min = _count == 0 ? 0d : _minMs;

                return new GatewayRouteLatencyMetrics(
                    route,
                    _count,
                    Math.Round(avg, 2),
                    Math.Round(min, 2),
                    Math.Round(_maxMs, 2),
                    _successCount,
                    _clientErrorCount,
                    _serverErrorCount);
            }
        }
    }
}

internal sealed class GatewayRouteMatcher(IConfiguration configuration)
{
    private readonly (string Template, string Prefix)[] _routes = configuration
        .GetSection("Routes")
        .GetChildren()
        .Select(route => route["UpstreamPathTemplate"] ?? string.Empty)
        .Where(template => !string.IsNullOrWhiteSpace(template))
        .Select(template => (template, Prefix: ToPrefix(template)))
        .OrderByDescending(x => x.Prefix.Length)
        .ToArray();

    public string ResolveRoute(PathString requestPath)
    {
        var path = requestPath.Value ?? string.Empty;
        if (string.IsNullOrWhiteSpace(path))
        {
            return "unknown";
        }

        foreach (var route in _routes)
        {
            if (path.StartsWith(route.Prefix, StringComparison.OrdinalIgnoreCase))
            {
                return route.Template;
            }
        }

        return "unmatched";
    }

    private static string ToPrefix(string template)
    {
        var idx = template.IndexOf('{');
        if (idx < 0)
        {
            return template;
        }

        var prefix = template[..idx];
        return string.IsNullOrWhiteSpace(prefix) ? "/" : prefix;
    }
}
