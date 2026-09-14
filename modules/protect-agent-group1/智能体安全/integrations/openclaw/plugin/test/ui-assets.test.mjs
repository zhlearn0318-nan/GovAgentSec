import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../ui/inject.js", import.meta.url), "utf8");

test("the injected UI builds untrusted state with text-only DOM APIs", () => {
  assert.equal(source.includes("innerHTML"), false);
  assert.equal(source.includes("insertAdjacentHTML"), false);
  assert.equal(source.includes("textContent"), true);
});

test("decorative panel glyphs are hidden from assistive technology", () => {
  assert.match(source, /chevron\.setAttribute\("aria-hidden", "true"\)/);
});
