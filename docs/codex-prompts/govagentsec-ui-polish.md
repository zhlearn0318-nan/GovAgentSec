# GovAgentSec UI 抛光规范（govagentsec-ui-polish）

> Codex / Astra：本文件即串跑提示词中的 `govagentsec-ui-polish` skill 正文。仓库内权威路径：`docs/codex-prompts/govagentsec-ui-polish.md`。Grok Bot 技能库中同名 skill 与此对齐；**找不到 Bot skill 时直接遵守本文件即可，勿阻塞 U26/U25。**

## When

Beautify or review `modules/govagentsec-ui`（及相关防护/准入面板），重点 **字体** 与 **克制微动效**。保持值班台，不做发布会营销站。

## Locked tokens

改共享 token 优先（`workspace-style.mjs` / shell host styles）。

| Token | Value |
| --- | --- |
| Paper | `#f5f7f7` |
| Surface | `#ffffff` |
| Ink | `#233e3b` |
| Muted | `#70817e` |
| Line | `#e0e7e4` |
| Accent | `#1e695b` |
| Soft | `#e9f1ee` / `#e3eeea` |
| Warn | `#9c6524` (+ `#faf0df`) |
| Danger | `#b14942` (+ `#f9eae8`) |
| Radius | 控件 6–9px；卡片 ~9px |
| Body | **13px / 1.55** |

**Font stack:** `"Segoe UI Variable", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif`  
**Mono:** `"Cascadia Code", Consolas, monospace` 11–12px  
**Title weight:** 650；`h1` 字距 -0.4px ~ -0.6px

| Role | Size | Weight |
| --- | --- | --- |
| h1 | 20–22px | 650 |
| h2 | 14px | 650 |
| body | 13px | 400–550 |
| meta/chip | 11–12px | 400–600 |

禁止展示字体、禁止主操作正文 <12px。

## Motion

允许：hover/focus 150–180ms ease-out；抽屉 180–220ms opacity+短位移；chip 120–160ms；导航当前态 ≤180ms。  
禁止：hero/轮播/视差/循环装饰/弹跳/大模糊、每次 RPC 布局抖动、拖慢主按钮的动画。

必须尊重 `prefers-reduced-motion: reduce`（动画/过渡近乎 0）。保留 `:focus-visible` 2px accent。

## Status chips

| Meaning | Label | Style |
| --- | --- | --- |
| OK | 已启用 / 已配置 | 绿/accent |
| 实际防护状态·工具执行 | **演示身份** | **绿色正向**（不要红警示） |
| 需人 | 需审批 / 待审批 | warn |
| 停 | 已阻断 | danger |
| 仅登录/顶栏全局 | 演示（非生产） | muted/warn；**不要**用在上述防护状态行 |

产品 UI 禁止 `PASS` / `Uxx` / 验收清单话术。

## Layout

单强调色；雾白底；细边线；少空英雄卡。U25 起主导航最多四入口。防护设置顺序：安全总览 → 实际防护状态 → 配置与维护。

## Order of work

1. 读 workspace-style / shell / 目标页  
2. token + 字号 + 共享 motion class  
3. 状态文案映射  
4. 跑现有 UI 验收（workspace-ia / workspace-ui / u24-trace-ui / 当前 Uxx）  
5. 证据目录截图：登录、各入口、防护芯片、抽屉

## Explicit allowance

**若执行环境无法加载 Grok Bot skill 目录：以本 Markdown 为唯一 UI 规范，沿用现有青绿值班风继续 U26→U25，不得以此为由停工。**
