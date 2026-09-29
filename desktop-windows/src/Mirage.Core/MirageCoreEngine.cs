// Runs MIRAGE Core (mirage-core.js, embedded) inside Jint. One engine, used from one thread at a
// time (a lock), with JSON in and JSON out. Nothing here logs text or values.

using System.Reflection;
using System.Text.Json;
using Jint;

namespace Mirage.Core;

public sealed class MirageCoreException(string message) : Exception(message);

public sealed class MirageCoreEngine
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly Engine _engine;
    private readonly object _lock = new();
    private string? _tokenState; // placeholder map for this session only, in memory

    public string Version { get; }

    public MirageCoreEngine(string? scriptSource = null)
    {
        var source = scriptSource ?? LoadEmbeddedScript();
        _engine = new Engine(o => o.Strict(false).LimitRecursion(512));
        try
        {
            _engine.Execute(source);
            Version = _engine.Evaluate("MirageCore.CORE_VERSION").AsString();
        }
        catch (Exception e)
        {
            throw new MirageCoreException("MIRAGE Core failed to load: " + e.GetType().Name);
        }
    }

    public static string LoadEmbeddedScript()
    {
        using var stream = typeof(MirageCoreEngine).Assembly.GetManifestResourceStream("mirage-core.js")
            ?? throw new MirageCoreException("mirage-core.js is not embedded");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private string Call(string expression, params (string Name, string Value)[] args)
    {
        lock (_lock)
        {
            try
            {
                foreach (var (name, value) in args) _engine.SetValue(name, value);
                return _engine.Evaluate(expression).AsString();
            }
            catch (Exception e)
            {
                // The exception text could quote input: report its type only.
                throw new MirageCoreException("MIRAGE Core call failed: " + e.GetType().Name);
            }
        }
    }

    public Analysis Analyze(string text, DetectionSettings? settings = null, PolicySettings? policy = null)
    {
        var json = Call("JSON.stringify(MirageCore.analyze(__text, JSON.parse(__settings), JSON.parse(__policy)))",
            ("__text", text), ("__settings", JsonSerializer.Serialize(settings ?? new(), Json)), ("__policy", JsonSerializer.Serialize(policy ?? new(), Json)));
        return JsonSerializer.Deserialize<Analysis>(json, Json) ?? Analysis.Empty;
    }

    /// The protected prompt. Placeholders for personal details are remembered for this session
    /// (in memory), so the same value keeps the same placeholder across prompts.
    public Protection Protect(string text, DetectionSettings? settings = null, IEnumerable<int>? keep = null)
    {
        string state;
        lock (_lock) state = _tokenState ?? "null";
        var json = Call("JSON.stringify(MirageCore.protect(__text, JSON.parse(__settings), JSON.parse(__state), JSON.parse(__keep)))",
            ("__text", text), ("__settings", JsonSerializer.Serialize(settings ?? new(), Json)), ("__state", state),
            ("__keep", JsonSerializer.Serialize(keep?.ToArray() ?? Array.Empty<int>())));
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        lock (_lock) _tokenState = root.GetProperty("state").GetRawText();
        return new Protection(root.GetProperty("text").GetString() ?? "", root.GetProperty("hidden").GetInt32(), root.GetProperty("removed").GetInt32());
    }

    public Analysis CheckReply(string text, DetectionSettings? settings = null)
    {
        var json = Call("JSON.stringify(MirageCore.checkReply(__text, JSON.parse(__settings), []))",
            ("__text", text), ("__settings", JsonSerializer.Serialize(settings ?? new(), Json)));
        return JsonSerializer.Deserialize<Analysis>(json, Json) ?? Analysis.Empty;
    }

    public void ClearSession() { lock (_lock) _tokenState = null; }
}
