// Private document memory, shared across views but never across browser tabs.
const sessions = new WeakMap();
const businessOperations = new Set(['invoke', 'resolve', 'task_create', 'task_read', 'task_escalate', 'bind_session','materials','select_materials','task_reapply']);
const copy = value => structuredClone(value);
function publicValue(value) {
  if (Array.isArray(value)) return value.map(publicValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(bearer|access_token|refresh_token|authorization|ticket|private_key|password|password_hash)$/i.test(key))
    .map(([key, item]) => [key, publicValue(item)]));
  return value;
}
const empty = () => ({ enabled: false, available: false, user: null, users: [], requests: [], tasks: [], audit: [], execution_enabled: false, expires_at: 0, activation_expires_at: 0, busy: false });
export function getIdentitySession(gateway) {
  if (!gateway || typeof gateway.request !== 'function') throw Error('GATEWAY_REQUIRED');
  if (sessions.has(gateway)) return sessions.get(gateway);
  let bearer = null, delegationExpires = 0, revision = 0, state = empty(), queue = Promise.resolve(), refreshing = null, timer;
  const listeners = new Set();
  const transport = gateway.request.bind(gateway);
  const rpc = (operation, payload = {}) => transport('govagentsec.demoIdentity.' + operation, payload);
  const snapshot = () => {
    const value = copy(state);
    if (value.expires_at && Date.now() / 1000 >= value.expires_at) {
      value.user = null; value.execution_enabled = false; value.expires_at = 0; value.delegation_reason = 'DEMO_DELEGATION_EXPIRED';
    }
    return value;
  };
  const emit = () => { for (const fn of listeners) { try { fn(snapshot()); } catch { /* A view cannot break delegation state. */ } } };
  const clear = () => { bearer = null; delegationExpires = 0; revision++; };
  const unavailable = reason => { clear(); state = { ...empty(), delegation_reason: reason }; emit(); };
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  async function readStatus() {
    if (delegationExpires && Date.now() / 1000 >= delegationExpires) clear();
    const result = publicValue(await rpc('status', bearer ? { bearer } : {}));
    if (!result || typeof result.enabled !== 'boolean') throw Error('STATUS_UNAVAILABLE');
    if (!result.enabled || !result.user) clear();
    const activation = Number.isFinite(result.expires_at) ? result.expires_at : 0;
    state = { ...empty(), ...result, available: true, busy: state.busy, activation_expires_at: activation,
      expires_at: bearer ? Math.min(delegationExpires, activation || delegationExpires) : 0 };
    if (!bearer) { state.user = null; state.execution_enabled = false; }
    emit(); return snapshot();
  }
  function refresh() {
    if (!refreshing) refreshing = serial(async () => {
      try { return await readStatus(); }
      catch { unavailable('DEMO_STATUS_UNAVAILABLE'); throw Error('DEMO_STATUS_UNAVAILABLE'); }
    }).finally(() => { refreshing = null; });
    return refreshing;
  }
  function mutate(fn, failure = 'DEMO_ACTION_UNCONFIRMED', guard = () => {}) {
    return serial(async () => {
      // A queued action from an old identity must not run as, or clear, the new one.
      guard();
      state.busy = true; emit();
      try { const result = await fn(); await readStatus(); return publicValue(result); }
      catch { unavailable(failure); throw Error(failure); }
      finally { state.busy = false; emit(); }
    });
  }
  const api = {
    snapshot, refresh,
    subscribe(fn) {
      listeners.add(fn); fn(snapshot());
      if (!timer) { timer = setInterval(() => { void refresh().catch(() => {}); }, 5000); timer.unref?.(); }
      void refresh().catch(() => {});
      return () => { listeners.delete(fn); if (!listeners.size) { clearInterval(timer); timer = null; } };
    },
    login(account, password) {
      if (typeof account !== 'string' || !account.trim() || typeof password !== 'string' || !password) return Promise.reject(Error('DEMO_CREDENTIALS_REQUIRED'));
      return mutate(async () => {
        const result = await rpc('login', { account: account.trim(), password, ...(bearer ? { bearer } : {}) });
        if (!result?.access_token || !Number.isFinite(result.expires_at) || result.expires_at <= Date.now() / 1000) throw Error('LOGIN_FAILED');
        bearer = 'Bearer ' + result.access_token; delegationExpires = result.expires_at; revision++;
        return { user: publicValue(result.user), expires_at: result.expires_at };
      }, 'DEMO_LOGIN_UNCONFIRMED').catch(async error => {
        // A denied login clears the old local authority but preserves the source's actual availability.
        await refresh().catch(() => {}); throw error;
      });
    },
    logout() {
      return mutate(async () => {
        if (bearer) { const result = await rpc('revoke', { bearer }); if (result?.status !== 'ok') throw Error('REVOKE_FAILED'); }
        clear(); return { status: 'ok' };
      }, 'DEMO_LOGOUT_UNCONFIRMED');
    },
    enable() { return mutate(async () => { const result = await rpc('enable', bearer ? { bearer } : {}); if (result?.enabled !== true) throw Error('ENABLE_FAILED'); return result; }); },
    disable() {
      return mutate(async () => { const result = await rpc('disable', bearer ? { bearer } : {}); if (result?.enabled !== false) throw Error('DISABLE_FAILED'); clear(); return result; }, 'DEMO_DISABLE_UNCONFIRMED');
    },
    requestGateway(method, payload = {}) {
      const allowed = typeof method === 'string' && (method.startsWith('govagentsec.trace.') || method.startsWith('govagentsec.trajectory.') || ['govagentsec.ui.open','govagentsec.sandbox.select','govagentsec.runtime.overview'].includes(method));
      if (!allowed || !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => /^(bearer|authorization|access_token)$/i.test(key))) return Promise.reject(Error('DEMO_UNTRUSTED_FIELD'));
      if (!bearer || !snapshot().user) return Promise.reject(Error('DEMO_DELEGATION_REQUIRED'));
      const expectedRevision = revision;
      return gateway.request(method, { ...copy(payload), bearer }).then(result => {
        if (expectedRevision !== revision || !snapshot().user) throw Error('DEMO_DELEGATION_REQUIRED');
        return publicValue(result);
      });
    },
    request(operation, payload = {}) {
      if (!businessOperations.has(operation) || !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => /^(bearer|authorization|access_token)$/i.test(key))) return Promise.reject(Error('DEMO_UNTRUSTED_FIELD'));
      const expectedRevision = revision, params = copy(payload);
      return mutate(() => rpc(operation, { ...params, bearer }), 'DEMO_ACTION_UNCONFIRMED', () => {
        if (!bearer || expectedRevision !== revision || !snapshot().user) throw Error('DEMO_DELEGATION_REQUIRED');
      });
    },
  };
  // Decorate this browser client's public transport, never the OpenClaw kernel.
  // Activate on every send so existing and newly created chats use the same login.
  gateway.request = (method, payload, ...rest) => {
    if (method !== 'chat.send') return transport(method, payload, ...rest);
    const expectedRevision = revision, params = copy(payload);
    return serial(async () => {
      if (!bearer || expectedRevision !== revision || !snapshot().user)
        throw Error('请先在会话上方登录业务身份，再发送消息。');
      const result = await rpc('activate_chat', {session_key: params?.sessionKey, bearer});
      if (result?.status !== 'ok') throw Error(result?.reason_code === 'P027_CONVERSATION_IDENTITY_CONFLICT'
        ? '这个对话正在由另一登录窗口使用，请退出原窗口身份后重试，或新建对话。'
        : '当前身份无法启用此对话，消息尚未发送。请检查身份和连接。');
      if (!snapshot().user) throw Error('身份已过期，请重新登录后发送。');
      return transport(method, params, ...rest);
    });
  };
  sessions.set(gateway, api); return api;
}
