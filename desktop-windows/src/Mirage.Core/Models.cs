// .NET mirrors of the MIRAGE Core types (lib/detector/types.ts, lib/risk.ts, lib/core/api.ts).
// Values arrive from the shared TypeScript core as JSON; nothing here re-implements detection.

using System.Text.Json.Serialization;

namespace Mirage.Core;

public sealed record Finding(
    string Type,
    int Start, // UTF-16 offset, like JavaScript and .NET strings
    int End,
    string Value, // raw value: memory only, never logged, never stored, never shown in full
    string Policy, // mask | block | warn
    string Category,
    string Severity, // low | medium | high | critical
    double Confidence,
    string Reason,
    string? Kind,
    string? Context,
    string Redacted)
{
    public bool IsActionable => Policy != "warn";
}

public sealed record RiskLine(string Label, int Points, int? Count);

public sealed record Risk(int Score, string Level, IReadOnlyList<RiskLine> Lines, string? Worst);

public sealed record Analysis(IReadOnlyList<Finding> Findings, Risk Risk, string? Action)
{
    public static readonly Analysis Empty = new(Array.Empty<Finding>(), new Risk(0, "safe", Array.Empty<RiskLine>(), null), null);
    [JsonIgnore] public IEnumerable<Finding> Actionable => Findings.Where(f => f.IsActionable);
    [JsonIgnore] public bool HasCritical => Actionable.Any(f => f.Severity == "critical");
}

public sealed record Protection(string Text, int Hidden, int Removed);

public sealed class DetectionSettings
{
    public List<string> SafeWords { get; set; } = new();
    public List<string> AlwaysMask { get; set; } = new();
    public Dictionary<string, bool> Categories { get; set; } = new()
    {
        ["identity"] = true, ["contact"] = true, ["financial"] = true, ["credentials"] = true,
        ["apiKeys"] = true, ["location"] = true, ["health"] = true,
    };
}

public sealed class PolicySettings
{
    public string Low { get; set; } = "warn";
    public string Medium { get; set; } = "recommendMask";
    public string High { get; set; } = "protect";
    public string Critical { get; set; } = "confirm";
}
