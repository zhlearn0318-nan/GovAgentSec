// Pure event graph: dashed edges are observation order, solid edges pair exact call IDs.
export function buildGraph(events) {
  const nodes = events.map((event, index) => ({ id: String(index), event, lane: event.event_type.startsWith('model.') ? 1 : event.event_type.startsWith('tool.') ? 2 : 0 }));
  const edges = nodes.slice(1).map((n, i) => ({ from: String(i), to: n.id, kind: 'order' }));
  const starts = new Map(), counts = new Map();
  for (const e of events) {
    const kind = e.event_type.split('.')[0], id = kind === 'tool' ? e.tool_call_id : kind === 'model' ? e.model_call_id : null;
    if (!id) continue;
    const key = kind + ':' + id + ':' + e.event_type;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const n of nodes) {
    const e = n.event, kind = e.event_type.split('.')[0];
    const id = kind === 'tool' ? e.tool_call_id : kind === 'model' ? e.model_call_id : null;
    if (!id) continue;
    const key = kind + ':' + id;
    if (e.event_type.endsWith('.started')) { const list = starts.get(key) ?? []; list.push(n.id); starts.set(key, list); }
    if (e.event_type.endsWith('.ended')) {
      const matches = starts.get(key);
      // Duplicated IDs are ambiguous: do not invent a pairing.
      if (matches?.length === 1 && counts.get(key + ':' + kind + '.started') === 1 && counts.get(key + ':' + kind + '.ended') === 1)
        edges.push({ from: matches[0], to: n.id, kind: 'call' });
    }
  }
  return { nodes, edges };
}
