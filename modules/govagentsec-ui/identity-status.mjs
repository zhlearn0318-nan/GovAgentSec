// Service facts only: gateway login is never a business identity.
export const IDENTITY_HELP = 'docs/DELIVERY_ACCEPTANCE.md#安全边界与身份接入';
export const DELEGATION_REQUIRED = '本管理入口未携带逐用户 OIDC 业务委托，执行与审批已禁用；请使用演示身份源委托入口。网关管理员登录不代替业务身份。';
export function identityStatus(mode, version, ready) {
  const demoIdp = version?.payload?.demo_identity === true || version?.payload?.identity_source === 'demo_idp_verified_jwt';
  const configured = version?.ok === true && version.payload?.oidc_enabled === true;
  const demo = demoIdp || mode === 'loopback_static_dev' || (version?.ok === true
    && version.payload?.configuration?.allow_development_identity === true);
  const enabled = !demo && configured && ready?.ok === true && ready.payload?.ready === true
    && ready.payload?.dependencies?.identity?.healthy === true;
  return {
    state: demo ? 'demo' : enabled ? 'oidc_ready' : configured ? 'oidc_unavailable' : 'unconfigured',
    label: demoIdp ? '演示身份源（非生产）' : demo ? '演示身份（非生产）' : enabled ? '组织身份已启用' : configured ? '组织身份未就绪（OIDC）' : '未配置组织身份（OIDC）',
    mode: mode ?? 'disabled', executionEnabled: false,
    reason: (demo ? '仅本机验收。' : enabled ? '身份服务就绪不代表当前用户已获业务授权。' : '') + DELEGATION_REQUIRED,
    help: IDENTITY_HELP,
  };
}
export function requireBusinessDelegation() {
  // Legacy HTTP controls do not carry the per-user RPC delegation.
  throw new Error(DELEGATION_REQUIRED);
}
