import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";


const STEP_DEFINITIONS = Object.freeze([
  { id: "input", label: "输入安全检查", detail: "边界校验 · PIGuard · Qwen3Guard" },
  { id: "policy", label: "风险策略决策", detail: "风险合并与策略执行" },
  { id: "tools", label: "工具与外部内容", detail: "权限、参数与返回内容" },
  { id: "output", label: "模型输出复检", detail: "敏感信息与越权行为" },
]);

const STEP_IDS = new Set(STEP_DEFINITIONS.map((step) => step.id));
const STEP_STATUSES = new Set([
  "pending",
  "active",
  "passed",
  "monitoring",
  "review",
  "blocked",
  "skipped",
  "error",
]);
const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const DECISIONS = new Set(["ALLOW", "REVIEW", "BLOCK"]);
const RUN_STATUSES = new Set(["idle", "running", "allowed", "blocked"]);

function normalizeRiskLevel(value) {
  return RISK_LEVELS.has(value) ? value : null;
}

function normalizeRiskScore(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}

function normalizeDecision(value) {
  return DECISIONS.has(value) ? value : null;
}

function createRunState(now) {
  return {
    version: "1",
    sequence: 0,
    updatedAt: now,
    status: "running",
    decision: null,
    riskLevel: null,
    riskScore: null,
    steps: STEP_DEFINITIONS.map((step, index) => ({
      ...step,
      status: index === 0 ? "active" : "pending",
    })),
  };
}

function publicSnapshot(state) {
  return structuredClone(state);
}

function normalizePersistedSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (
    value.version !== "1" ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 0 ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    !RUN_STATUSES.has(value.status) ||
    (value.decision !== null && !DECISIONS.has(value.decision)) ||
    (value.riskLevel !== null && !RISK_LEVELS.has(value.riskLevel)) ||
    (value.riskScore !== null && normalizeRiskScore(value.riskScore) !== value.riskScore) ||
    !Array.isArray(value.steps)
  ) {
    return null;
  }
  const statuses = new Map();
  for (const step of value.steps) {
    if (
      !step ||
      typeof step !== "object" ||
      !STEP_IDS.has(step.id) ||
      !STEP_STATUSES.has(step.status) ||
      statuses.has(step.id)
    ) {
      return null;
    }
    statuses.set(step.id, step.status);
  }
  if (statuses.size !== STEP_DEFINITIONS.length) return null;
  return {
    version: "1",
    sequence: value.sequence,
    updatedAt: value.updatedAt,
    status: value.status,
    decision: value.decision,
    riskLevel: value.riskLevel,
    riskScore: value.riskScore,
    steps: STEP_DEFINITIONS.map((step) => ({ ...step, status: statuses.get(step.id) })),
  };
}

function createSnapshotBridge(snapshotFile, onPersistenceError) {
  if (typeof snapshotFile !== "string" || snapshotFile.length === 0) return null;
  let temporarySequence = 0;
  let reportedFailure = false;

  function report(error) {
    if (reportedFailure || typeof onPersistenceError !== "function") return;
    reportedFailure = true;
    onPersistenceError(error);
  }

  return {
    read() {
      try {
        return normalizePersistedSnapshot(JSON.parse(readFileSync(snapshotFile, "utf8")));
      } catch (error) {
        if (error?.code !== "ENOENT") report(error);
        return null;
      }
    },

    write(snapshot) {
      temporarySequence += 1;
      const temporaryFile = `${snapshotFile}.${process.pid}.${temporarySequence}.tmp`;
      try {
        writeFileSync(temporaryFile, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 });
        renameSync(temporaryFile, snapshotFile);
        reportedFailure = false;
      } catch (error) {
        try {
          unlinkSync(temporaryFile);
        } catch {
          // The temporary file may not have been created or may already have been renamed.
        }
        report(error);
      }
    },
  };
}

export function createGuardEventStore(options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const bridge = createSnapshotBridge(options.snapshotFile, options.onPersistenceError);
  const maximumRuns = Number.isInteger(options.maximumRuns)
    ? Math.max(1, Math.min(1_024, options.maximumRuns))
    : 128;
  const runs = new Map();
  let sequence = 0;
  let latest = {
    version: "1",
    sequence,
    updatedAt: now(),
    status: "idle",
    decision: null,
    riskLevel: null,
    riskScore: null,
    steps: STEP_DEFINITIONS.map((step) => ({ ...step, status: "pending" })),
  };

  function publish(key, state) {
    const shared = bridge?.read();
    if (shared) sequence = Math.max(sequence, shared.sequence);
    sequence += 1;
    state.sequence = sequence;
    state.updatedAt = now();
    runs.delete(key);
    runs.set(key, state);
    while (runs.size > maximumRuns) runs.delete(runs.keys().next().value);
    latest = publicSnapshot(state);
    bridge?.write(latest);
    return publicSnapshot(latest);
  }

  function current(key) {
    return runs.get(key);
  }

  return {
    beginRun(key) {
      if (typeof key !== "string" || !key) return publicSnapshot(latest);
      return publish(key, createRunState(now()));
    },

    completeInput(key, result = {}) {
      const state = current(key);
      if (!state) return publicSnapshot(latest);
      const decision = normalizeDecision(result.decision) ?? "BLOCK";
      const allowed = decision === "ALLOW";
      state.riskLevel = normalizeRiskLevel(result.riskLevel);
      state.riskScore = normalizeRiskScore(result.riskScore);
      state.decision = allowed ? null : decision;
      state.status = allowed ? "running" : "blocked";
      state.steps[0].status = "passed";
      state.steps[1].status = allowed ? "passed" : "blocked";
      state.steps[2].status = allowed ? "monitoring" : "skipped";
      state.steps[3].status = allowed ? "pending" : "skipped";
      return publish(key, state);
    },

    beginPhase(key, phaseId) {
      const state = current(key);
      if (!state || !STEP_IDS.has(phaseId) || state.status === "blocked") {
        return publicSnapshot(latest);
      }
      if (phaseId === "output" && state.steps[2].status === "monitoring") {
        state.steps[2].status = "passed";
      }
      state.steps.find((step) => step.id === phaseId).status = "active";
      state.status = "running";
      return publish(key, state);
    },

    completePhase(key, phaseId, result = {}) {
      const state = current(key);
      if (!state || !STEP_IDS.has(phaseId) || state.status === "blocked") {
        return publicSnapshot(latest);
      }
      const status = STEP_STATUSES.has(result.status) ? result.status : "error";
      const step = state.steps.find((item) => item.id === phaseId);
      step.status = status;
      state.riskLevel = normalizeRiskLevel(result.riskLevel) ?? state.riskLevel;
      state.riskScore = normalizeRiskScore(result.riskScore) ?? state.riskScore;
      const decision = normalizeDecision(result.decision);
      if (phaseId === "output") {
        const allowed = status === "passed" && decision === "ALLOW";
        state.status = allowed ? "allowed" : "blocked";
        state.decision = allowed ? "ALLOW" : "BLOCK";
      } else if (status === "blocked" || status === "error") {
        state.status = "blocked";
        state.decision = "BLOCK";
        for (const item of state.steps) {
          if (item.status === "pending" || item.status === "monitoring") item.status = "skipped";
        }
      }
      return publish(key, state);
    },

    snapshot() {
      const shared = bridge?.read();
      if (
        shared &&
        (shared.updatedAt > latest.updatedAt || shared.sequence > latest.sequence)
      ) {
        latest = publicSnapshot(shared);
        sequence = Math.max(sequence, shared.sequence);
      }
      return publicSnapshot(latest);
    },

    has(key) {
      return runs.has(key);
    },
  };
}
