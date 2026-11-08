import http from 'node:http';
// Synthetic upstream responses only. No account, network outside loopback, or real task data.
export async function fixtureUpstream() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url, raw, headers: req.headers });
    const body = JSON.parse(raw), mode = body.model;
    if (mode === 'timeout') return;
    if (mode === 'error') { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' }); res.end('{"error":{"message":"synthetic quota"}}'); return; }
    if (mode === 'redirect') { res.writeHead(307, { location: 'https://example.invalid' }); res.end(); return; }
    const usage = mode === 'no-usage' ? undefined : mode === 'invalid' ? { prompt_tokens: -1 } : { prompt_tokens: mode === 'other' ? 23 : 12, completion_tokens: mode === 'other' ? 9 : 8, total_tokens: mode === 'other' ? 32 : 20 };
    if (mode === 'other') await new Promise(r => setTimeout(r, 20));
    const base = { id: 'synthetic-completion', object: 'chat.completion', created: 1, model: mode };
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: '合成回放完成' }, finish_reason: null }] }) + '\n\n');
      await new Promise(r => setTimeout(r, 15));
      res.end('data: ' + JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage }) + '\n\ndata: [DONE]\n\n');
    } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...base, choices: [{ index: 0, message: { role: 'assistant', content: '合成回放完成' }, finish_reason: 'stop' }], usage })); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + server.address().port, requests,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
