// Generated from examples/demo-project/the-last-light. Run pnpm demo:sync.
import type { Command, Doc } from "../../app/parser";
const sources: Record<string, string> = {
  "Chapter_01.yarn": "// The Last Light · 第一章：最後一盞燈\r\n\r\ntitle: Start\r\ntags: opening village\r\n---\r\n<<declare $has_key = false>>\r\n<<declare $gold = 12>>\r\n<<fade_in 1.5>>\r\n\r\nNarrator: 黃昏落下，遠方的燈塔卻沒有亮起。\r\nMira: 你也看見了，對吧？\r\nMira: 那盞燈……從來沒有熄滅過。\r\n\r\n-> 問問燈塔的事\r\n    <<jump AskAboutLighthouse>>\r\n-> 先去村莊看看\r\n    <<jump Village>>\r\n-> 我準備好了，出發吧\r\n    <<jump Departure>>\r\n===\r\n\r\ntitle: AskAboutLighthouse\r\ntags: conversation mira\r\n---\r\nMira: 守塔人已經三天沒回來了。\r\n<<play_sound \"evening_wind\" 0.6>>\r\nMira: 帶上這把鑰匙。你可能會需要它。\r\n<<set $has_key = true>>\r\n<<jump Departure>>\r\n===\r\n\r\ntitle: Village\r\ntags: exploration\r\n---\r\nNarrator: 村莊裡只剩下風的聲音。\r\n-> 去商店補給\r\n    <<jump Shop>>\r\n-> 返回米拉身邊\r\n    <<jump Start>>\r\n===\r\n\r\ntitle: Departure\r\ntags: story checkpoint\r\n---\r\n<<if $has_key>>\r\n    Mira: 願那道光帶你回家。\r\n    <<jump Lighthouse>>\r\n<<else>>\r\n    Mira: 等等，你還沒有鑰匙。\r\n    <<jump AskAboutLighthouse>>\r\n<<endif>>\r\n===\r\n",
  "Lighthouse.yarn": "title: Lighthouse\r\ntags: lighthouse chapter_two\r\n---\r\nNarrator: 塔門緩緩打開。空氣中有海鹽的氣味。\r\n<<play_sound \"door_open\" 0.8>>\r\n-> 往樓上走\r\n    <<jump LanternRoom>>\r\n-> 回去村莊\r\n    <<jump Village>>\r\n===\r\n\r\ntitle: LanternRoom\r\ntags: ending\r\n---\r\nNarrator: 一盞微弱的燈，正在等待新的守護者。\r\n<<fade_in 2>>\r\n<<stop>>\r\n===\r\n",
  "Shop.yarn": "title: Shop\r\ntags: shop village\r\n---\r\nMerchant: 歡迎。你有 {$gold} 枚金幣。\r\n-> 買一盞提燈 <<if $gold >= 5>>\r\n    <<set $gold -= 5>>\r\n    Merchant: 小心黑暗。\r\n-> 下次再來\r\n    Merchant: 路上小心。\r\n<<jump Village>>\r\n===\r\n"
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
