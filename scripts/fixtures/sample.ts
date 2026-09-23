// Generated from examples/demo-project/the-last-light. Run pnpm demo:sync.
import type { Command, Doc } from "../../app/parser";
const sources: Record<string, string> = {
  "Chapter_01.yarn": "// The Last Light · 第一章：最後一盞燈\n\ntitle: Start\ntags: opening village\n---\n<<declare $has_key = false>>\n<<declare $gold = 12>>\n<<fade_in 1.5>>\n\nNarrator: 黃昏落下，遠方的燈塔卻沒有亮起。\nMira: 你也看見了，對吧？\nMira: 那盞燈……從來沒有熄滅過。\n\n-> 問問燈塔的事\n    <<jump AskAboutLighthouse>>\n-> 先去村莊看看\n    <<jump Village>>\n-> 我準備好了，出發吧\n    <<jump Departure>>\n===\n\ntitle: AskAboutLighthouse\ntags: conversation mira\n---\nMira: 守塔人已經三天沒回來了。\n<<play_sound \"evening_wind\" 0.6>>\nMira: 帶上這把鑰匙。你可能會需要它。\n<<set $has_key = true>>\n<<jump Departure>>\n===\n\ntitle: Village\ntags: exploration\n---\nNarrator: 村莊裡只剩下風的聲音。\n-> 去商店補給\n    <<jump Shop>>\n-> 返回米拉身邊\n    <<jump Start>>\n===\n\ntitle: Departure\ntags: story checkpoint\n---\n<<if $has_key>>\n    Mira: 願那道光帶你回家。\n    <<jump Lighthouse>>\n<<else>>\n    Mira: 等等，你還沒有鑰匙。\n    <<jump AskAboutLighthouse>>\n<<endif>>\n===\n",
  "Lighthouse.yarn": "title: Lighthouse\ntags: lighthouse chapter_two\n---\nNarrator: 塔門緩緩打開。空氣中有海鹽的氣味。\n<<play_sound \"door_open\" 0.8>>\n-> 往樓上走\n    <<jump LanternRoom>>\n-> 回去村莊\n    <<jump Village>>\n===\n\ntitle: LanternRoom\ntags: ending\n---\nNarrator: 一盞微弱的燈，正在等待新的守護者。\n<<fade_in 2>>\n<<stop>>\n===\n",
  "Shop.yarn": "title: Shop\ntags: shop village\n---\nMerchant: 歡迎。你有 {$gold} 枚金幣。\n-> 買一盞提燈 <<if $gold >= 5>>\n    <<set $gold -= 5>>\n    Merchant: 小心黑暗。\n-> 下次再來\n    Merchant: 路上小心。\n<<jump Village>>\n===\n"
};
export const initialDocs: Doc[] = Object.entries(sources).map(([name, text]) => ({ name, text, saved: text }));
export const initialCommands: Command[] = [
  {
    "name": "fade_in",
    "description": "以指定秒數淡入畫面。由遊戲端負責實際執行。",
    "params": [
      {
        "name": "duration",
        "type": "number",
        "required": true,
        "defaultValue": ""
      }
    ],
    "example": "<<fade_in 1.5>>"
  },
  {
    "name": "play_sound",
    "description": "播放指定音效，可設定播放音量。",
    "params": [
      {
        "name": "clip",
        "type": "string",
        "required": true,
        "defaultValue": ""
      },
      {
        "name": "volume",
        "type": "number",
        "required": false,
        "defaultValue": "1"
      }
    ],
    "example": "<<play_sound \"evening_wind\" 0.6>>"
  }
];
