import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { registerTrajectory } from './register.mjs';

export default definePluginEntry({
  id: 'govagentsec-trajectory', name: 'GovAgentSec 轨迹审计',
  description: 'Passive local trajectory capture and controlled offline learning.',
  register: registerTrajectory,
});
