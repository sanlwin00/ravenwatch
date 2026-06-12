using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace RavenWatch.Worker;

public class Worker(ILogger<Worker> logger, IHttpClientFactory httpClientFactory)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("RavenWatch scrape worker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            var intervalHours = await GetFrequencyHoursAsync(stoppingToken);
            logger.LogInformation("Next scrape in {Hours}h.", intervalHours);

            using var timer = new PeriodicTimer(TimeSpan.FromHours(intervalHours));
            if (!await timer.WaitForNextTickAsync(stoppingToken))
                break;

            await TriggerScrapeAsync(stoppingToken);
        }
    }

    private async Task<double> GetFrequencyHoursAsync(CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient("RavenWatch");
            var response = await client.GetFromJsonAsync<PlatformSettings>("/api/v1/scrape/frequency", ct);
            var hours = response?.ScraperFrequencyHours ?? 24;
            return Math.Max(1, hours);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch scraper frequency; defaulting to 24h.");
            return 24;
        }
    }

    private async Task TriggerScrapeAsync(CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient("RavenWatch");
            var response = await client.PostAsync("/api/v1/scrape", null, ct);
            response.EnsureSuccessStatusCode();
            logger.LogInformation("Scrape triggered successfully at {Time}.", DateTimeOffset.UtcNow);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to trigger scrape.");
        }
    }

    private sealed class PlatformSettings
    {
        [JsonPropertyName("scraper_frequency_hours")]
        public double ScraperFrequencyHours { get; init; }
    }
}
