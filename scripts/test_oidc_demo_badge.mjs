import assert from 'node:assert/strict';import {identityStatus} from '../modules/govagentsec-ui/identity-status.mjs';
const ready={ok:true,payload:{ready:true,dependencies:{identity:{healthy:true}}}};
const cases=[['demo flag',{oidc_enabled:true,demo_identity:true}],['demo source',{oidc_enabled:true,identity_source:'demo_idp_verified_jwt'}],['development enabled',{oidc_enabled:true,configuration:{allow_development_identity:true}}]];
for(const [name,payload] of cases){const s=identityStatus('oidc',{ok:true,payload},ready);assert.equal(s.state,'demo',name);assert(!s.label.includes('组织身份已启用'));assert.equal(s.executionEnabled,false);}
console.log(JSON.stringify({passed:true,source:'synthetic-ui-state-matrix',cases:cases.map(c=>c[0]),organization_claimed:false}));
