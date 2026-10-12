import { t as tr } from "./i18n/index.ts";
import type { Command, Param } from "./parser";

const param = (
  name: string,
  type: Param["type"],
  defaultValue: string,
  required = true,
): Param => ({ name, type, defaultValue, required });
// Core markers from the vendored Yarn Spinner 3.2.1 LineParser/BuiltInMarkupReplacer.
// pause is a Yarn presentation integration, not a core text replacement.
export const builtinInline: (Command & {
  builtin: true;
  dynamicProperties?: boolean;
})[] = [
  {
    name: "nomarkup",
    description: tr("markup.nomarkup"),
    params: [],
    example: "[nomarkup][literal text][/nomarkup]",
    inline: true,
    markupMode: "paired",
    builtin: true,
  },
  {
    name: "character",
    description: tr("markup.character"),
    params: [param("name", "string", '"Mira"')],
    example: '[character name="Mira"]Mira: [/character]Hello!',
    inline: true,
    markupMode: "paired",
    builtin: true,
  },
  {
    name: "select",
    description: tr("markup.select"),
    params: [
      param("value", "string", '"a"'),
      param("a", "string", '"text"', false),
    ],
    example: '[select value={$kind} a="text" b="other text" /]',
    inline: true,
    markupMode: "selfClosing",
    builtin: true,
    dynamicProperties: true,
  },
  ...(["plural", "ordinal"] as const).map((name) => ({
    name,
    description: tr(name === "plural" ? "markup.plural" : "markup.ordinal"),
    params: [
      param("value", "number", "1"),
      param("one", "string", '"one"', false),
      param("other", "string", '"%"', false),
    ],
    example: `[${name} value={$count} one="one" other="%" /]`,
    inline: true,
    markupMode: "selfClosing" as const,
    builtin: true as const,
    dynamicProperties: true,
  })),
  {
    name: "pause",
    description: tr("markup.pause"),
    params: [param("pause", "number", "500")],
    example: "Wait… [pause=500 /]ready!",
    inline: true,
    markupMode: "selfClosing",
    builtin: true,
  },
];

export function inlineCatalog(commands: Command[]) {
  return [
    ...commands.filter(
      (c) => c.inline && !builtinInline.some((b) => b.name === c.name),
    ),
    ...builtinInline,
  ];
}

export function inlineSnippet(
  command: Command,
  selectedText = "",
  dialect: "monaco" | "codemirror" = "monaco",
  close = true,
  existingProperties?: string,
) {
  const escape = (text: string) =>
    text.replace(dialect === "monaco" ? /[\\$}]/g : /[{}]/g, "\\$&");
  let index = 0;
  const properties =
    existingProperties === undefined
      ? command.params
          .filter(
            (p) =>
              p.required ||
              (command.name === "select" && p.name === "a") ||
              (["plural", "ordinal"].includes(command.name) &&
                p.name === "other"),
          )
          .map((p) => {
            const slot = "${" + ++index + ":}";
            const field = p.type === "string" ? '"' + slot + '"' : slot;
            return (
              (p.name === command.name && index === 1 ? "=" : ` ${p.name}=`) +
              field
            );
          })
          .join("")
      : escape(existingProperties);
  const cursor = dialect === "monaco" ? "$0" : "${0}";
  return `[${command.name}${properties}${command.markupMode === "selfClosing" ? " /]" + cursor : "]" + escape(selectedText) + cursor + (close ? "[/" + command.name + "]" : "")}`;
}

export function inlinePropertySnippet(parameter: Param) {
  const value = parameter.type === "string" ? '"${1:}"' : "${1:}";
  return parameter.name + "=" + value;
}
