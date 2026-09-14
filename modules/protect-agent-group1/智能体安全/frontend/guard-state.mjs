const STEP_BLUEPRINT = Object.freeze([
  { id: "intake", label: "输入边界检查", detail: "校验长度、来源与控制字符" },
  { id: "detectors", label: "双模型注入检测", detail: "PIGuard · Qwen3Guard" },
  { id: "policy", label: "风险策略决策", detail: "合并信号并执行安全策略" },
  { id: "output", label: "输出内容复检", detail: "敏感信息与越权行为审查" },
]);

const INJECTION_PATTERN = /忽略.{0,12}(之前|以上|系统)|系统提示词|泄露|越权|bypass|ignore previous/i;

function previewPrompt(prompt) {
  const normalized = String(prompt).trim();
  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized;
}

export function createGuardRun(prompt) {
  const suspicious = INJECTION_PATTERN.test(String(prompt));
  return {
    id: `guard-${Date.now()}`,
    status: "running",
    decision: null,
    riskLevel: suspicious ? "HIGH" : "LOW",
    riskScore: suspicious ? 0.94 : 0.06,
    category: suspicious ? "提示词注入" : null,
    promptPreview: previewPrompt(prompt),
    startedAt: new Date(),
    suspicious,
    steps: STEP_BLUEPRINT.map((step, index) => ({
      ...step,
      status: index === 0 ? "active" : "pending",
    })),
  };
}

export function progressGuardRun(run) {
  if (run.status !== "running") return run;
  const activeIndex = run.steps.findIndex((step) => step.status === "active");
  if (activeIndex < 0) return run;

  if (activeIndex === 2 && run.suspicious) {
    return {
      ...run,
      status: "blocked",
      decision: "BLOCK",
      steps: run.steps.map((step, index) => ({
        ...step,
        status: index === activeIndex ? "blocked" : index > activeIndex ? "skipped" : step.status,
      })),
    };
  }

  const hasNext = activeIndex < run.steps.length - 1;
  return {
    ...run,
    status: hasNext ? "running" : "allowed",
    decision: hasNext ? null : "ALLOW",
    steps: run.steps.map((step, index) => ({
      ...step,
      status: index === activeIndex ? "passed" : index === activeIndex + 1 ? "active" : step.status,
    })),
  };
}

export function summarizeGuardRun(run) {
  if (run.status === "blocked") return `已拦截 · ${run.category}`;
  if (run.status === "allowed") return `${run.steps.length} 项检查已通过`;
  const active = run.steps.find((step) => step.status === "active");
  return active ? `正在执行 · ${active.label}` : "准备检查";
}
