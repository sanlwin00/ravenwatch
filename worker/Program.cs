using RavenWatch.Worker;

var builder = Host.CreateApplicationBuilder(args);

var sentryDsn = builder.Configuration["SENTRY_DSN_WORKER"] ?? Environment.GetEnvironmentVariable("SENTRY_DSN_WORKER");
if (!string.IsNullOrWhiteSpace(sentryDsn))
{
    builder.Logging.AddSentry(o =>
    {
        o.Dsn = sentryDsn;
        o.TracesSampleRate = 0.2;
        o.MinimumEventLevel = Microsoft.Extensions.Logging.LogLevel.Error;
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

var host = builder.Build();
host.Run();
