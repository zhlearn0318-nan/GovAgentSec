---
name: supply-chain-security
description: "第四组供应链检测器在 OpenClaw 网关中的部署健康标记"
metadata:
  { "openclaw": { "emoji": "🛡️", "events": ["gateway:startup"], "always": true } }
---

# Supply Chain Security

The automatic install-time scan is implemented by the combined install policy.
This hook records that the integration was discovered when the Gateway starts.
