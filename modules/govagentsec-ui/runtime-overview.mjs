// Only aggregate evidence crosses into the settings overview.
export function runtimeOverview(snapshot) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const ready = value => typeof value === 'boolean' ? value : null;
  const evidence = snapshot?.evidence;
  return {
    counts: Object.fromEntries(['total', 'allow', 'require_approval', 'deny'].map(key => [key, count(snapshot?.counts?.[key])])),
    evidence: count(evidence?.complete) !== null && count(evidence?.total) !== null && evidence.complete <= evidence.total
      ? { complete: evidence.complete, total: evidence.total } : null,
    components: [
      { label: 'AgentGuard 网关', ready: ready(snapshot?.services?.agentguard?.ok) },
      { label: 'OPA 与签票依赖', ready: snapshot?.services?.dependencies?.ok === false ? false : ready(snapshot?.services?.dependencies?.payload?.ready) },
      { label: '受控 MCP', ready: ready((snapshot?.services?.host_mcp ?? snapshot?.services?.openclaw_mcp)?.ok) },
    ],
  };
}
