import { styles, markup } from './ui.mjs';
export function renderTrajectoryPanel() {
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>历史调用轨迹 · GovAgentSec</title><style>${styles}</style></head><body>${markup}<script type="module">import {mount} from '/plugins/govagentsec/trajectory-ui.mjs';mount(document);</script></body></html>`;
}
