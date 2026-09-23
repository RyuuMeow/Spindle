import { t as tr } from "../i18n/index.ts";
import type { SettingEntry } from "./search";
export const settingSections = [
  {
    id: "reading",
    label: tr("mc127821f4d8a"),
    keywords: "appearance style font editor 字型 字体 风格",
    icon: "BookOpen",
  },
  {
    id: "saving",
    label: tr("me4243a7121eb"),
    keywords: "save startup 保存 启动",
    icon: "Save",
  },
  {
    id: "language",
    label: tr("m93cc40bd495b"),
    keywords: "language locale updates English 繁體 简体 语言 更新",
    icon: "Globe",
  },
  {
    id: "rescue",
    label: tr("mca6db5af65d2"),
    keywords: "recovery drafts rescue 草稿 数据 救援",
    icon: "ArchiveRestore",
  },
  {
    id: "shortcuts",
    label: tr("m7b75a3b1432e"),
    keywords: "keyboard shortcuts 快捷键",
    icon: "Keyboard",
  },
  {
    id: "mcp",
    label: tr("m72253a24ab5d"),
    keywords: "MCP agent codex claude skill 自訂指令",
    icon: "Plug",
  },
  {
    id: "about",
    label: tr("m44962ebffa0d"),
    keywords: "about version release 关于 版本",
    icon: "Info",
  },
] as const;
export type SettingsSection = (typeof settingSections)[number]["id"];
export const appearanceLabels = {
  fontFamily: tr("m689553e16764"),
  fontSize: tr("m52826b6a046f"),
  lineHeight: tr("m40026aada6d8"),
  foreground: tr("m59b269e4727e"),
  background: tr("m783d609f0884"),
  selection: tr("mb8ae462215b2"),
  matches: tr("m3f703333c64c"),
  symbols: tr("mf94eac058612"),
  symbolStyle: tr("maaa6069f84cd"),
  highlightMatches: tr("m786628224332"),
  highlightSymbols: tr("mdef94cec60c2"),
  search: tr("m8fa48f7cc4ed"),
  searchCurrent: tr("ma9f791c558c6"),
  cursor: tr("m58eae8955d07"),
  activeLine: tr("mcb8a43312f5e"),
  highlightLine: tr("mbac1a6a6b811"),
};
export const syntaxLabels = {
  comment: tr("m246279fc2f40"),
  "keyword.header": tr("m25e24da1d15c"),
  "type.identifier": tr("m81007fe2467a"),
  keyword: tr("mafb7b03b1667"),
  function: tr("mae2f19d77e06"),
  variable: tr("m19b5ded2381d"),
  "keyword.option": tr("m062cae7f1167"),
  string: tr("m35506e2fc5e6"),
  number: tr("m365bd33d1106"),
  "delimiter.node": tr("mc988f6a2601b"),
  tag: tr("m9b423a3fa339"),
};
export const sourceLabels = {
  lineNumbers: tr("mb353609d2d21"),
  wordWrap: tr("m41befb26e4d3"),
  insertSpaces: tr("m78d0145d9dcf"),
  indentGuides: tr("m8efe492c26d2"),
};
export const extraSettingLabels = {
  "source.tabSize": tr("m18c251b9241c"),
  "source.whitespace": tr("mf739a03a85cf"),
  width: tr("m673d706b95ba"),
  zoom: tr("m1beed61b0b2b"),
  reopenLastProject: tr("m9860c712bfc5"),
  "mcp.mode": tr("m6c75adcf707c"),
  "mcp.port": tr("ma73bbb476e36"),
};
export const settingEntries: SettingEntry[] = [
  ...Object.entries(extraSettingLabels)
    .filter(([id]) => id !== "width")
    .map(([id, label]) => ({
      id,
      field: id,
      section: id.startsWith("mcp.")
        ? "mcp"
        : id === "reopenLastProject"
          ? "saving"
          : "reading",
      label,
      keywords: id,
    })),
  ...(["rendered", "reader"] as const).map((mode) => ({
    id: mode + ".width",
    field: mode + ".width",
    section: "reading",
    label:
      (mode === "reader" ? tr("m879debc5bf65") : tr("m34e439ce0fb9")) +
      " · " +
      extraSettingLabels.width,
    keywords: mode + ".width width reading 寬度 宽度",
  })),
  ...Object.entries(sourceLabels).map(([key, label]) => ({
    id: "source." + key,
    field: "source." + key,
    section: "reading",
    label,
    keywords: key,
  })),
  ...Object.entries(syntaxLabels).map(([key, label]) => ({
    id: "syntax." + key,
    field: "syntax." + key,
    section: "reading",
    label: tr("m30f6bba092e4") + " · " + label,
    keywords: key,
  })),
  {
    id: "language-field",
    field: "language",
    section: "language",
    label: tr("language.label"),
    keywords: "language English 繁體 简体 語言 语言",
  },
  {
    id: "autoCheckUpdates",
    field: "autoCheckUpdates",
    section: "language",
    label: tr("updates.automatic"),
    keywords: "updates 更新",
  },
  ...settingSections.map((s) => ({
    id: s.id,
    section: s.id,
    label: s.label,
    keywords: s.keywords,
  })),
  ...Object.entries(appearanceLabels).map(([field, label]) => ({
    id: field,
    section: "reading",
    field,
    label,
    keywords: field + " editor appearance 編輯器風格",
  })),
];
