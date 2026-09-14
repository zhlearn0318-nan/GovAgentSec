import { createGuardRun, progressGuardRun, summarizeGuardRun } from "./guard-state.mjs";

const form = document.querySelector("#composer");
const promptInput = document.querySelector("#prompt");
const messageList = document.querySelector("#message-list");
const stepsList = document.querySelector("#guard-steps");
const summaryText = document.querySelector("#guard-summary-text");
const guardMeta = document.querySelector("#guard-meta");
const guardToggle = document.querySelector("#guard-toggle");
const guardPanel = document.querySelector("#guard-panel");
const sendButton = document.querySelector(".send-button");

const idleSteps = [
  ["输入边界检查", "校验长度、来源与控制字符"],
  ["双模型注入检测", "PIGuard · Qwen3Guard"],
  ["风险策略决策", "合并信号并执行安全策略"],
  ["输出内容复检", "敏感信息与越权行为审查"],
];

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function timeNow() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function renderIdleSteps() {
  stepsList.replaceChildren();
  idleSteps.forEach(([label, detail]) => {
    const item = createElement("li", "guard-step guard-step--ready");
    item.append(
      createElement("span", "step-marker", "·"),
      createElement("span", "step-copy"),
    );
    item.lastElementChild.append(
      createElement("strong", "", label),
      createElement("small", "", detail),
    );
    stepsList.append(item);
  });
}

function markerFor(status) {
  return {
    active: "",
    passed: "✓",
    blocked: "!",
    skipped: "–",
    pending: "",
  }[status] ?? "·";
}

function renderRun(run) {
  summaryText.textContent = summarizeGuardRun(run);
  stepsList.setAttribute("aria-busy", String(run.status === "running"));
  guardToggle.dataset.state = run.status;
  guardPanel.dataset.state = run.status;
  stepsList.replaceChildren();

  run.steps.forEach((step) => {
    const item = createElement("li", `guard-step guard-step--${step.status}`);
    const marker = createElement("span", "step-marker", markerFor(step.status));
    if (step.status === "active") marker.setAttribute("aria-label", "检查中");
    const copy = createElement("span", "step-copy");
    copy.append(createElement("strong", "", step.label), createElement("small", "", step.detail));
    const state = createElement("span", "step-state", {
      active: "检查中",
      passed: "通过",
      blocked: "拦截",
      skipped: "跳过",
      pending: "等待",
    }[step.status]);
    item.append(marker, copy, state);
    stepsList.append(item);
  });

  const score = Math.round(run.riskScore * 100);
  guardMeta.replaceChildren(
    createElement("span", "", run.promptPreview),
    createElement("strong", "", run.status === "running" ? "分析中" : `风险 ${score}%`),
  );
}

function addUserMessage(text) {
  const article = createElement("article", "message message--user message--entering");
  const bubble = createElement("div", "bubble", text);
  const footer = createElement("footer");
  footer.append(
    createElement("strong", "", "You"),
    createElement("time", "", timeNow()),
    createElement("span", "user-avatar", "你"),
  );
  article.append(bubble, footer);
  messageList.append(article);
}

function addAssistantMessage() {
  const article = createElement("article", "message message--assistant message--entering");
  const avatar = createElement("div", "assistant-avatar");
  avatar.setAttribute("aria-hidden", "true");
  const mark = createElement("span", "claw-mark");
  mark.append(createElement("span"));
  avatar.append(mark);

  const body = createElement("div");
  body.append(createElement("div", "bubble", "这条消息已完成输入检查、注入检测、策略判断和输出复检。未发现异常风险，可以安全处理。"));
  const footer = createElement("footer");
  footer.append(
    createElement("strong", "", "Assistant"),
    createElement("time", "", timeNow()),
    createElement("span", "verified", "✓ 已检查"),
  );
  body.append(footer);
  article.append(avatar, body);
  messageList.append(article);
}

function addBlockedMessage(run) {
  const notice = createElement("article", "blocked-notice message--entering");
  const icon = createElement("span", "blocked-icon", "!");
  const copy = createElement("div");
  copy.append(
    createElement("strong", "", "消息已被安全策略拦截"),
    createElement("p", "", `检测到${run.category}风险，内容未发送给模型。`),
  );
  notice.append(icon, copy, createElement("span", "blocked-code", "RISK_HIGH"));
  messageList.append(notice);
}

function scrollConversation() {
  messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
}

async function runProtection(text) {
  let run = createGuardRun(text);
  renderRun(run);
  guardPanel.hidden = false;
  guardToggle.setAttribute("aria-expanded", "true");

  while (run.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, 620));
    run = progressGuardRun(run);
    renderRun(run);
  }

  await new Promise((resolve) => setTimeout(resolve, 240));
  if (run.status === "blocked") addBlockedMessage(run);
  else addAssistantMessage();
  scrollConversation();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = promptInput.value.trim().slice(0, 16_000);
  if (!text || sendButton.disabled) return;

  addUserMessage(text);
  scrollConversation();
  promptInput.value = "";
  promptInput.style.height = "auto";
  sendButton.disabled = true;
  promptInput.disabled = true;
  await runProtection(text);
  sendButton.disabled = false;
  promptInput.disabled = false;
  promptInput.focus();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 144)}px`;
});

guardToggle.addEventListener("click", () => {
  const expanded = guardToggle.getAttribute("aria-expanded") === "true";
  guardToggle.setAttribute("aria-expanded", String(!expanded));
  guardPanel.hidden = expanded;
});

renderIdleSteps();

if (window.matchMedia("(max-width: 680px)").matches) {
  guardToggle.setAttribute("aria-expanded", "false");
  guardPanel.hidden = true;
}
