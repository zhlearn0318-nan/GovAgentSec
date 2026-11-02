import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedBrowserOrigin } from './browser_origin.js';

test('browser requests support the sandbox and same-origin host including port', () => {
  for (const origin of [undefined, 'null', 'http://127.0.0.1:18789', 'https://127.0.0.1:18789']) {
    assert.equal(isAllowedBrowserOrigin({headers:{host:'127.0.0.1:18789',origin}}),true);
  }
});
test('foreign and malformed origins remain rejected', () => {
  for (const origin of ['http://evil.example', 'http://127.0.0.1:18790', 'http://127.0.0.1:18789.evil.example', 'file://127.0.0.1:18789', 'http://127.0.0.1:18789/path', 'http://user@127.0.0.1:18789', 'not-an-origin']) {
    assert.equal(isAllowedBrowserOrigin({headers:{host:'127.0.0.1:18789',origin}}),false,origin);
  }
});
