// Emit only a non-secret model patch. Never copy user secrets or change the running gateway.
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {loadRouting,openclawModelPatch} from '../modules/model-routing/routing.mjs';
const config=loadRouting(process.argv[2] || undefined);
const output=path.resolve(process.argv[3] || 'local-validation/model-routing/openclaw-model-patch.json');
mkdirSync(path.dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(openclawModelPatch(config),null,2)+'\n');
console.log(JSON.stringify({status:'prepared-not-applied',output,secret_values_written:false,
  session:`${config.session_llm.provider}/${config.session_llm.model}`,review:'local-only',
  required_environment_variable:config.session_llm.api_key_env}));
