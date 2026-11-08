# U15 素材索引

- [五分钟讲稿](U15_JUDGE_DEMO_REEL_SCRIPT.md)
- 素材包：`F:\揭榜挂帅\评委演示素材\验收与证据\u15-four-layer-shots-2026-11-08T08-23-17-228Z`
- 本轮报告：`F:\揭榜挂帅\GovAgentSec\local-validation\u15-demo-reel\2026-11-08T08-23-17-228Z\report.json`
- 材料盘讲稿：`F:\揭榜挂帅\评委演示素材\成片\GovAgentSec-政安纵深-U15-讲稿.md`

四层主镜头：01 input-block.png；02 02-chat-denied.png 及审批/单次/重放；03 openclaw-graph.png + call-graph-real.png；04 gate-disabled.png + live-workshop-gate.png。

复跑打包：`node scripts/package_judge_demo_u15.mjs`。脚本校验已选来源报告、图非空元信息、图片格式与复制哈希，拒绝凭证形态文本；不把这些检查说成全盘敏感信息审计。旧失败调试报告列在 scan-report.json，未复制原文或截图。

没有新录视频，原 MP4 保留为历史版本。
