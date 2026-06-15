using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace RavenWatch.Worker;

public class Worker(ILogger<Worker> logger, IHttpClientFactory httpClientFactory, WorkerState state)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("RavenWatch scrape worker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            var intervalHours = await GetFrequencyHoursAsync(stoppingToken);
            var lastRun = await GetLastScrapeTimeAsync(stoppingToken);
            var now = DateTimeOffset.UtcNow;

            double waitHours;
            if (lastRun is null)
            {
                // Never run — scrape immediately
                waitHours = 0;
            }
            else
            {
                var elapsed = now - lastRun.Value;
                var remaining = TimeSpan.FromHours(intervalHours) - elapsed;
                waitHours = remaining.TotalHours > 0 ? remaining.TotalHours : 0;
            }

            if (waitHours > 0)
            {
                var nextAt = now.AddHours(waitHours);
                state.NextScrapeAt = nextAt;
                logger.LogInformation("Last scrape was recent — next scrape in {Hours:F1}h at {NextAt}.", waitHours, nextAt);
                await Task.Delay(TimeSpan.FromHours(waitHours), stoppingToken);
            }

            if (!stoppingToken.IsCancellationRequested)
            {
                await TriggerScrapeAsync(stoppingToken);
                state.NextScrapeAt = DateTimeOffset.UtcNow.AddHours(intervalHours);
            }
        }
    }

    private async Task<double> GetFrequencyHoursAsync(CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient("RavenWatch");
            var response = await client.GetFromJsonAsync<PlatformSettings>("/api/v1/scrape/frequency", ct);
            state.LastBackendCheck = DateTimeOffset.UtcNow;
            state.BackendReachable = true;
            var hours = response?.ScraperFrequencyHours ?? 24;
            return Math.Max(1, hours);
        }
        catch (Exception ex)
        {
            state.LastBackendCheck = DateTimeOffset.UtcNow;
            state.BackendReachable = false;
            logger.LogWarning(ex, "Failed to fetch scraper frequency; defaulting to 24h.");
            return 24;
        }
    }

    private async Task<DateTimeOffset?> GetLastScrapeTimeAsync(CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient("RavenWatch");
            var response = await client.GetAsync("/api/v1/scrape/runs", ct);

            // If auth fails, assume a recent scrape to avoid a tight loop
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized ||
                response.StatusCode == System.Net.HttpStatusCode.Forbidden)
            {
                logger.LogWarning("Cannot check scrape history (auth error {Code}) — assuming recent run to avoid loop.", response.StatusCode);
                return DateTimeOffset.UtcNow;
            }

            response.EnsureSuccessStatusCode();
            var runs = await response.Content.ReadFromJsonAsync<ScrapeRun[]>(cancellationToken: ct);
            var last = runs?.FirstOrDefault();
            if (last?.StartedAt is not null)
            {
                state.LastScrapeAt = last.StartedAt;
                state.LastScrapeStatus = last.Status ?? "unknown";
                return last.StartedAt;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch last scrape run — assuming recent run to avoid loop.");
            // Return now so the worker waits a full interval before trying again
            return DateTimeOffset.UtcNow;
        }
        return null;
    }

    private async Task TriggerScrapeAsync(CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient("RavenWatch");
            var response = await client.PostAsync("/api/v1/scrape", null, ct);
            response.EnsureSuccessStatusCode();
            state.LastScrapeAt = DateTimeOffset.UtcNow;
            state.LastScrapeStatus = "triggered";
            logger.LogInformation("Scrape triggered at {Time}.", DateTimeOffset.UtcNow);
        }
        catch (Exception ex)
        {
            state.LastScrapeStatus = "failed";
            logger.LogError(ex, "Failed to trigger scrape.");
        }
    }

    private sealed class PlatformSettings
    {
        [JsonPropertyName("scraper_frequency_hours")]
        public double ScraperFrequencyHours { get; init; }
    }

    private sealed class ScrapeRun
    {
        [JsonPropertyName("started_at")]
        public DateTimeOffset? StartedAt { get; init; }

        [JsonPropertyName("status")]
        public string? Status { get; init; }
    }
}
