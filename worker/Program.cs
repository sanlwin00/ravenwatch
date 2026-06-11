using RavenWatch.Worker;

var builder = Host.CreateApplicationBuilder(args);

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
