import {readFileSync} from 'node:fs';
import {localEndpoint} from './local-only.mjs';

export const DEFAULT_ROUTING_FILE = new URL('../../config/model-routing.json', import.meta.url);
export function loadRouting(file = process.env.GOVAGENTSEC_MODEL_ROUTING_CONFIG || DEFAULT_ROUTING_FILE) {
  const config = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (config.openclaw_version !== '2026.7.1-2' || config.external_review_enabled !== false)
    throw Error('fixed host version and external review disabled required');
  const session = config.session_llm, review = config.security_review_llm;
  const url = new URL(session.base_url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('session API HTTPS host required');
  if (session.api !== 'openai-completions' || !/^[A-Za-z0-9_-]+$/.test(session.provider)
      || !/^[A-Za-z0-9_.:-]+$/.test(session.model) || !/^[A-Z][A-Z0-9_]+$/.test(session.api_key_env)
      || Object.keys(session).some(k=>!['provider','base_url','api','model','api_key_env'].includes(k)))
    throw Error('session config must contain an environment key reference, never a secret');
  localEndpoint(review.endpoint);
  if (!['ollama','heuristic'].includes(review.judge) || !review.calibration_version?.includes('not-production')
      || review.calibrated !== false || !/^[A-Za-z0-9_.:/-]+$/.test(review.model)
      || !Number.isInteger(review.timeoutMs) || review.timeoutMs < 1 || review.timeoutMs > 300000
      || Object.keys(review).some(k=>!['judge','endpoint','model','timeoutMs','calibration_version','calibrated'].includes(k)))
    throw Error('local uncalibrated review configuration required');
  return config;
}

export function openclawModelPatch(config = loadRouting()) {
  const s=config.session_llm;
  // Verified against /models and the pinned host's ModelCompatSchema.
  // Keep the real provider identity: the UI uses it for grouping/capabilities.
  const models=s.provider==='deepseek' && new URL(s.base_url).hostname==='api.deepseek.com'
    ? [
      {id:'deepseek-flash',name:'DeepSeek Flash',input:['text','image']},
      {id:'deepseek-v4-pro',name:'DeepSeek Pro',input:['text']},
    ].map(model=>({...model,reasoning:true,contextWindow:1048576,maxTokens:393216,
      compat:{supportsReasoningEffort:true,supportedReasoningEfforts:['none','low','high','max','xhigh'],
        reasoningEffortMap:{minimal:'low',low:'low',medium:'high',high:'high',xhigh:'max'},
        supportsUsageInStreaming:true,supportsTools:true,maxTokensField:'max_tokens',thinkingFormat:'deepseek'}}))
    : [{id:s.model,name:s.model,input:['text']}];
  if(!models.some(m=>m.id===s.model))throw Error('session default must be in configured model catalog');
  return {models:{providers:{[s.provider]:{baseUrl:s.base_url,api:s.api,
    apiKey:{source:'env',provider:'default',id:s.api_key_env},
    models}}},
    agents:{defaults:{model:{primary:`${s.provider}/${s.model}`,fallbacks:[]},
      models:Object.fromEntries(models.map(m=>[`${s.provider}/${m.id}`,{alias:m.name}]))}}};
}

export function modelRoutingStatus(hostConfig) {
  const policy=loadRouting(), primary=hostConfig.agents?.defaults?.model;
  const reference=typeof primary==='string'?primary:primary?.primary;
  const provider=reference?.split('/')[0], configured=hostConfig.models?.providers?.[provider];
  let activeApi=false;
  try { const u=new URL(configured?.baseUrl); activeApi=u.protocol==='https:' && configured?.api!=='ollama'; } catch {}
  return {session:{label:'会话模型（可 API）',current:reference??'未配置',api_configured:activeApi,
    target:`${policy.session_llm.provider}/${policy.session_llm.model}`,
    status:activeApi?'API 已配置；连通性未在此检查':'当前仍为本地或未知模型，尚未切换 API'},
    review:{label:'安全评审（默认本地，轨迹不出域）',model:policy.security_review_llm.model,
      endpoint:policy.security_review_llm.endpoint,judge:policy.security_review_llm.judge,
      status:'仅允许本机回环；不可用时明确回退或隔离',external_review_enabled:false},
    scope:'默认新会话配置；既有会话和代理覆盖需另行核验'};
}
