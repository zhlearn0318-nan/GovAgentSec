import {version,backup,configPath,arg} from './lib/config-recovery.mjs';
version();console.log(JSON.stringify(backup(arg('config')??configPath())));
