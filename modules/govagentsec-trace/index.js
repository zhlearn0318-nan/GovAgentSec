import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { registerTrace } from './register.mjs';
export default definePluginEntry({ id: 'govagentsec-trace', name: 'GovAgentSec 轨迹审计',
  description: '只读采集、哈希链和本地候选技能证据', register: registerTrace });
