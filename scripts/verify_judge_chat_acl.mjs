import fs from 'node:fs';import path from 'node:path';import {evidence} from './lib/backlog-evidence.mjs';
const e=evidence('u14-judge-chat-acl');
const design=fs.readFileSync('docs/U14_JUDGE_CHAT_ACL_REGRESSION.md','utf8');if((design.match(/- \[x\]/g)??[]).length!==4)throw Error('U14_STAGE_A_INCOMPLETE');
e.run('u7b-live',process.execPath,['scripts/check_notify_tools_live.mjs']);
e.run('u10',process.execPath,['scripts/verify_identity_task_acl.mjs']);
const u11=e.run('u11',process.execPath,['scripts/verify_identity_task_acl_full.mjs']);
if(u11.status===0){e.run('chat-live',process.execPath,['scripts/test_judge_chat_live.mjs'],{GOV_U14_EVIDENCE:e.out});}
const file=path.join(e.out,'chat-live-report.json');const live=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
e.finish({valid:live?.passed===true,chat:live,limitations:['本地确定性模型夹具；真实固定版本 OpenClaw 聊天与工具执行路径。','演示身份源（非生产），不代表组织 OIDC 接入。']});
