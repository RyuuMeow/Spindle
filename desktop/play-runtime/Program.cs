using System.Text.Json;
using System.Text.Json.Nodes;
using Yarn;
using Yarn.Compiler;
using Yarn.Markup;

// One private stdio helper per editor session. No disk or network commands.
var engine = new PlayEngine();
while (Console.ReadLine() is { } input)
{
    JsonNode? request = null;
    try
    {
        if (input.Length > 16_000_000) throw new Exception("REQUEST_TOO_LARGE");
        request = JsonNode.Parse(input) ?? throw new Exception("INVALID_REQUEST");
        var result = engine.Request(request);
        Console.WriteLine(new JsonObject { ["id"] = request["id"]?.DeepClone(), ["result"] = result }.ToJsonString());
    }
    catch (Exception error)
    {
        Console.WriteLine(new JsonObject { ["id"] = request?["id"]?.DeepClone(), ["error"] = error.Message }.ToJsonString());
    }
}

sealed class SnapshotRandom : Random
{
    public uint State = 123456789;
    protected override double Sample() { State ^= State << 13; State ^= State >> 17; State ^= State << 5; return State / 4294967296d; }
    public override double NextDouble() => Sample();
    public override int Next(int maxValue) => maxValue < 0 ? throw new ArgumentOutOfRangeException() : (int)(Sample() * maxValue);
}

sealed class PlayEngine
{
    readonly JsonSerializerOptions json = new() { IncludeFields = true };
    CompilationResult? program;
    Dialogue? dialogue;
    MemoryVariableStore store = new();
    SnapshotRandom random = new();
    JsonArray documents = new(), events = new(), options = new();
    JsonNode? location;
    string status = "idle", start = "";
    int revision, budget;
    readonly List<Checkpoint> history = new();
    Checkpoint? optionBase;
    readonly Dictionary<string, object> overrides = new();
    record Checkpoint(object Vm, Dictionary<string, object> Values, uint Random, JsonArray Events, JsonArray Options, string Status, JsonNode? Location, Checkpoint? OptionOrigin, Dictionary<string, object> Overrides);

    public JsonNode Request(JsonNode request)
    {
        var action = request["action"]?.GetValue<string>();
        if (action == "compile")
        {
            documents = (JsonArray)request["documents"]!.DeepClone();
            var job = CompilationJob.CreateFromString("", "");
            job.Inputs = documents.Select(d => new CompilationJob.File { FileName = d!["id"]!.GetValue<string>(), Source = d["text"]!.GetValue<string>() }).ToArray();
            program = Compiler.Compile(job);
            dialogue = null; events.Clear(); options.Clear(); history.Clear();
            status = program.ContainsErrors ? "error" : "ready";
        }
        else if (action == "start")
        {
            if (program?.Program == null || program.ContainsErrors) throw new Exception("PROGRAM_NOT_COMPILED");
            start = request["scene"]?.GetValue<string>() ?? start;
            if (!program.Program.Nodes.ContainsKey(start)) throw new Exception("SCENE_NOT_FOUND");
            store = new(); random = new(); overrides.Clear(); SpindleRandom.Source = random;
            dialogue = new Dialogue(store);
            dialogue.SetProgram(program.Program);
            events.Clear(); options.Clear(); history.Clear(); optionBase = null;
            dialogue.DebugBeforeInstruction = (node, index, instruction) => {
                if (--budget < 0) throw new Exception("INSTRUCTION_BUDGET_EXCEEDED");
                var info = program.ProjectDebugInfo?.GetNodeDebugInfo(node)?.GetLineInfo(index);
                if (info is { } source && source.Range.IsValid) location = Source(source.FileName, source.Range.Start.Line + 1, source.Range.Start.Character + 1);
                if (optionBase == null && location != null && SourceText(location).TrimStart().StartsWith("->")) optionBase = Capture();
                if (instruction.InstructionTypeCase == Instruction.InstructionTypeOneofCase.JumpIfFalse)
                    Add("condition", dialogue.DebugConditionValue() ? "true" : "false", location);
            };
            dialogue.LineHandler = line => { options.Clear(); Add("line", Render(line), LineSource(line)); status = "line"; };
            dialogue.CommandHandler = command => { Add("command", command.Text, location); status = "command"; };
            dialogue.OptionsHandler = set => {
                options = new JsonArray(set.Options.Select(o => (JsonNode)new JsonObject { ["id"] = o.ID, ["text"] = Render(o.Line), ["available"] = o.IsAvailable, ["source"] = LineSource(o.Line) }).ToArray());
                Add("options", "", location); status = "options";
            };
            dialogue.NodeStartHandler = node => Add("scene", node, null);
            dialogue.DialogueCompleteHandler = () => status = "completed";
            dialogue.SetNode(start); Advance(); history.Add(Capture());
        }
        else if (action is "next" or "choose")
        {
            if (dialogue == null) throw new Exception("PLAY_NOT_STARTED");
            if (action == "choose")
            {
                var id = request["optionId"]!.GetValue<int>();
                if (status != "options" || !options.Any(o => o!["id"]!.GetValue<int>() == id && o["available"]!.GetValue<bool>())) throw new Exception("OPTION_NOT_AVAILABLE");
                Add("choice", options.First(o => o!["id"]!.GetValue<int>() == id)!["text"]!.GetValue<string>(), location);
                dialogue.SetSelectedOption(id); optionBase = null; overrides.Clear();
            }
            else if (status != "line") throw new Exception("CANNOT_ADVANCE");
            Advance(); history.Add(Capture());
        }
        else if (action == "back")
        {
            if (history.Count < 2) throw new Exception("NO_PREVIOUS_STOP");
            history.RemoveAt(history.Count - 1); Restore(history[^1]);
        }
        else if (action == "setVariable")
        {
            if (dialogue == null || status is not ("line" or "options")) throw new Exception("PLAY_NOT_PAUSED");
            var name = request["name"]!.GetValue<string>();
            var declaration = program!.Declarations.FirstOrDefault(d => d.Name == name) ?? throw new Exception("VARIABLE_NOT_FOUND");
            if (store.GetVariableKind(name) != VariableKind.Stored) throw new Exception("VARIABLE_READ_ONLY");
            object value = declaration.Type == Types.Number ? request["value"]!.GetValue<float>()
                : declaration.Type == Types.Boolean ? request["value"]!.GetValue<bool>()
                : declaration.Type == Types.String ? request["value"]!.GetValue<string>()
                : throw new Exception("VARIABLE_TYPE_UNSUPPORTED");
            overrides[name] = value;
            if (status == "options" && optionBase != null) {
                var origin = optionBase; var changes = new Dictionary<string, object>(overrides);
                Restore(origin); optionBase = origin;
                foreach (var pair in changes) { overrides[pair.Key] = pair.Value; Set(pair.Key, pair.Value); }
                Advance();
            }
            else Set(name, value);
            Add("override", name + " = " + value, null);
            history.Add(Capture());
        }
        else if (action == "stop") { dialogue?.Stop(); status = "stopped"; }
        else if (action != "state") throw new Exception("UNKNOWN_ACTION");
        if (action != "state") revision++;
        return State();
    }
    void Set(string name, object value) { if (value is float number) store.SetValue(name, number); else if (value is bool boolean) store.SetValue(name, boolean); else store.SetValue(name, (string)value); }
    void Advance()
    {
        budget = 100_000;
        try { do { var before = store.CaptureDebugValues(); dialogue!.Continue(); foreach (var pair in store.CaptureDebugValues()) if (!before.TryGetValue(pair.Key, out var previous) || !Equals(previous, pair.Value)) Add("variable", pair.Key + " = " + pair.Value, location); } while (status == "command"); }
        catch (Exception e) { status = "error"; Add("error", e.Message, location); }
    }
    Checkpoint Capture() => new(dialogue!.CaptureDebugState(), store.CaptureDebugValues(), random.State, (JsonArray)events.DeepClone(), (JsonArray)options.DeepClone(), status, location?.DeepClone(), optionBase, new Dictionary<string, object>(overrides));
    void Restore(Checkpoint s) { dialogue!.RestoreDebugState(s.Vm); store.RestoreDebugValues(s.Values); random.State = s.Random; events = (JsonArray)s.Events.DeepClone(); options = (JsonArray)s.Options.DeepClone(); status = s.Status; location = s.Location?.DeepClone(); optionBase = s.OptionOrigin; overrides.Clear(); foreach (var pair in s.Overrides) overrides[pair.Key] = pair.Value; }
    void Add(string kind, string text, JsonNode? source) => events.Add(new JsonObject { ["id"] = events.Count + 1, ["kind"] = kind, ["text"] = text, ["source"] = source?.DeepClone() });
    string Render(Line line) => LineParser.ExpandSubstitutions(program!.StringTable![line.ID].text!, line.Substitutions);
    JsonNode? LineSource(Line line) { var info = program!.StringTable![line.ID]; return Source(info.fileName, info.lineNumber, 1); }
    JsonNode? Source(string? id, int line, int column)
    {
        var doc = documents.FirstOrDefault(d => d!["id"]!.GetValue<string>() == id);
        if (doc == null) return null;
        var text = doc["text"]!.GetValue<string>(); var offset = 0;
        for (var i = 1; i < line; i++) { var end = text.IndexOf('\n', offset); if (end < 0) break; offset = end + 1; }
        return new JsonObject { ["documentId"] = id, ["version"] = doc["version"]!.DeepClone(), ["line"] = line, ["column"] = column, ["from"] = Math.Min(text.Length, offset + column - 1) };
    }
    string SourceText(JsonNode source) => documents.First(d => d!["id"]!.GetValue<string>() == source["documentId"]!.GetValue<string>())!["text"]!.GetValue<string>().Split('\n').ElementAtOrDefault(source["line"]!.GetValue<int>() - 1) ?? "";
    JsonNode State()
    {
        var variables = new JsonArray();
        if (dialogue != null && program != null) foreach (var d in program.Declarations.Where(d => d.Name.StartsWith('$'))) {
            object? value = null;
            if (d.Type == Types.Number && store.TryGetValue<float>(d.Name, out var n)) value = n;
            else if (d.Type == Types.Boolean && store.TryGetValue<bool>(d.Name, out var b)) value = b;
            else if (d.Type == Types.String && store.TryGetValue<string>(d.Name, out var s)) value = s;
            variables.Add(new JsonObject { ["name"] = d.Name, ["type"] = d.Type.Name, ["value"] = JsonSerializer.SerializeToNode(value), ["initial"] = JsonSerializer.SerializeToNode((object?)d.DefaultValue), ["editable"] = store.GetVariableKind(d.Name) == VariableKind.Stored, ["source"] = Source(d.SourceFileName, d.SourceFileLine + 1, 1) });
        }
        return new JsonObject {
            ["protocolVersion"] = 1, ["revision"] = revision, ["status"] = status,
            ["scene"] = dialogue?.CurrentNode ?? start, ["canBack"] = history.Count > 1,
            ["events"] = events.DeepClone(), ["options"] = options.DeepClone(), ["variables"] = variables,
            ["scenes"] = JsonSerializer.SerializeToNode(program?.NodeMetadata.Select(n => n.Title).Distinct().ToArray() ?? Array.Empty<string>()),
            ["diagnostics"] = JsonSerializer.SerializeToNode(program?.Diagnostics.Select(d => new { message = d.Message, severity = d.Severity.ToString(), source = Source(d.FileName, d.Range.Start.Line + 1, d.Range.Start.Character + 1) }).ToArray()),
        };
    }
}
