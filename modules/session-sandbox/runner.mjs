// Trusted broker; command bytes are passed only to the isolated child, never
// to a host shell. OpenClaw owns approval, lifecycle and stdout/stderr collection.
import {readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SRT_CLI} from './constants.mjs';
const [settings,cwd,encoded]=process.argv.slice(2);
try {
  const config=JSON.parse(readFileSync(settings,'utf8'));
  const root=realpathSync(config.filesystem.allowWrite[0]),work=realpathSync(cwd);
  const rel=path.relative(root,work);
  if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('workdir outside session');
  const command=Buffer.from(encoded,'base64').toString('utf8');
  // Keep the OpenClaw-owned process as srt's holder. A timeout/abort kills
  // this holder, so upstream's native job also terminates its isolated child.
  process.chdir(work);
  process.argv=[process.execPath,SRT_CLI,'--settings',settings,'-c',command];
  await import(pathToFileURL(SRT_CLI));
}catch{console.error('SRT_INVALID_EXECUTION_CONTEXT');process.exitCode=1;}
