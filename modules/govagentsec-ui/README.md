# GovAgentSec 共享界面资源

此目录提供安全总览、输入防护、AgentGuard 与 Aegis 的统一标识、样式和动效。`design.mjs` 在页面响应中组合本地资源，沿用原有业务接口、页面令牌和权限控制。

首页按输入防护链、运行时安全、供应链安全展示三个入口。Group4 专项测评代码、联合准入和独立页面路由仍保留，未出现在新的首页导航中。

| 文件 | 作用 |
| --- | --- |
| `logo.svg` | 青色、圆环与帆盾意象的原创项目标识，不是校方官方标志 |
| `design.mjs` | 页面包装、资源内嵌与可选字体加载 |
| `design.css` | 共享样式与桌面、移动端布局 |
| `client.js` | 能力说明切换、滚动动效、减少动画偏好和运行状态配色 |
| `vendor/gsap.min.js` / `vendor/ScrollTrigger.min.js` | GSAP 3.13.0，保留上游版权和许可链接 |

Cabinet Grotesk Bold 字体不随 Git 仓库再分发。安装器通过 `scripts/download_ui_assets.py` 从 Fontshare 官方 CDN 下载并验证 SHA-256；字体缺失时使用系统字体，页面仍可加载。字体采用 ITF FFL，GSAP 采用其标准许可，均不改授 Apache-2.0，来源见根目录 THIRD_PARTY_NOTICES.md。

共享资源在模块加载时读取，修改后需重启 OpenClaw 网关。页面可访问只说明入口可用，不能代替 AgentGuard、OPA 或防护模型的就绪检查。使用根目录 `Verify.ps1` 检查完整运行依赖。
