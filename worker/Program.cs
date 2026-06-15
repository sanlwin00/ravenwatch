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

builder.Services.AddHostedService<Worker>();

var app = builder.Build();

// IIS OutOfProcess requires an HTTP listener — minimal health endpoint
var commit = System.Reflection.CustomAttributeExtensions
    .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>(
        typeof(Worker).Assembly)
    ?.InformationalVersion ?? "unknown";

app.MapGet("/", () => Results.Ok(new { status = "running", service = "ravenwatch-worker", commit }));

app.Run();
