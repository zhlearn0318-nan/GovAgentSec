import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join } from 'node:path';

export const skillBodyHash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex');

export function createSkillAdmission({ lookup, scan, render }) {
  return async (name, options) => {
    if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw Error('Invalid skill name');
    const skill = await lookup(name, options);
    const path = skill?.path ?? (skill?.resourceBase?.kind === 'directory' ? join(skill.resourceBase.path, 'SKILL.md') : undefined);
    if (typeof path !== 'string' || !isAbsolute(path) || basename(path) !== 'SKILL.md' || typeof skill.content !== 'string') {
      throw Error('Skill does not expose an inspectable local bundle');
    }
    const result = await scan(dirname(path), options.signal, options);
    if (!['ALLOW', 'REVIEW', 'BLOCK'].includes(result.decision)
        || !/^[a-f0-9]{64}$/.test(result.tree_sha256)
        || result.manifest_body_sha256 !== skillBodyHash(skill.content)) throw Error('Loaded skill does not match scanned instructions');
    const expectedValue = { name: skill.name, provider: skill.provider,
      ...(skill.resourceBase !== undefined ? { resourceBase: { ...skill.resourceBase } } : {}), content: skill.content };
    return { decision: result.decision, treeSha256: result.tree_sha256, bodySha256: result.manifest_body_sha256,
      content: skill.content, expectedValue, renderedText: render ? await render(skill) : undefined };
  };
}

export function skillScreenTexts(texts, admission) {
  if (typeof admission?.renderedText !== 'string' || typeof admission.content !== 'string') return texts;
  const canonicalValue = JSON.stringify(admission.expectedValue);
  return [...new Set(texts.map(text => text === admission.renderedText || text === canonicalValue ? admission.content : text))];
}
