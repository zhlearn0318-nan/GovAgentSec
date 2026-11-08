import { enable, disable } from '../modules/govagentsec-usage-wrapper/lifecycle.mjs';
const [command, ...args] = process.argv.slice(2), options = {};
try {
  for (let i = 0; i < args.length; i += 2) {
    const key = { '--config': 'configFile', '--state-dir': 'stateDir', '--port': 'port' }[args[i]];
    if (!key || !args[i + 1]) throw Error('INVALID_ARGUMENTS');
    options[key] = key === 'port' ? Number(args[i + 1]) : args[i + 1];
  }
  if (!['enable', 'disable'].includes(command)) throw Error('Use: node scripts/usage_wrapper.mjs enable|disable [--config FILE] [--state-dir DIR] [--port PORT]');
  console.log(JSON.stringify(await (command === 'enable' ? enable(options) : disable(options))));
} catch (error) { console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'USAGE_WRAPPER_OPERATION_FAILED'); process.exitCode = 1; }
