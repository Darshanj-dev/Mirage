// Settings and statistics: small JSON files in %APPDATA%\MIRAGE that never contain prompt text
// or values (switches and counts only). A damaged file is replaced by defaults, never a crash.
using System.Text.Json;
using Mirage.Core;

namespace Mirage.Desktop;

internal sealed class DesktopSettings
{
    public bool ProtectionOn { get; set; } = true;
    public bool StartAtLogin { get; set; }
    public bool OnboardingDone { get; set; }
    public Dictionary<string, bool> Apps { get; set; } = new() { ["ChatGpt"] = true, ["Claude"] = true };
    public DetectionSettings Detection { get; set; } = new();
    public PolicySettings Policy { get; set; } = new();
    public bool AppEnabled(AppId id) => Apps.TryGetValue(id.ToString(), out var on) && on;
}

internal sealed class Counts
{
    public int Checked { get; set; }
    public int Held { get; set; }
    public int ProtectedSends { get; set; }
    public int Masked { get; set; }
    public int SecretsRemoved { get; set; }
    public int Cancelled { get; set; }
    public int SentAnyway { get; set; }
    public Dictionary<string, int> ByCategory { get; set; } = new();

    public void Add(Counts d)
    {
        Checked += d.Checked; Held += d.Held; ProtectedSends += d.ProtectedSends; Masked += d.Masked;
        SecretsRemoved += d.SecretsRemoved; Cancelled += d.Cancelled; SentAnyway += d.SentAnyway;
        foreach (var (k, v) in d.ByCategory) ByCategory[k] = ByCategory.GetValueOrDefault(k) + v;
    }
}

internal sealed class Stats
{
    public string Day { get; set; } = "";
    public Counts Today { get; set; } = new();
    public Counts Total { get; set; } = new();

    public void Record(Counts delta)
    {
        var today = DateTime.Now.ToString("yyyy-MM-dd");
        if (Day != today) { Day = today; Today = new Counts(); }
        Today.Add(delta);
        Total.Add(delta);
    }
}

internal sealed class JsonStore<T> where T : new()
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _path;
    public bool RecoveredFromDamage { get; private set; }

    public static string Directory
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MIRAGE");
            System.IO.Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public JsonStore(string name) { _path = Path.Combine(Directory, name); }

    public T Load()
    {
        if (!File.Exists(_path)) return new T();
        try { return JsonSerializer.Deserialize<T>(File.ReadAllText(_path), Options) ?? new T(); }
        catch
        {
            try { File.Move(_path, _path + ".damaged", overwrite: true); } catch { }
            RecoveredFromDamage = true;
            return new T();
        }
    }

    public void Save(T value)
    {
        var tmp = _path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, Options));
        File.Move(tmp, _path, overwrite: true);
    }
}
