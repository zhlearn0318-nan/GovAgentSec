// Keep host task metadata separate from external text. Do not manufacture a
// JSON envelope around text already rendered for the model.
export function toolPayloads(downstream, result) {
  const replacedValue = Object.hasOwn(downstream, 'value');
  const value = replacedValue ? downstream.value : result.value;
  const renderedValue = value === undefined ? undefined : JSON.stringify(value);
  const texts = [];
  function add(text) {
    if (typeof text !== 'string' || text.length > 256_000) throw Error('Unsupported tool payload');
    if (text.trim() && !texts.includes(text)) texts.push(text);
  }
  function blocks(content) {
    if (!Array.isArray(content)) throw Error('Unsupported tool content');
    for (const block of content) {
      if (!['text', 'reasoning'].includes(block.type)) throw Error('Unsupported tool content');
      // A renderer's exact JSON echo of the canonical value adds no new text.
      if (block.text !== renderedValue) add(block.text);
    }
  }
  if (!replacedValue || downstream.content) blocks(downstream.content ?? result.content ?? []);
  for (const context of downstream.additionalContexts ?? result.additionalContexts ?? []) blocks(context.content);
  if (value !== undefined) {
    for (const item of Array.isArray(value) ? value : [value]) add(typeof item === 'string' ? item : JSON.stringify(item));
  }
  if (texts.length > 16 || texts.reduce((sum, text) => sum + text.length, 0) > 256_000) throw Error('Tool payload exceeds supported limits');
  return texts;
}

export function quotedTaskIntent(task) {
  return /\b(?:explain|analy[sz]e|review|translate|quote|discuss)\b[\s\S]{0,300}\b(?:quot(?:e|ed|ation)|instruction|sentence|text)\b/i.test(task)
    || /(?:解释|分析|翻译|审查|讨论|引用).{0,100}(?:引用|指令|句子|文本|原文)/.test(task);
}

export function toolDocumentBatch(downstream, result, texts) {
  const value = Object.hasOwn(downstream, 'value') ? downstream.value : result.value;
  if (Array.isArray(value)) {
    const documents = [...new Set(value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).filter(text => text.trim()))];
    return documents.length > 1 && documents.length === texts.length && documents.every(text => texts.includes(text));
  }
  return value === undefined && !((downstream.additionalContexts ?? result.additionalContexts)?.length)
    && (downstream.content ?? result.content)?.length > 1 && texts.length > 1;
}
