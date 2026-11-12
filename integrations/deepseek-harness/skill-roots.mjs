import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

// Match the pinned host's project root selection. cwd must come from its
// workingDirectory service, never a model supplied scan path.
export function automaticSkillRoots(configured, cwd) {
  const roots = [...configured];
  if (cwd !== undefined) {
    if (!isAbsolute(cwd)) throw Error('Workspace must be absolute');
    let project = cwd;
    while (!existsSync(join(project, '.git'))) {
      const parent = dirname(project);
      if (parent === project) { project = cwd; break; }
      project = parent;
    }
    roots.push(join(project, '.dsh', 'skills'), join(project, '.agents', 'skills'));
  }
  return [...new Set(roots.filter(root => typeof root === 'string' && root.length > 0)
    .map(root => resolve(root)).filter(root => { try { return statSync(root).isDirectory(); } catch { return false; } }))];
}
