import {probeEngine} from '../modules/session-sandbox/probe.mjs';
import path from 'node:path';
const out=path.resolve('local-validation/session-sandbox',new Date().toISOString().replace(/[:.]/g,'-'),'srt');
const report=await probeEngine('srt',out);console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),error:report.error}));if(!report.passed)process.exitCode=1;
