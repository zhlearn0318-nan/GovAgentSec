import { StringDecoder } from 'node:string_decoder';
import { normalizeUsage } from '../govagentsec-trace/usage.mjs';

export function correlationKey(trace) {
  const { traceId, spanId } = trace ?? {};
  return /^[a-f0-9]{32}$/.test(traceId ?? '') && !/^0+$/.test(traceId)
    && /^[a-f0-9]{16}$/.test(spanId ?? '') && !/^0+$/.test(spanId) ? `${traceId}/${spanId}` : null;
}
export function headerKey(header) {
  const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-[a-f0-9]{2}$/.exec(header ?? '');
  return match ? correlationKey({ traceId: match[1], spanId: match[2] }) : null;
}
export function upstreamUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return normalizeUsage({ input: value.prompt_tokens, output: value.completion_tokens, total: value.total_tokens,
    cacheRead: value.prompt_cache_hit_tokens ?? value.prompt_tokens_details?.cached_tokens,
    cacheWrite: value.cache_creation_input_tokens });
}

// Bounded side-channel parser: raw bytes still stream directly to the client.
export class UsageParser {
  constructor(sse, limit = 1024 * 1024) {
    this.sse = sse; this.limit = limit; this.decoder = new StringDecoder('utf8');
    this.buffer = ''; this.data = []; this.frameBytes = 0; this.usage = null; this.reason = null; this.done = false;
  }
  fail(reason) { this.reason ??= reason; this.buffer = ''; this.data = []; this.usage = null; }
  json(text) {
    try {
      const body = JSON.parse(text);
      if (body.usage == null) return;
      const usage = upstreamUsage(body.usage);
      if (!usage) return this.fail('usage_wrapper_invalid_usage');
      if (this.usage && JSON.stringify(this.usage) !== JSON.stringify(usage)) return this.fail('usage_wrapper_conflicting_usage');
      this.usage = usage;
    } catch { this.fail('usage_wrapper_parse_error'); }
  }
  feed(bytes) {
    if (this.reason) return;
    this.buffer += this.decoder.write(bytes);
    if (Buffer.byteLength(this.buffer) > this.limit) return this.fail('usage_wrapper_capture_limit');
    if (!this.sse) return;
    let end;
    while (!this.reason && (end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end).replace(/\r$/, ''); this.buffer = this.buffer.slice(end + 1);
      if (!line) {
        const data = this.data.join('\n'); this.data = []; this.frameBytes = 0;
        if (data === '[DONE]') this.done = true;
        else if (data) this.json(data);
      } else if (line.startsWith('data:')) {
        this.frameBytes += Buffer.byteLength(line);
        if (this.frameBytes > this.limit) return this.fail('usage_wrapper_capture_limit');
        this.data.push(line.slice(5).replace(/^ /, ''));
      }
    }
  }
  finish() {
    this.buffer += this.decoder.end();
    if (!this.reason && !this.sse) this.json(this.buffer);
    if (!this.reason && this.sse && !this.done) this.fail('usage_wrapper_incomplete_stream');
    return { usage: this.reason ? null : this.usage, token_missing_reason: this.reason ?? (this.usage ? null : 'usage_wrapper_upstream_no_usage') };
  }
}
