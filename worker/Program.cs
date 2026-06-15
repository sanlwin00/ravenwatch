using RavenWatch.Worker;

var builder = WebApplication.CreateBuilder(args);

var sentryDsn = builder.Configuration["SENTRY_DSN_WORKER"] ?? Environment.GetEnvironmentVariable("SENTRY_DSN_WORKER");
if (!string.IsNullOrWhiteSpace(sentryDsn))
{
    builder.Logging.AddSentry(o =>
    {
        o.Dsn = sentryDsn;
        o.TracesSampleRate = 0.2;
        o.MinimumEventLevel = Microsoft.Extensions.Logging.LogLevel.Warning;
        o.DefaultTags.Add("service", "ravenwatch-worker");
    });
}

var apiBase = builder.Configuration["RavenWatch:ApiBaseUrl"]
    ?? throw new InvalidOperationException("RavenWatch:ApiBaseUrl is required.");
var apiKey = builder.Configuration["RavenWatch:ApiKey"]
    ?? throw new InvalidOperationException("RavenWatch:ApiKey is required.");

builder.Services.AddHttpClient("RavenWatch", client =>
{
    client.BaseAddress = new Uri(apiBase);
    client.DefaultRequestHeaders.Add("X-API-Key", apiKey);
});

builder.Services.AddSingleton<WorkerState>();
builder.Services.AddHostedService<Worker>();

var app = builder.Build();

// Shorten commit: strip MSBuild-appended duplicate after '+', take first 7 chars
var rawCommit = System.Reflection.CustomAttributeExtensions
    .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>(
        typeof(Worker).Assembly)
    ?.InformationalVersion ?? "unknown";
var shortCommit = rawCommit.Split('+')[0];
if (shortCommit.Length > 7) shortCommit = shortCommit[..7];

// Toronto timezone (Eastern) — Windows uses "Eastern Standard Time"
var torontoTz = TimeZoneInfo.FindSystemTimeZoneById(
    OperatingSystem.IsWindows() ? "Eastern Standard Time" : "America/Toronto");

static string? ToToronto(DateTimeOffset? dt, TimeZoneInfo tz) =>
    dt is null ? null : TimeZoneInfo.ConvertTime(dt.Value, tz).ToString("yyyy-MM-dd HH:mm:ss zzz");

app.MapGet("/", (WorkerState state) => Results.Ok(new
{
    status = "running",
    service = "ravenwatch-worker",
    commit = shortCommit,
    backend_reachable = state.BackendReachable,
    last_backend_check = ToToronto(state.LastBackendCheck, torontoTz),
    last_scrape_at = ToToronto(state.LastScrapeAt, torontoTz),
    last_scrape_status = state.LastScrapeStatus,
    next_scrape_at = ToToronto(state.NextScrapeAt, torontoTz),
    timezone = "America/Toronto (EDT/EST)",
}));

app.Run();
