import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGuardEventStore } from "../guard-events.mjs";


test("a run snapshot exposes phases but no run or conversation identifier", () => {
  const store = createGuardEventStore({ now: () => 1_000 });

  store.beginRun("agent:main:secret-session");
  const snapshot = store.snapshot();

  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.steps[0].status, "active");
  assert.equal(JSON.stringify(snapshot).includes("secret-session"), false);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "decision",
    "riskLevel",
    "riskScore",
    "sequence",
    "status",
    "steps",
    "updatedAt",
    "version",
  ]);
});

test("input allow advances the real run to tool monitoring", () => {
  const store = createGuardEventStore({ now: () => 2_000 });

  store.beginRun("run-1");
  store.completeInput("run-1", {
    decision: "ALLOW",
    riskLevel: "LOW",
    riskScore: 0.04,
  });
  const snapshot = store.snapshot();

  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.steps[0].status, "passed");
  assert.equal(snapshot.steps[1].status, "passed");
  assert.equal(snapshot.steps[2].status, "monitoring");
  assert.equal(snapshot.riskScore, 0.04);
});

test("input block records the policy decision without retaining categories", () => {
  const store = createGuardEventStore({ now: () => 3_000 });

  store.beginRun("run-2");
  store.completeInput("run-2", {
    decision: "BLOCK",
    riskLevel: "HIGH",
    riskScore: 0.96,
    categories: ["secret category"],
  });
  const snapshot = store.snapshot();

  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.decision, "BLOCK");
  assert.equal(snapshot.steps[1].status, "blocked");
  assert.equal(JSON.stringify(snapshot).includes("secret category"), false);
});

test("output screening completes a safe run", () => {
  const store = createGuardEventStore({ now: () => 4_000 });

  store.beginRun("run-3");
  store.completeInput("run-3", { decision: "ALLOW", riskLevel: "LOW", riskScore: 0.02 });
  store.beginPhase("run-3", "output");
  store.completePhase("run-3", "output", { status: "passed", decision: "ALLOW" });
  const snapshot = store.snapshot();

  assert.equal(snapshot.status, "allowed");
  assert.equal(snapshot.decision, "ALLOW");
  assert.equal(snapshot.steps[3].status, "passed");
});

test("a blocked run cannot be reopened by a later output event", () => {
  const store = createGuardEventStore({ now: () => 4_500 });

  store.beginRun("run-blocked");
  store.completeInput("run-blocked", { decision: "ALLOW", riskLevel: "LOW", riskScore: 0.02 });
  store.beginPhase("run-blocked", "tools");
  store.completePhase("run-blocked", "tools", { status: "blocked", decision: "BLOCK" });
  store.beginPhase("run-blocked", "output");
  store.completePhase("run-blocked", "output", { status: "passed", decision: "ALLOW" });
  const snapshot = store.snapshot();

  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.decision, "BLOCK");
  assert.equal(snapshot.steps[3].status, "skipped");
});

test("the store evicts old run keys while preserving the latest snapshot", () => {
  const store = createGuardEventStore({ maximumRuns: 2 });

  store.beginRun("first");
  store.beginRun("second");
  store.beginRun("third");

  assert.equal(store.has("first"), false);
  assert.equal(store.has("second"), true);
  assert.equal(store.snapshot().status, "running");
});

test("separate OpenClaw runtime instances share a sanitized snapshot", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "protect-agent-events-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const snapshotFile = join(directory, "state.json");
  const routeStore = createGuardEventStore({ snapshotFile, now: () => 10_000 });
  const hookStore = createGuardEventStore({ snapshotFile, now: () => 10_001 });

  hookStore.beginRun("private-runtime-key");
  hookStore.completeInput("private-runtime-key", {
    decision: "BLOCK",
    riskLevel: "HIGH",
    riskScore: 0.92,
    prompt: "never persist this prompt",
  });
  const snapshot = routeStore.snapshot();
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.sequence, 2);
  assert.equal(serialized.includes("private-runtime-key"), false);
  assert.equal(serialized.includes("never persist this prompt"), false);
});

test("a malformed shared snapshot is ignored", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "protect-agent-events-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const snapshotFile = join(directory, "state.json");
  const store = createGuardEventStore({ snapshotFile, now: () => 20_000 });

  writeFileSync(snapshotFile, '{"version":"1","status":"running","prompt":"secret"}', "utf8");

  assert.equal(store.snapshot().status, "idle");
  assert.equal(JSON.stringify(store.snapshot()).includes("secret"), false);
});
