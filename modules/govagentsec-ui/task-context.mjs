// Only the existing host shell supplies the selected session. No inferred default.
let current = Object.freeze({ sessionKey: '', title: '' });
const listeners = new Set();
export function getTaskContext() { return { ...current }; }
export function setTaskContext({ sessionKey = '', title = '' } = {}) {
  const next = { sessionKey: typeof sessionKey === 'string' ? sessionKey.trim() : '', title: typeof title === 'string' ? title : '' };
  if (!next.sessionKey) next.title = '';
  if (next.sessionKey === current.sessionKey && next.title === current.title) return;
  current = Object.freeze(next);
  for (const listener of listeners) listener(getTaskContext());
}
export function subscribeTaskContext(listener) {
  listeners.add(listener); listener(getTaskContext());
  return () => listeners.delete(listener);
}
