import { t as tr } from "./i18n/index.ts";
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
    tr("m330984eb1e78"),
    tr("m37146a00c8c3"),
    "<<jump Village>>",
    [p(tr("mcb88dc73b257"), "node", tr("me0b841cf8635"))],
  ),
  definition(
    "detour",
    tr("m24ce952bb0d9"),
    tr("m1d8b34b6053d"),
    "<<detour Shop>>",
    [p(tr("mcb88dc73b257"), "node", tr("m37528fc2f532"))],
  ),
  definition("return", tr("m3e705c1008d9"), "<<return>>", "<<return>>"),
  definition("stop", tr("m74e93e95febf"), "<<stop>>", "<<stop>>"),
  definition(
    "if",
    tr("mc59469d4c0ea"),
    tr("ma1331fc66027"),
    "<<if $gold >= 5>>",
    [p(tr("me8ccaa17c328"), "boolean", tr("md655e182e111"))],
  ),
  definition(
    "elseif",
    tr("ma8509920cd28"),
    tr("mdb306d8ecfb0"),
    "<<elseif $gold > 0>>",
    [p(tr("me8ccaa17c328"), "boolean", tr("m0d3141c1ec32"))],
  ),
  definition("else", tr("ma68dc28ff185"), "<<else>>", "<<else>>"),
  definition("endif", tr("mcb0ec319efa4"), "<<endif>>", "<<endif>>"),
  definition(
    "once",
    tr("m22c0c31d3751"),
    tr("m1fddc22b55a1"),
    "<<once if $has_key>>",
    [p(tr("me8ccaa17c328"), "boolean", tr("m207aa99e1615"), false)],
  ),
  definition("endonce", tr("m73462a1cc044"), "<<endonce>>", "<<endonce>>"),
  definition(
    "set",
    tr("m92e49002a26f"),
    tr("mbee1f58a653a"),
    "<<set $gold = $gold + 5>>",
    [
      p(tr("m19b5ded2381d"), "variable", tr("m6f9e7fb1cb40")),
      p(tr("mcda1d55c5231"), "expression", tr("mdab18310add7")),
    ],
  ),
  definition(
    "declare",
    tr("m8256eea4b83a"),
    tr("md987bfbd9bce"),
    "<<declare $gold = 12>>",
    [
      p(tr("m19b5ded2381d"), "variable", tr("mc4c183cfe411")),
      p(tr("mf2921e5b0707"), "expression", tr("m62ba472dbc03")),
    ],
  ),
  definition(
    "call",
    tr("mf4368168493a"),
    tr("m3c4026f0e89c"),
    '<<call visited("Village")>>',
    [p(tr("mc96dc819988a"), "expression", tr("m6591017aa5ea"))],
  ),
  definition("wait", tr("mf2aa11ed5c78"), tr("m71ddd5abba88"), "<<wait 0.5>>", [
    p(tr("m48363f106fae"), "number", tr("m4c8f3356461b")),
  ]),
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
