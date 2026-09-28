using System.Text.Json;
using System.Text.Json.Nodes;
using Yarn;
using Yarn.Compiler;
using Yarn.Markup;
using System.Text;
using System.Collections.Immutable;

// One private stdio helper per editor session. No disk or network commands.
Console.InputEncoding = new UTF8Encoding(false);
Console.OutputEncoding = new UTF8Encoding(false);
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
    JsonArray documents = new(), options = new();
    ImmutableList<JsonNode> events = ImmutableList<JsonNode>.Empty;
    JsonNode? location;
    string status = "idle", start = "";
    int revision, budget;
    object? previousAssignment;
    readonly List<Checkpoint> history = new();
    Checkpoint? optionBase;
    readonly Dictionary<string, object> overrides = new();
    record Checkpoint(object Vm, Dictionary<string, object> Values, uint Random, ImmutableList<JsonNode> Events, JsonArray Options, string Status, JsonNode? Location, Checkpoint? OptionOrigin, Dictionary<string, object> Overrides);

    public JsonNode Request(JsonNode request)
    {
        var action = request["action"]?.GetValue<string>();
        if (action == "compile")
        {
            documents = (JsonArray)request["documents"]!.DeepClone();
            var job = CompilationJob.CreateFromString("", "", new Dialogue(new MemoryVariableStore()).Library);
            job.Inputs = documents.Select(d => new CompilationJob.File { FileName = d!["id"]!.GetValue<string>(), Source = CompilerSource(d["text"]!.GetValue<string>()) }).ToArray();
            program = Compiler.Compile(job);
            dialogue = null; events = events.Clear(); options.Clear(); history.Clear();
            status = program.ContainsErrors ? "error" : "ready";
        }
        else if (action == "start")
        {
            if (program?.Program == null || program.ContainsErrors) throw new Exception("PROGRAM_NOT_COMPILED");
            var requestedStart = request["scene"]?.GetValue<string>() ?? start;
            if (!program.Program.Nodes.ContainsKey(requestedStart)) throw new Exception("SCENE_NOT_FOUND");
            int? entry = null;
            if (request["location"] is { } target) entry = SafeEntry(target, requestedStart);
            start = requestedStart;
            store = new(); random = new(); overrides.Clear(); SpindleRandom.Source = random;
            dialogue = new Dialogue(store);
            dialogue.SetProgram(program.Program);
            events = events.Clear(); options.Clear(); history.Clear(); optionBase = null;
            dialogue.DebugBeforeInstruction = (node, index, instruction) => {
                if (--budget < 0) throw new Exception("INSTRUCTION_BUDGET_EXCEEDED");
                var info = program.ProjectDebugInfo?.GetNodeDebugInfo(node)?.GetLineInfo(index);
                location = info is { } source && source.Range.IsValid ? Source(source.FileName, source.Range.Start.Line + 1, source.Range.Start.Character + 1) : null;
                if (optionBase == null && location != null && SourceText(location).TrimStart().StartsWith("->")) optionBase = Capture();
                if (instruction.InstructionTypeCase == Instruction.InstructionTypeOneofCase.JumpIfFalse)
                    Add("condition", dialogue.DebugConditionValue() ? "true" : "false", location);
                if (instruction.InstructionTypeCase == Instruction.InstructionTypeOneofCase.StoreVariable)
                    previousAssignment = VariableValue(instruction.StoreVariable.VariableName);
            };
            dialogue.LineHandler = line => { options.Clear(); Add("line", Render(line), LineSource(line)); status = "line"; };
            dialogue.DebugAfterInstruction = instruction => {
                if (instruction.InstructionTypeCase == Instruction.InstructionTypeOneofCase.StoreVariable) {
                    var name = instruction.StoreVariable.VariableName;
                    if (!name.StartsWith("$Yarn.Internal.")) Add("variable", name + ": " + JsonSerializer.Serialize(previousAssignment) + " → " + JsonSerializer.Serialize(VariableValue(name)), location);
                }
                if (instruction.InstructionTypeCase is Instruction.InstructionTypeOneofCase.RunNode or Instruction.InstructionTypeOneofCase.DetourToNode or Instruction.InstructionTypeOneofCase.PeekAndRunNode or Instruction.InstructionTypeOneofCase.PeekAndDetourToNode)
                    Add("transfer", dialogue.CurrentNode ?? "", location);
            };
            dialogue.CommandHandler = command => { Add("command", command.Text, location); status = "command"; };
            dialogue.OptionsHandler = set => {
                options = new JsonArray(set.Options.Select(o => (JsonNode)new JsonObject { ["id"] = o.ID, ["text"] = Render(o.Line), ["available"] = o.IsAvailable, ["source"] = LineSource(o.Line) }).ToArray());
                Add("options", "", location); status = "options";
            };
            dialogue.NodeStartHandler = node => { var metadata = program.NodeMetadata.FirstOrDefault(n => n.Title == node || n.UniqueTitle == node); Add("scene", node, metadata == null ? null : Source(metadata.Uri, metadata.TitleLine + 1, 1)); };
            dialogue.DialogueCompleteHandler = () => status = "completed";
            dialogue.SetNode(start); if (entry is { } index) dialogue.SetDebugEntry(index); Advance(); history.Add(Capture());
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
            var previous = VariableValue(name);
            overrides[name] = value;
            if (status == "options" && optionBase != null) {
                var origin = optionBase; var changes = new Dictionary<string, object>(overrides);
                Restore(origin); optionBase = origin;
                foreach (var pair in changes) { overrides[pair.Key] = pair.Value; Set(pair.Key, pair.Value); }
                Advance();
            }
            else Set(name, value);
            Add("override", name + ": " + JsonSerializer.Serialize(previous) + " → " + JsonSerializer.Serialize(value), Source(declaration.SourceFileName, declaration.SourceFileLine + 1, 1));
            history.Add(Capture());
        }
        else if (action == "stop") { dialogue?.Stop(); status = "stopped"; }
        else if (action != "state") throw new Exception("UNKNOWN_ACTION");
        if (action != "state") revision++;
        return State();
    }
    int SafeEntry(JsonNode target, string scene)
    {
        var id = target["documentId"]!.GetValue<string>();
        var line = target["line"]!.GetValue<int>();
        var doc = documents.FirstOrDefault(d => d!["id"]!.GetValue<string>() == id) ?? throw new Exception("PLAY_LINE_NOT_EXECUTABLE");
        var lines = doc["text"]!.GetValue<string>().Split('\n');
        if (line < 1 || line > lines.Length) throw new Exception("PLAY_LINE_NOT_EXECUTABLE");
        var text = lines[line - 1].Trim();
        // Use the official syntax tree to identify a top-level dialogue statement.
        // A branch elsewhere in the node does not make this entry unsafe. Nested
        // statements and inline conditions may depend on prior stack/control state.
        var syntax = Utility.ParseSourceText(doc["text"]!.GetValue<string>(), id);
        var sourceLine = Compiler.FlattenParseTree(syntax.Tree)
            .OfType<YarnSpinnerParser.Line_statementContext>()
            .SingleOrDefault(statement => statement.Start.Line == line);
        if (text.Length == 0 || sourceLine == null || sourceLine.line_condition() != null ||
            sourceLine.Parent is not YarnSpinnerParser.StatementContext ||
            sourceLine.Parent.Parent is not YarnSpinnerParser.BodyContext)
            throw new Exception("PLAY_LINE_NOT_EXECUTABLE");
        var node = program!.Program!.Nodes[scene];
        var matches = node.Instructions.Select((instruction, index) => (instruction, index)).Where(pair => {
            if (pair.instruction.InstructionTypeCase != Instruction.InstructionTypeOneofCase.RunLine || pair.instruction.RunLine.SubstitutionCount != 0) return false;
            var info = program.StringTable![pair.instruction.RunLine.LineID];
            return info.fileName == id && info.lineNumber == line;
        }).ToArray();
        if (matches.Length != 1) throw new Exception("PLAY_LINE_NOT_EXECUTABLE");
        return matches[0].index;
    }
    void Set(string name, object value) { if (value is float number) store.SetValue(name, number); else if (value is bool boolean) store.SetValue(name, boolean); else store.SetValue(name, (string)value); }
    object? VariableValue(string name) {
        var declaration = program?.Declarations.FirstOrDefault(d => d.Name == name);
        if (declaration?.Type == Types.Number && store.TryGetValue<float>(name, out var n)) return n;
        if (declaration?.Type == Types.Boolean && store.TryGetValue<bool>(name, out var b)) return b;
        if (declaration?.Type == Types.String && store.TryGetValue<string>(name, out var s)) return s;
        return null;
    }
    void Advance()
    {
        budget = 100_000;
        try { do { dialogue!.Continue(); } while (status == "command"); }
        catch (Exception e) { status = "error"; Add("error", e.Message, location); }
    }
    Checkpoint Capture() => new(dialogue!.CaptureDebugState(), store.CaptureDebugValues(), random.State, events, (JsonArray)options.DeepClone(), status, location?.DeepClone(), optionBase, new Dictionary<string, object>(overrides));
    void Restore(Checkpoint s) { dialogue!.RestoreDebugState(s.Vm); store.RestoreDebugValues(s.Values); random.State = s.Random; events = s.Events; options = (JsonArray)s.Options.DeepClone(); status = s.Status; location = s.Location?.DeepClone(); optionBase = s.OptionOrigin; overrides.Clear(); foreach (var pair in s.Overrides) overrides[pair.Key] = pair.Value; }
    void Add(string kind, string text, JsonNode? source) {
        if (events.Count >= 10000 && kind != "error") throw new Exception("PLAY_EVENT_LIMIT_EXCEEDED");
        events = events.Add(new JsonObject { ["id"] = events.Count + 1, ["kind"] = kind, ["text"] = text, ["source"] = source?.DeepClone() });
    }
    // Memory inputs retain the UTF-8 BOM that file-based readers normally consume.
    // Use one whitespace code unit so every source offset still addresses the original snapshot.
    static string CompilerSource(string text) => text.StartsWith('\uFEFF') ? " " + text[1..] : text;
    string Render(Line line) => LineParser.ExpandSubstitutions(program!.StringTable![line.ID].text!, line.Substitutions);
    JsonNode? LineSource(Line line) { var info = program!.StringTable![line.ID]; return Source(info.fileName, info.lineNumber, 1); }
    JsonNode? Source(string? id, int line, int column)
    {
        if (line < 1 || column < 1) return null;
        var doc = documents.FirstOrDefault(d => d!["id"]!.GetValue<string>() == id);
        if (doc == null) return null;
        var text = doc["text"]!.GetValue<string>(); var offset = 0;
        for (var i = 1; i < line; i++) { var end = text.IndexOf('\n', offset); if (end < 0) break; offset = end + 1; }
        var utf16Column = text.AsSpan(offset).ToString().Split('\n')[0].EnumerateRunes().Take(column - 1).Sum(r => r.Utf16SequenceLength) + 1;
        return new JsonObject { ["documentId"] = id, ["version"] = doc["version"]!.DeepClone(), ["line"] = line, ["column"] = utf16Column, ["from"] = Math.Min(text.Length, offset + utf16Column - 1) };
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
            ["events"] = new JsonArray(events.Select(e => e.DeepClone()).ToArray()), ["options"] = options.DeepClone(), ["variables"] = variables,
            ["scenes"] = JsonSerializer.SerializeToNode(program?.NodeMetadata.Select(n => n.Title).Distinct().ToArray() ?? Array.Empty<string>()),
            ["diagnostics"] = JsonSerializer.SerializeToNode(program?.Diagnostics.Select(d => new { message = d.Message, severity = d.Severity.ToString(), source = Source(d.FileName, d.Range.Start.Line + 1, d.Range.Start.Character + 1) }).ToArray()),
        };
    }
}
