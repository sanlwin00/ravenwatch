namespace RavenWatch.Worker;

/// <summary>
/// Singleton in-memory state shared between the worker and the health endpoint.
/// </summary>
public sealed class WorkerState
{
    public DateTimeOffset? LastBackendCheck { get; set; }
    public bool BackendReachable { get; set; }
    public DateTimeOffset? LastScrapeAt { get; set; }
    public DateTimeOffset? NextScrapeAt { get; set; }
    public string LastScrapeStatus { get; set; } = "unknown";
}
