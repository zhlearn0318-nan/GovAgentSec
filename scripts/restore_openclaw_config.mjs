import {version,restore,configPath,arg} from './lib/config-recovery.mjs';
version();console.log(JSON.stringify(restore(arg('backup'),arg('target')??configPath(),arg('expected-hash'),arg('target-hash'))));
