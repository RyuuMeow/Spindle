"use client";
import { t as tr } from "./i18n/index.ts";

import {
  useCallback,
  useEffectEvent,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Plus,
  Trash2,
  Terminal,
  ArrowUp,
  ArrowDown,
  Check,
  CircleAlert,
  Copy,
  Undo2,
  Redo2,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/CompactSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { ControlTooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { type Command, type Param, validateCommand } from "./parser";
import "./controls.css";

export type CommandActions = {
  save: () => Promise<boolean>;
  discard: () => void;
  prepare: () => Command[] | null;
  focusError: () => void;
};

type CommandIssue = { message: string; field: string };
const emptyCommand = (): Command => ({
  name: "",
  description: "",
  params: [],
  example: "",
});

function commandIssue(
  command: Command,
  others: Command[],
): CommandIssue | null {
  const nameError = validateCommand({ ...command, params: [] }, others);
  if (nameError) {
    return {
      field: "name",
      message:
        nameError === tr("mb7b256c22693") ? tr("mc2ac8caa3e6c") : nameError,
    };
  }
  for (let i = 0; i < command.params.length; i++) {
    const message = validateCommand(
      { ...command, params: command.params.slice(0, i + 1) },
      others,
    );
    if (!message) continue;
    const param = command.params[i];
    const field =
      !/^[A-Za-z_]\w*$/.test(param.name) ||
      command.params.slice(0, i).some((p) => p.name === param.name)
        ? "name"
        : param.required
          ? "required"
          : "defaultValue";
    return {
      message: tr("mb29bde06c083", [i + 1, message]),
      field: `param-${i}-${field}`,
    };
  }
  return null;
}

export default function CommandManager({
  commands,
  onChange,
  notify,
  onDirtyChange,
  actionsRef,
  referenceCount,
  revealName,
  revealNonce,
}: {
  commands: Command[];
  onChange: (
    commands: Command[],
    expectedCommands?: string,
  ) => boolean | Promise<boolean>;
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  actionsRef: Ref<CommandActions>;
  referenceCount?: (name: string) => number;
  projectName?: string;
  revealName?: string;
  revealNonce?: number;
}) {
  const [index, setIndex] = useState(commands.length ? 0 : -1);
  const [draft, setDraft] = useState<Command>(() =>
    structuredClone(commands[0] || emptyCommand()),
  );
  const commandBase = useRef(JSON.stringify(commands));
  const [draftBase, setDraftBase] = useState(() =>
    JSON.stringify(commands[0] || emptyCommand()),
  );
  const [query, setQuery] = useState("");
  const matchesQuery = (command: Command) =>
    `${command.name} ${command.displayName || ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  const [history, setHistory] = useState<{
    past: Command[];
    future: Command[];
  }>({
    past: [],
    future: [],
  });
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<CommandIssue | null>(null);
  const [remove, setRemove] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const issueRef = useRef<CommandIssue | null>(null);
  const focusAfterSwitch = useRef(false);
  const formId = useId();
  const errorId = `${formId}-error`;
  const dirty = JSON.stringify(draft) !== draftBase;
  const draftIssue = commandIssue(
    draft,
    commands.filter((_, i) => i !== index),
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const reportIssue = useCallback((next: CommandIssue | null) => {
    issueRef.current = next;
    setIssue(next);
  }, []);

  const focusError = useCallback(() => {
    requestAnimationFrame(() => {
      const field = issueRef.current?.field;
      const element = field
        ? formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`)
        : null;
      const target =
        element ||
        formRef.current?.querySelector<HTMLElement>("[data-command-error]");
      target?.focus();
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);

  const choose = (nextIndex: number) => {
    commandBase.current = JSON.stringify(commands);
    setDraftBase(JSON.stringify(commands[nextIndex] || emptyCommand()));
    setHistory({ past: [], future: [] });
    setIndex(nextIndex);
    setDraft(structuredClone(commands[nextIndex] || emptyCommand()));
    reportIssue(null);
  };

  const save = useCallback(async () => {
    if (saving) return false;
    if (!dirty && index >= 0) return true;
    if (commandBase.current !== JSON.stringify(commands)) {
      reportIssue({ message: tr("m16d034be25d9"), field: "save" });
      return false;
    }
    const validation = commandIssue(
      draft,
      commands.filter((_, i) => i !== index),
    );
    if (validation) {
      reportIssue(validation);
      return false;
    }
    const next = commands.slice();
    if (index < 0) next.push(draft);
    else next[index] = draft;
    setSaving(true);
    try {
      if (!(await onChange(next, commandBase.current))) {
        reportIssue({
          message: tr("mf56188fe83d9"),
          field: "save",
        });
        return false;
      }
      commandBase.current = JSON.stringify(next);
      setDraftBase(JSON.stringify(draft));
      if (index < 0) setIndex(next.length - 1);
      reportIssue(null);
      notify(tr("ma54f2759e31c"));
      return true;
    } catch (error) {
      reportIssue({
        message: tr("m64bb491e7493") + String(error),
        field: "save",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [commands, dirty, draft, index, notify, onChange, reportIssue, saving]);

  useEffect(() => {
    const handler = () => {
      void save().then((ok) => {
        if (!ok) focusError();
      });
    };
    window.addEventListener("yarn-save-command", handler);
    return () => window.removeEventListener("yarn-save-command", handler);
  }, [save, focusError]);

  useImperativeHandle(actionsRef, () => ({
    save,
    focusError,
    discard: () => choose(index),
    prepare: () => {
      if (commandBase.current !== JSON.stringify(commands)) {
        reportIssue({ message: tr("m3ed3208b3335"), field: "save" });
        return null;
      }
      const validation = commandIssue(
        draft,
        commands.filter((_, i) => i !== index),
      );
      if (validation) {
        reportIssue(validation);
        return null;
      }
      reportIssue(null);
      return index < 0
        ? [...commands, draft]
        : commands.map((command, i) => (i === index ? draft : command));
    },
  }));

  const reveal = useEffectEvent((name: string) => {
    const next = commands.findIndex((c) => c.name === name);
    if (next < 0 || next === index) return;
    setQuery("");
    if (dirty) setPending(next);
    else choose(next);
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (revealName) reveal(revealName);
    });
    return () => cancelAnimationFrame(frame);
  }, [revealName, revealNonce]);

  const updateDraft = (next: Command) => {
    setHistory((h) => ({
      past: [...h.past, structuredClone(draft)],
      future: [],
    }));
    setDraft(next);
    if (issue)
      reportIssue(
        commandIssue(
          next,
          commands.filter((_, i) => i !== index),
        ),
      );
  };
  const updateParam = (paramIndex: number, patch: Partial<Param>) => {
    updateDraft({
      ...draft,
      params: draft.params.map((param, i) =>
        i === paramIndex ? { ...param, ...patch } : param,
      ),
    });
  };
  const moveParam = (paramIndex: number, direction: -1 | 1) => {
    const params = [...draft.params];
    [params[paramIndex], params[paramIndex + direction]] = [
      params[paramIndex + direction],
      params[paramIndex],
    ];
    updateDraft({ ...draft, params });
  };
  const undo = () => {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({
      past: history.past.slice(0, -1),
      future: [...history.future, draft],
    });
    setDraft(previous);
    if (issue)
      reportIssue(
        commandIssue(
          previous,
          commands.filter((_, i) => i !== index),
        ),
      );
  };
  const redo = () => {
    const next = history.future.at(-1);
    if (!next) return;
    setHistory({
      past: [...history.past, draft],
      future: history.future.slice(0, -1),
    });
    setDraft(next);
    if (issue)
      reportIssue(
        commandIssue(
          next,
          commands.filter((_, i) => i !== index),
        ),
      );
  };
  const fieldProps = (field: string) => ({
    "data-field": field,
    "aria-invalid": issue?.field === field || undefined,
    "aria-describedby": issue?.field === field ? errorId : undefined,
  });
  const renderError = () =>
    issue && (
      <span
        className="command-error"
        id={errorId}
        role="alert"
        tabIndex={-1}
        data-command-error
      >
        <CircleAlert size={16} />
        <span>{issue.message}</span>
      </span>
    );

  return (
    <div className="command-workspace">
      <aside className="command-list" aria-label={tr("m945e6f8b3e4e")}>
        <div className="section-heading">
          <span>{tr("m945e6f8b3e4e")}</span>
          <ControlTooltip label={tr("m05cc9992623a")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tr("m05cc9992623a")}
              disabled={saving}
              onClick={() => (dirty ? setPending(-1) : choose(-1))}
            >
              <Plus size={15} />
            </Button>
          </ControlTooltip>
        </div>
        <div className="node-search">
          <Search size={13} />
          <input
            aria-label={tr("m756605eb7a31")}
            placeholder={tr("m756605eb7a31")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {commands.map((command, i) => (
          <button
            type="button"
            hidden={!matchesQuery(command)}
            className={`command-row ${i === index ? "active" : ""}`}
            aria-current={i === index ? "true" : undefined}
            key={command.name}
            disabled={saving}
            onClick={() => {
              if (i !== index) {
                if (dirty) setPending(i);
                else choose(i);
              }
            }}
          >
            <Terminal size={15} />
            <span className="command-row-label">
              {command.displayName || command.name}
              {command.displayName && <small>{command.name}</small>}
            </span>
          </button>
        ))}
        {commands.length === 0 && (
          <p className="command-empty">{tr("m88c3c3d38f24")}</p>
        )}
        {!!commands.length && !commands.some(matchesQuery) && (
          <p className="command-empty">{tr("m46bcd0385c36")}</p>
        )}
      </aside>

      <form
        className="command-detail"
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          void save().then((ok) => {
            if (!ok) focusError();
          });
        }}
        noValidate
      >
        <div className="command-detail-heading">
          <div className="command-heading-label">
            <h2>
              {index < 0
                ? tr("m05cc9992623a")
                : commands[index]?.displayName ||
                  commands[index]?.name ||
                  tr("m7fc749991aed")}
            </h2>
            <span
              className={
                "command-save-state" + (dirty && draftIssue ? " invalid" : "")
              }
              role="status"
            >
              {saving
                ? tr("m9d4b7e145711")
                : dirty
                  ? draftIssue
                    ? tr("m2569bff0c51d")
                    : tr("m409d3ca3eede")
                  : index < 0
                    ? tr("m41f9c910c875")
                    : tr("mc0edb04e0855")}
            </span>
          </div>
          <div className="command-actions">
            <ControlTooltip label={tr("m31fb1c0d6810")}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={tr("m31fb1c0d6810")}
                disabled={!history.past.length || saving}
                onClick={undo}
              >
                <Undo2 size={15} />
              </Button>
            </ControlTooltip>
            <ControlTooltip label={tr("m368037a44b6a")}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={tr("m368037a44b6a")}
                disabled={!history.future.length || saving}
                onClick={redo}
              >
                <Redo2 size={15} />
              </Button>
            </ControlTooltip>
            <ControlTooltip label={tr("mf9b5c0b256f0")}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={tr("mf9b5c0b256f0")}
                disabled={!draft.name || saving}
                onClick={() => {
                  let name = (draft.name || "command") + "_copy",
                    i = 2;
                  while (commands.some((c) => c.name === name))
                    name = (draft.name || "command") + "_copy" + i++;
                  setIndex(-1);
                  setHistory({ past: [], future: [] });
                  setDraft({ ...structuredClone(draft), name });
                  reportIssue(null);
                }}
              >
                <Copy size={15} />
              </Button>
            </ControlTooltip>
            {index >= 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tr("m2deef2c2631b")}
                    disabled={saving}
                  >
                    <MoreHorizontal size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="desktop-menu">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      setRemoveError("");
                      setRemove(true);
                    }}
                  >
                    <Trash2 size={14} />
                    {tr("m7a80dc500e60")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="submit"
              disabled={!dirty || saving}
              {...fieldProps("save")}
            >
              <Check size={14} />
              {tr("mbde887e266e5")}
            </Button>
          </div>
        </div>
        <div className="command-form-body">
          {issue?.field === "save" && renderError()}
          <div className="command-identity">
            <label className="command-field" htmlFor={`${formId}-name`}>
              <span>{tr("mdc8f0070a144")}</span>
              <input
                id={`${formId}-name`}
                {...fieldProps("name")}
                aria-label={tr("mdc8f0070a144")}
                value={draft.name}
                placeholder={tr("m9043bba2a978")}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  updateDraft({ ...draft, name: event.target.value })
                }
              />
              {issue?.field === "name" && renderError()}
              {index >= 0 && draft.name !== commands[index]?.name && (
                <span className="command-field-hint">
                  {tr("m23f565688a5a")}
                  {referenceCount?.(commands[index].name) || 0}{" "}
                  {tr("m6fc9366abbea")}
                </span>
              )}
            </label>
            <label className="command-field" htmlFor={`${formId}-display-name`}>
              <span>
                {tr("m1d4052cd25f6")}
                <span className="command-optional">{tr("mefd49a86e463")}</span>
              </span>
              <input
                id={`${formId}-display-name`}
                aria-label={tr("m1d4052cd25f6")}
                value={draft.displayName || ""}
                placeholder={draft.name || tr("m46dc0a873ece")}
                onChange={(event) =>
                  updateDraft({ ...draft, displayName: event.target.value })
                }
              />
            </label>
          </div>
          <label className="command-field" htmlFor={`${formId}-description`}>
            <span>
              {tr("m6d3c9336bf4c")}
              <span className="command-optional">{tr("mefd49a86e463")}</span>
            </span>
            <textarea
              id={`${formId}-description`}
              rows={2}
              value={draft.description}
              onChange={(event) =>
                updateDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <div className="section-heading command-params-heading">
            <h3>{tr("m247f068716b3")}</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateDraft({
                  ...draft,
                  params: [
                    ...draft.params,
                    {
                      name: "",
                      type: "string",
                      required: true,
                      defaultValue: "",
                    },
                  ],
                })
              }
            >
              <Plus size={14} />
              {tr("mdc5c574311c2")}
            </Button>
          </div>
          <div className="params">
            {draft.params.length === 0 && (
              <p className="command-empty">{tr("mcc184a1bbdbc")}</p>
            )}
            {draft.params.map((param, i) => (
              <fieldset className="param" key={i}>
                <legend className="sr-only">
                  {tr("m247f068716b3")} {i + 1}
                </legend>
                <div className="param-top">
                  <label
                    className="command-field"
                    htmlFor={`${formId}-param-${i}-name`}
                  >
                    <span>{tr("mdc8f0070a144")}</span>
                    <input
                      id={`${formId}-param-${i}-name`}
                      {...fieldProps(`param-${i}-name`)}
                      aria-label={tr("meeb5cf1c3524", [i + 1])}
                      placeholder={tr("m2dfa55190d28")}
                      value={param.name}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) =>
                        updateParam(i, { name: event.target.value })
                      }
                    />
                  </label>
                  <label
                    className="command-field"
                    htmlFor={`${formId}-param-${i}-display-name`}
                  >
                    <span>
                      {tr("mbda532c613dd")}
                      <span className="command-optional">
                        {tr("mefd49a86e463")}
                      </span>
                    </span>
                    <input
                      id={`${formId}-param-${i}-display-name`}
                      aria-label={tr("m46c6e11e83df", [i + 1])}
                      value={param.displayName || ""}
                      placeholder={param.name || tr("ma657de974471")}
                      onChange={(event) =>
                        updateParam(i, { displayName: event.target.value })
                      }
                    />
                  </label>
                  <label
                    className="command-field"
                    htmlFor={`${formId}-param-${i}-type`}
                  >
                    <span>{tr("m3a5821e57dbf")}</span>
                    <CompactSelect
                      id={`${formId}-param-${i}-type`}
                      label={tr("m8cf4216a8657", [i + 1])}
                      value={param.type}
                      onChange={(value) =>
                        updateParam(i, { type: value as Param["type"] })
                      }
                      options={[
                        { value: "string", label: tr("m14b69bd6eeb0") },
                        { value: "number", label: tr("m365bd33d1106") },
                        { value: "boolean", label: tr("m797e0d9ba126") },
                      ]}
                    />
                  </label>
                  <div
                    className="param-order"
                    role="group"
                    aria-label={tr("m63d87fa75333", [i + 1])}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tr("m63d87fa75333", [i + 1])}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="desktop-menu">
                        <DropdownMenuItem
                          disabled={i === 0}
                          onSelect={() => moveParam(i, -1)}
                        >
                          <ArrowUp size={14} />
                          {tr("m7d840c6881d8")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={i === draft.params.length - 1}
                          onSelect={() => moveParam(i, 1)}
                        >
                          <ArrowDown size={14} />
                          {tr("m9d8f039ae485")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            updateDraft({
                              ...draft,
                              params: draft.params.filter((_, j) => j !== i),
                            })
                          }
                        >
                          <Trash2 size={14} />
                          {tr("m6b20c5e4849e")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="param-bottom">
                  <label
                    className="check"
                    htmlFor={`${formId}-param-${i}-required`}
                  >
                    <Checkbox
                      id={`${formId}-param-${i}-required`}
                      {...fieldProps(`param-${i}-required`)}
                      aria-label={tr("m6510be3e9e4e", [i + 1])}
                      checked={param.required}
                      onCheckedChange={(value) =>
                        updateParam(i, { required: value === true })
                      }
                    />
                    {tr("m11da9dc44285")}
                  </label>
                  <label
                    className="command-field command-default"
                    htmlFor={`${formId}-param-${i}-default`}
                  >
                    <span>{tr("m576a77a40390")}</span>
                    <input
                      id={`${formId}-param-${i}-default`}
                      {...fieldProps(`param-${i}-defaultValue`)}
                      aria-label={tr("md8c23c44ec67", [i + 1])}
                      placeholder={
                        param.type === "string"
                          ? tr("m25156232ded6")
                          : param.type === "number"
                            ? tr("m5c16379c34db")
                            : tr("mede25e9a6148")
                      }
                      value={param.defaultValue}
                      disabled={param.required}
                      onChange={(event) =>
                        updateParam(i, { defaultValue: event.target.value })
                      }
                    />
                  </label>
                </div>
                <details
                  className="param-description"
                  key={`description-${index}-${i}`}
                >
                  <summary>
                    {tr("m57ce93aa4f7f")}
                    <span className="command-optional">
                      {tr("mefd49a86e463")}
                    </span>
                    {param.description && (
                      <span className="param-description-present">
                        {tr("mfa3d8a8c01ea")}
                      </span>
                    )}
                  </summary>
                  <label
                    className="command-field"
                    htmlFor={`${formId}-param-${i}-description`}
                  >
                    <span className="sr-only">
                      {tr("m247f068716b3")} {i + 1} {tr("m6d3c9336bf4c")}
                    </span>
                    <textarea
                      id={`${formId}-param-${i}-description`}
                      rows={2}
                      aria-label={tr("m7d8625b350e3", [i + 1])}
                      value={param.description || ""}
                      onChange={(event) =>
                        updateParam(i, { description: event.target.value })
                      }
                    />
                  </label>
                </details>
                {issue?.field.startsWith(`param-${i}-`) && renderError()}
              </fieldset>
            ))}
          </div>
          <label className="command-field" htmlFor={`${formId}-example`}>
            <span>
              {tr("m991e00cf35e4")}
              <span className="command-optional">{tr("mefd49a86e463")}</span>
            </span>
            <input
              id={`${formId}-example`}
              className="mono"
              value={draft.example}
              placeholder={`<<${draft.name || "command"}>>`}
              spellCheck={false}
              onChange={(event) =>
                updateDraft({ ...draft, example: event.target.value })
              }
            />
          </label>
        </div>
      </form>

      <AlertDialog open={remove} onOpenChange={setRemove}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {tr("m3c8f5b363ab3")}
            {commands[index]?.name || draft.name}？
          </AlertDialogTitle>
          <AlertDialogDescription>{tr("mbcac2c4bcdab")}</AlertDialogDescription>
          {removeError && (
            <p className="command-error" role="alert">
              <CircleAlert size={16} />
              <span>{removeError}</span>
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("m2cd0f3be8738")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (JSON.stringify(commands) !== commandBase.current) {
                  setRemoveError(tr("m9a39ffac9253"));
                  return;
                }
                const next = commands.filter((_, i) => i !== index);
                if (!(await onChange(next, commandBase.current))) {
                  setRemoveError(tr("mc3a3987f2446"));
                  return;
                }
                commandBase.current = JSON.stringify(next);
                setDraftBase(JSON.stringify(emptyCommand()));
                setIndex(-1);
                setHistory({ past: [], future: [] });
                setDraft(emptyCommand());
                reportIssue(null);
                setRemove(false);
              }}
            >
              {tr("m7a80dc500e60")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            if (focusAfterSwitch.current) {
              event.preventDefault();
              focusAfterSwitch.current = false;
              focusError();
            }
          }}
        >
          <AlertDialogTitle>{tr("maaf316d45b5b")}</AlertDialogTitle>
          <AlertDialogDescription>{tr("mc710844a63a4")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("m2cd0f3be8738")}</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                if (pending !== null) choose(pending);
              }}
            >
              {tr("m530ca27a9634")}
            </AlertDialogAction>
            <Button
              onClick={async () => {
                if (await save()) {
                  if (pending !== null) choose(pending);
                } else focusAfterSwitch.current = true;
                setPending(null);
              }}
            >
              {tr("mf511e4fa746e")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
