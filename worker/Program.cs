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

var commit = System.Reflection.CustomAttributeExtensions
    .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>(
        typeof(Worker).Assembly)
    ?.InformationalVersion ?? "unknown";

app.MapGet("/", (WorkerState state) => Results.Ok(new
{
    status = "running",
    service = "ravenwatch-worker",
    commit,
    backend_reachable = state.BackendReachable,
    last_backend_check = state.LastBackendCheck,
    last_scrape_at = state.LastScrapeAt,
    last_scrape_status = state.LastScrapeStatus,
    next_scrape_at = state.NextScrapeAt,
}));

app.Run();
