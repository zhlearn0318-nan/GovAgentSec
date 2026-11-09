import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const ROOT=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
export const HOST=path.join(process.env.APPDATA??'', 'npm/node_modules/openclaw');
export const IMAGE='govagentsec-session:node20-v1';
export const SRT_VERSION='0.0.81';
export const SRT_CLI=fileURLToPath(new URL('./node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js',import.meta.url));
export const SRT_LIMIT='Windows Alpha：启动权限检查较慢。限制写入和指定保护路径读取；其他系统可读路径仍可能可读。上游探针报告匿名令牌可绕过回环网络限制；不适合运行主动攻击隔离机制的代码。';
export const sdk=()=>import(pathToFileURL(path.join(HOST,'dist/plugin-sdk/sandbox.js')));
export const dataRoot=()=>path.join(process.env.OPENCLAW_STATE_DIR??path.join(process.env.USERPROFILE,'.openclaw'),'govagentsec/session-sandbox');
export function minimalEnv(){return Object.fromEntries(['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOME'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));}
