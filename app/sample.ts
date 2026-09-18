import type {Command,Doc} from './parser';
const sources:Record<string,string>={
'Chapter_01.yarn':`// The Last Light · 第一章：最後一盞燈

title: Start
tags: opening village
---
<<declare $has_key = false>>
<<declare $gold = 12>>
<<fade_in 1.5>>

Narrator: 黃昏落下，遠方的燈塔卻沒有亮起。
Mira: 你也看見了，對吧？
Mira: 那盞燈……從來沒有熄滅過。

-> 問問燈塔的事
    <<jump AskAboutLighthouse>>
-> 先去村莊看看
    <<jump Village>>
-> 我準備好了，出發吧
    <<jump Departure>>
===

title: AskAboutLighthouse
tags: conversation mira
---
Mira: 守塔人已經三天沒回來了。
<<play_sound "evening_wind" 0.6>>
Mira: 帶上這把鑰匙。你可能會需要它。
<<set $has_key = true>>
<<jump Departure>>
===

title: Village
tags: exploration
---
Narrator: 村莊裡只剩下風的聲音。
-> 去商店補給
    <<jump Shop>>
-> 返回米拉身邊
    <<jump Start>>
===

title: Departure
tags: story checkpoint
---
<<if $has_key>>
    Mira: 願那道光帶你回家。
    <<jump Lighthouse>>
<<else>>
    Mira: 等等，你還沒有鑰匙。
    <<jump AskAboutLighthouse>>
<<endif>>
===
`,
'Lighthouse.yarn':`title: Lighthouse
tags: lighthouse chapter_two
---
Narrator: 塔門緩緩打開。空氣中有海鹽的氣味。
<<play_sound "door_open" 0.8>>
-> 往樓上走
    <<jump LanternRoom>>
-> 回去村莊
    <<jump Village>>
===

title: LanternRoom
tags: ending
---
Narrator: 一盞微弱的燈，正在等待新的守護者。
<<fade_in 2>>
<<stop>>
===
`,
'Shop.yarn':`title: Shop
tags: shop village
---
Merchant: 歡迎。你有 {$gold} 枚金幣。
-> 買一盞提燈 <<if $gold >= 5>>
    <<set $gold -= 5>>
    Merchant: 小心黑暗。
-> 下次再來
    Merchant: 路上小心。
<<jump Village>>
===
`};
export const initialDocs:Doc[]=Object.entries(sources).map(([name,text])=>({name,text,saved:text}));
export const initialCommands:Command[]=[{name:'fade_in',description:'以指定秒數淡入畫面。由遊戲端負責實際執行。',params:[{name:'duration',type:'number',required:true,defaultValue:''}],example:'<<fade_in 1.5>>'},{name:'play_sound',description:'播放指定音效，可設定播放音量。',params:[{name:'clip',type:'string',required:true,defaultValue:''},{name:'volume',type:'number',required:false,defaultValue:'1'}],example:'<<play_sound "evening_wind" 0.6>>'}];
