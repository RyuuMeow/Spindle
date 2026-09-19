import type { Command, Param } from "./parser";
/** Presentation metadata only; never persisted as custom command definitions. */
export type HelpParameter = Omit<Param, "type"> & { type: string };
export type CommandInfo = Omit<Command, "params"> & {
  params: HelpParameter[];
  builtin?: boolean;
  syntax?: string;
};
const p = (
  name: string,
  type: string,
  description: string,
  required = true,
): HelpParameter => ({ name, type, description, required, defaultValue: "" });
const definition = (
  name: string,
  description: string,
  syntax: string,
  example: string,
  params: HelpParameter[] = [],
): CommandInfo => ({
  name,
  description,
  syntax,
  example,
  params,
  builtin: true,
});
// Yarn Spinner 3 syntax. Sources are recorded in docs/workspace-architecture.md.
export const builtinCommands: CommandInfo[] = [
  definition(
    "jump",
    "跳轉到另一個場景，離開目前內容；不會返回呼叫位置。",
    "<<jump 場景>>",
    "<<jump Village>>",
    [p("場景", "node", "目的場景的 title；動態目的地使用大括號中的運算式。")],
  ),
  definition(
    "detour",
    "暫時執行另一個場景；結束或 return 後回到這裡繼續。",
    "<<detour 場景>>",
    "<<detour Shop>>",
    [p("場景", "node", "欲暫時執行的場景 title；也可使用大括號中的運算式。")],
  ),
  definition(
    "return",
    "提早返回最近的 detour 呼叫位置；沒有返回位置時結束對話。",
    "<<return>>",
    "<<return>>",
  ),
  definition("stop", "立即結束整段對話。", "<<stop>>", "<<stop>>"),
  definition(
    "if",
    "條件成立時執行此分支，以 endif 結束整個條件區域。",
    "<<if 條件>>",
    "<<if $gold >= 5>>",
    [
      p(
        "條件",
        "boolean",
        "結果必須為 true 或 false；可組合變數、比較、函式及 and／or。",
      ),
    ],
  ),
  definition(
    "elseif",
    "前面的 if／elseif 皆未成立時，檢查這個條件。",
    "<<elseif 條件>>",
    "<<elseif $gold > 0>>",
    [p("條件", "boolean", "此分支的布林運算式；整個運算式屬於同一個條件。")],
  ),
  definition(
    "else",
    "前面的條件未成立時執行；也可作為 once 已執行後的分支。",
    "<<else>>",
    "<<else>>",
  ),
  definition(
    "endif",
    "結束 if／elseif／else 區域，後續內容由所有分支共用。",
    "<<endif>>",
    "<<endif>>",
  ),
  definition(
    "once",
    "內容只執行一次；可加 if 條件，並以 endonce 結束區域。",
    "<<once [if 條件]>>",
    "<<once if $has_key>>",
    [
      p(
        "條件",
        "boolean",
        "選填；加上 if 後，只有尚未執行且條件成立才進入。",
        false,
      ),
    ],
  ),
  definition("endonce", "結束 once 區域。", "<<endonce>>", "<<endonce>>"),
  definition(
    "set",
    "更新已存在變數的值，型別必須相容；不修改變數宣告。",
    "<<set $變數 = 運算式>>",
    "<<set $gold = $gold + 5>>",
    [
      p(
        "變數",
        "variable",
        "要更新的變數，以 $ 開頭；可選擇專案中已宣告或已指定的變數。",
      ),
      p(
        "值",
        "expression",
        "使用 = 或 to 指定值；也支援 +=、-=、*=、/=、%=。整個右側是同一個運算式。",
      ),
    ],
  ),
  definition(
    "declare",
    "宣告變數與初始值；不必執行所在場景，宣告就會生效。",
    "<<declare $變數 = 初始值>>",
    "<<declare $gold = 12>>",
    [
      p("變數", "variable", "以 $ 開頭的變數名稱；同一專案中應保持唯一。"),
      p(
        "初始值",
        "expression",
        "數字、字串或布林值；可用 as 指定型別。運算式宣告可建立唯讀的 smart variable。",
      ),
    ],
  ),
  definition(
    "call",
    "呼叫 Yarn 函式；使用函式名稱與括號中的引數。",
    "<<call 函式(引數)>>",
    '<<call visited("Village")>>',
    [
      p(
        "函式呼叫",
        "expression",
        "例如 my_function(1, 2)；函式須由 Yarn 或遊戲端提供。",
      ),
    ],
  ),
  definition(
    "wait",
    "暫停對話指定秒數，等待後繼續。由遊戲端的 Dialogue Runner 執行。",
    "<<wait 秒數>>",
    "<<wait 0.5>>",
    [p("秒數", "number", "等待的秒數，可使用整數或小數。")],
  ),
];
export function findCommand(
  name: string,
  custom: Command[],
): CommandInfo | undefined {
  return (
    builtinCommands.find((c) => c.name === name) ||
    custom.find((c) => c.name === name)
  );
}
export function commandCatalog(custom: Command[]): CommandInfo[] {
  return [
    ...custom.filter((c) => !builtinCommands.some((b) => b.name === c.name)),
    ...builtinCommands,
  ];
}
/** Built-in language expressions do not use whitespace-delimited positional arguments. */
export function builtinParameterIndex(name: string, text: string) {
  if (name === "set" || name === "declare")
    return /^\s*\$[A-Za-z_]\w*\s*(?:[+*/%\-]?=|to\b)/.test(text) ? 1 : 0;
  return 0;
}
export function builtinArgumentSpans(
  name: string,
  text: string,
  offset: number,
) {
  const range = (s: string, at: number) => ({
    from: at + s.length - s.trimStart().length,
    to: at + s.trimEnd().length,
  });
  if (!text.trim()) return [];
  if (name === "set" || name === "declare") {
    const match =
      /^(\s*\$[A-Za-z_]\w*)(\s*(?:[+*/%\-]?=|to\b)\s*)([\s\S]*)$/.exec(text);
    if (!match) return [];
    return [
      range(match[1], offset),
      range(match[3], offset + match[1].length + match[2].length),
    ];
  }
  if (name === "once") {
    const match = /^\s*if\s+/.exec(text);
    return match
      ? [range(text.slice(match[0].length), offset + match[0].length)]
      : [];
  }
  return [range(text, offset)];
}
