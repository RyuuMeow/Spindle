"use client";

import {
  useCallback,
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
  LoaderCircle,
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
        nameError === "指令名稱須以字母或底線起始"
          ? "指令名稱須以英文字母或底線起始，且只能包含英文字母、數字和底線。"
          : nameError,
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
      message: `參數 ${i + 1}：${message}`,
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
  initialDraft,
  onDraftChange,
  referenceCount,
}: {
  commands: Command[];
  onChange: (commands: Command[]) => boolean | Promise<boolean>;
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  actionsRef: Ref<CommandActions>;
  initialDraft?: unknown;
  onDraftChange?: (value: { index: number; draft: Command }) => void;
  referenceCount?: (name: string) => number;
  projectName?: string;
}) {
  const [recovered] = useState(() => {
    const value = initialDraft as { index: number; draft: Command } | undefined;
    return value &&
      Number.isInteger(value.index) &&
      value.index < commands.length &&
      value.index >= -1 &&
      value.draft &&
      typeof value.draft.name === "string" &&
      (value.draft.displayName === undefined ||
        typeof value.draft.displayName === "string") &&
      typeof value.draft.description === "string" &&
      typeof value.draft.example === "string" &&
      Array.isArray(value.draft.params) &&
      value.draft.params.every(
        (p) =>
          p &&
          typeof p.name === "string" &&
          (p.displayName === undefined || typeof p.displayName === "string") &&
          (p.description === undefined || typeof p.description === "string") &&
          typeof p.defaultValue === "string" &&
          typeof p.required === "boolean" &&
          ["string", "number", "boolean"].includes(p.type),
      )
      ? value
      : null;
  });
  const [index, setIndex] = useState(
    recovered?.index ?? (commands.length ? 0 : -1),
  );
  const [draft, setDraft] = useState<Command>(() =>
    structuredClone(recovered?.draft || commands[0] || emptyCommand()),
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
  const draftCallback = useRef(onDraftChange);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    draftCallback.current = onDraftChange;
  }, [onDraftChange]);
  useEffect(() => {
    draftCallback.current?.({ index, draft });
  }, [index, draft]);
  const [issue, setIssue] = useState<CommandIssue | null>(null);
  const [remove, setRemove] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const issueRef = useRef<CommandIssue | null>(null);
  const focusAfterSwitch = useRef(false);
  const formId = useId();
  const errorId = `${formId}-error`;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(commands[index] || emptyCommand());
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
    setHistory({ past: [], future: [] });
    setIndex(nextIndex);
    setDraft(structuredClone(commands[nextIndex] || emptyCommand()));
    reportIssue(null);
  };

  const save = useCallback(async () => {
    if (saving) return false;
    if (!dirty && index >= 0) return true;
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
      if (!(await onChange(next))) {
        reportIssue({
          message: "無法套用指令。草稿仍在此處，請重試或匯出專案備份。",
          field: "save",
        });
        return false;
      }
      if (index < 0) setIndex(next.length - 1);
      reportIssue(null);
      notify("指令定義已套用，補全與診斷已更新");
      return true;
    } catch (error) {
      reportIssue({ message: "無法套用指令：" + String(error), field: "save" });
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
      <aside className="command-list" aria-label="指令列表">
        <div className="section-heading">
          <span>指令列表</span>
          <ControlTooltip label="新增指令">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="新增指令"
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
            aria-label="搜尋指令"
            placeholder="搜尋指令"
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
          <p className="command-empty">
            尚未定義自訂指令。填寫右側表單後套用。
          </p>
        )}
        {!!commands.length && !commands.some(matchesQuery) && (
          <p className="command-empty">找不到符合的指令。</p>
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
                ? "新增指令"
                : commands[index]?.displayName ||
                  commands[index]?.name ||
                  "指令定義"}
            </h2>
            <span
              className={
                "command-save-state" + (dirty && draftIssue ? " invalid" : "")
              }
              role="status"
            >
              {saving
                ? "正在套用"
                : dirty
                  ? draftIssue
                    ? "草稿有待修正欄位"
                    : "草稿尚未套用"
                  : index < 0
                    ? "填寫指令定義"
                    : "已套用"}
            </span>
          </div>
          <div className="command-actions">
            <ControlTooltip label="復原指令表單變更">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="復原指令表單變更"
                disabled={!history.past.length || saving}
                onClick={undo}
              >
                <Undo2 size={15} />
              </Button>
            </ControlTooltip>
            <ControlTooltip label="重做指令表單變更">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="重做指令表單變更"
                disabled={!history.future.length || saving}
                onClick={redo}
              >
                <Redo2 size={15} />
              </Button>
            </ControlTooltip>
            <ControlTooltip label="建立指令副本">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="建立指令副本"
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
                    aria-label="指令更多操作"
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
                    刪除指令
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="submit"
              disabled={!dirty || saving}
              {...fieldProps("save")}
            >
              {saving ? (
                <LoaderCircle size={14} className="command-saving-icon" />
              ) : (
                <Check size={14} />
              )}
              套用定義
            </Button>
          </div>
        </div>
        <div className="command-form-body">
          {issue?.field === "save" && renderError()}
          <div className="command-identity">
            <label className="command-field" htmlFor={`${formId}-name`}>
              <span>變數名稱</span>
              <input
                id={`${formId}-name`}
                {...fieldProps("name")}
                aria-label="變數名稱"
                value={draft.name}
                placeholder="例如 play_animation"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  updateDraft({ ...draft, name: event.target.value })
                }
              />
              {issue?.field === "name" && renderError()}
              {index >= 0 && draft.name !== commands[index]?.name && (
                <span className="command-field-hint">
                  更名影響：{referenceCount?.(commands[index].name) || 0}{" "}
                  處呼叫仍使用舊名稱，需同步修改劇本。
                </span>
              )}
            </label>
            <label className="command-field" htmlFor={`${formId}-display-name`}>
              <span>
                指令名稱（顯示） <span className="command-optional">選填</span>
              </span>
              <input
                id={`${formId}-display-name`}
                aria-label="指令名稱（顯示）"
                value={draft.displayName || ""}
                placeholder={draft.name || "例如 播放動畫"}
                onChange={(event) =>
                  updateDraft({ ...draft, displayName: event.target.value })
                }
              />
            </label>
          </div>
          <label className="command-field" htmlFor={`${formId}-description`}>
            <span>
              說明 <span className="command-optional">選填</span>
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
            <h3>參數</h3>
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
              新增參數
            </Button>
          </div>
          <div className="params">
            {draft.params.length === 0 && (
              <p className="command-empty">這個指令沒有參數。</p>
            )}
            {draft.params.map((param, i) => (
              <fieldset className="param" key={i}>
                <legend className="sr-only">參數 {i + 1}</legend>
                <div className="param-top">
                  <label
                    className="command-field"
                    htmlFor={`${formId}-param-${i}-name`}
                  >
                    <span>變數名稱</span>
                    <input
                      id={`${formId}-param-${i}-name`}
                      {...fieldProps(`param-${i}-name`)}
                      aria-label={`參數 ${i + 1} 變數名稱`}
                      placeholder="例如 animation"
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
                      顯示名稱 <span className="command-optional">選填</span>
                    </span>
                    <input
                      id={`${formId}-param-${i}-display-name`}
                      aria-label={`參數 ${i + 1} 顯示名稱`}
                      value={param.displayName || ""}
                      placeholder={param.name || "例如 動畫"}
                      onChange={(event) =>
                        updateParam(i, { displayName: event.target.value })
                      }
                    />
                  </label>
                  <label
                    className="command-field"
                    htmlFor={`${formId}-param-${i}-type`}
                  >
                    <span>型別</span>
                    <CompactSelect
                      id={`${formId}-param-${i}-type`}
                      label={`參數 ${i + 1} 型別`}
                      value={param.type}
                      onChange={(value) =>
                        updateParam(i, { type: value as Param["type"] })
                      }
                      options={[
                        { value: "string", label: "文字" },
                        { value: "number", label: "數字" },
                        { value: "boolean", label: "布林" },
                      ]}
                    />
                  </label>
                  <div
                    className="param-order"
                    role="group"
                    aria-label={`參數 ${i + 1} 操作`}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`參數 ${i + 1} 操作`}
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
                          上移參數
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={i === draft.params.length - 1}
                          onSelect={() => moveParam(i, 1)}
                        >
                          <ArrowDown size={14} />
                          下移參數
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
                          刪除參數
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
                      aria-label={`參數 ${i + 1} 必填`}
                      checked={param.required}
                      onCheckedChange={(value) =>
                        updateParam(i, { required: value === true })
                      }
                    />
                    必填
                  </label>
                  <label
                    className="command-field command-default"
                    htmlFor={`${formId}-param-${i}-default`}
                  >
                    <span>預設值</span>
                    <input
                      id={`${formId}-param-${i}-default`}
                      {...fieldProps(`param-${i}-defaultValue`)}
                      aria-label={`參數 ${i + 1} 預設值`}
                      placeholder={
                        param.type === "string"
                          ? '例如 "idle"'
                          : param.type === "number"
                            ? "例如 1"
                            : "true 或 false"
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
                    參數說明 <span className="command-optional">選填</span>
                    {param.description && (
                      <span className="param-description-present">已填寫</span>
                    )}
                  </summary>
                  <label
                    className="command-field"
                    htmlFor={`${formId}-param-${i}-description`}
                  >
                    <span className="sr-only">參數 {i + 1} 說明</span>
                    <textarea
                      id={`${formId}-param-${i}-description`}
                      rows={2}
                      aria-label={`參數 ${i + 1} 說明`}
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
              使用範例 <span className="command-optional">選填</span>
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
            刪除 {commands[index]?.name || draft.name}？
          </AlertDialogTitle>
          <AlertDialogDescription>
            腳本中的呼叫會保留，並改為未註冊指令警告。
          </AlertDialogDescription>
          {removeError && (
            <p className="command-error" role="alert">
              <CircleAlert size={16} />
              <span>{removeError}</span>
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                const next = commands.filter((_, i) => i !== index);
                if (!(await onChange(next))) {
                  setRemoveError("無法刪除指令，請先下載專案備份。");
                  return;
                }
                setIndex(-1);
                setHistory({ past: [], future: [] });
                setDraft(emptyCommand());
                reportIssue(null);
                setRemove(false);
              }}
            >
              刪除指令
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
          <AlertDialogTitle>指令有尚未套用的修改</AlertDialogTitle>
          <AlertDialogDescription>
            先套用定義，或捨棄修改後切換。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                if (pending !== null) choose(pending);
              }}
            >
              捨棄修改
            </AlertDialogAction>
            <Button
              onClick={async () => {
                if (await save()) {
                  if (pending !== null) choose(pending);
                } else focusAfterSwitch.current = true;
                setPending(null);
              }}
            >
              套用並切換
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
