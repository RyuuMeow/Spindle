// Spindle debug adapter. Upstream runtime evaluation is unchanged.
// MIT; see ../LICENSE.md.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Yarn
{
    public partial class MemoryVariableStore
    {
        public Dictionary<string, object> CaptureDebugValues() => new Dictionary<string, object>(variables);
        public void RestoreDebugValues(Dictionary<string, object> values)
        {
            variables.Clear();
            foreach (var entry in values) variables.Add(entry.Key, entry.Value);
        }
    }
    public static class SpindleRandom
    {
        public static Random Source { get; set; } = new Random();
    }
    internal partial class VirtualMachine
    {
        internal Action<string, int, Instruction>? BeforeInstruction;
        internal Action<Instruction>? AfterInstruction;
        internal partial class State
        {
            internal State Copy()
            {
                var copy = new State {
                    currentNodeName = currentNodeName, programCounter = programCounter,
                    currentOptions = new List<PendingOption>(currentOptions),
                    stack = new Stack<Value>(stack.Reverse()),
                };
                foreach (var frame in callStack.Reverse()) copy.callStack.Push(frame);
                return copy;
            }
        }
        internal sealed class Snapshot
        {
            internal State State = new State();
            internal ExecutionState Execution;
            internal Node? Node;
        }
        internal Snapshot Capture() => new Snapshot { State = state.Copy(), Execution = _executionState, Node = currentNode };
        internal void Restore(Snapshot saved)
        {
            if (isContinuing) throw new InvalidOperationException("Cannot restore while running");
            state = saved.State.Copy();
            currentNode = saved.Node;
            _executionState = saved.Execution == ExecutionState.Running ? ExecutionState.WaitingForContinue : saved.Execution;
        }
    }
    public partial class Dialogue
    {
        public Action<string, int, Instruction>? DebugBeforeInstruction { set => vm.BeforeInstruction = value; }
        public Action<Instruction>? DebugAfterInstruction { set => vm.AfterInstruction = value; }
        // Only called after the host validates a stack-neutral source entry.
        public void SetDebugEntry(int instruction) {
            if (vm.currentNode == null || instruction < 0 || instruction >= vm.currentNode.Instructions.Count)
                throw new ArgumentOutOfRangeException(nameof(instruction));
            vm.state.programCounter = instruction;
        }
        public object CaptureDebugState() => vm.Capture();
        public bool DebugConditionValue() => vm.state.PeekValue().ConvertTo<bool>();
        public void RestoreDebugState(object state) => vm.Restore((VirtualMachine.Snapshot)state);
    }
}
