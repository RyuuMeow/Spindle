import type { SettingEntry } from "./search";
export const settingSections = [
  {id:"reading",label:"編輯器風格",keywords:"appearance style font editor 字型 字体 风格",icon:"BookOpen"},
  {id:"saving",label:"編輯與保存",keywords:"save startup 保存 启动",icon:"Save"},
  {id:"language",label:"語言與更新",keywords:"language locale updates English 繁體 简体 语言 更新",icon:"Globe"},
  {id:"rescue",label:"資料救援",keywords:"recovery drafts rescue 草稿 数据 救援",icon:"ArchiveRestore"},
  {id:"shortcuts",label:"快捷鍵",keywords:"keyboard shortcuts 快捷键",icon:"Keyboard"},
  {id:"mcp",label:"MCP／Agent 整合",keywords:"MCP agent codex claude skill 自訂指令",icon:"Plug"},
  {id:"about",label:"關於",keywords:"about version release 关于 版本",icon:"Info"},
] as const;
export type SettingsSection = typeof settingSections[number]["id"];
export const appearanceLabels = {
  fontFamily:"字型",fontSize:"文字大小",lineHeight:"行距",foreground:"文字顏色",background:"背景顏色",
  selection:"文字選取底色",matches:"選取文字的其他相符處",symbols:"游標符號關聯顏色",symbolStyle:"游標符號關聯樣式",
  highlightMatches:"高亮選取文字的其他相符處",highlightSymbols:"高亮游標符號關聯",search:"其他搜尋結果",searchCurrent:"目前搜尋結果",
  cursor:"游標顏色",activeLine:"目前行底色",highlightLine:"高亮目前行",
};
export const settingEntries: SettingEntry[] = [
  ...settingSections.map(s=>({id:s.id,section:s.id,label:s.label,keywords:s.keywords})),
  ...Object.entries(appearanceLabels).map(([field,label])=>({id:field,section:"reading",field,label,keywords:field+" editor appearance 編輯器風格"})),
];
