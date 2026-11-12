"""Prepare a local Cordis overlay; optionally merge it into the web profile.

No model credentials are read or copied. The existing profile is backed up and
only our marked block is replaced, leaving unrelated settings byte-for-byte.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
BEGIN = '# BEGIN GOVAGENTSEC MANAGED INTEGRATION'
END = '# END GOVAGENTSEC MANAGED INTEGRATION'


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--harness-root', type=Path, default=Path('D:/deepseek-harness'))
    parser.add_argument('--python', type=Path, default=Path('D:/软件/Qwen/.venv/Scripts/python.exe'))
    parser.add_argument('--model-root', type=Path, default=Path('D:/软件/Qwen/models'))
    parser.add_argument('--trustrag-module', type=Path, default=Path('D:/软件/Qwen/third_party/TrustRAG/defend_module.py'))
    parser.add_argument('--mode', choices=['real', 'baseline'], default='real')
    parser.add_argument('--port', type=int, default=19172)
    parser.add_argument('--install-profile', action='store_true')
    parser.add_argument('--with-agentguard', action='store_true', help='Attach the local AgentGuard controlled MCP tools')
    parser.add_argument('--dsh-home', type=Path, default=Path.home() / '.dsh')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('invalid sidecar port')
    for path in [args.harness_root / 'apps/cli/lib/bin.js', args.python]:
        if not path.is_file():
            parser.error(f'missing prerequisite: {path}')
    if args.mode == 'real':
        for path in [args.model_root / 'PIGuard', args.model_root / 'Qwen3Guard-Gen-0.6B', args.model_root / 'princeton-nlp-sup-simcse-bert-base-uncased', args.trustrag_module]:
            if not path.exists():
                parser.error(f'missing real-model prerequisite: {path}')
    runtime = ROOT / '.runtime/deepseek-harness'
    runtime.mkdir(parents=True, exist_ok=True)
    token = runtime / 'protect-agent.token'
    if not token.exists():
        token.write_text(secrets.token_hex(32), encoding='ascii')
        token.chmod(0o600)
    config = {
        'mode': args.mode, 'baseUrl': f'http://127.0.0.1:{args.port}',
        'pythonPath': str(args.python.resolve()),
        'projectRoot': str(ROOT / 'modules/protect-agent-group1/智能体安全'),
        'modelRoot': str(args.model_root.resolve()), 'trustRagModule': str(args.trustrag_module.resolve()),
        'tokenFile': str(token), 'requestTimeoutMs': 60_000, 'startupTimeoutMs': 300_000,
        'highImpactTools': ['bash', 'pwsh', 'exec', 'write', 'edit', 'apply_patch', 'run_code', 'cordis'],
        'auditFile': str(runtime / 'audit.jsonl'), 'scannerPython': sys.executable,
        'allowedRoots': [str(ROOT)],
    }
    entry = {'id': 'govagentsec-security', 'name': (ROOT / 'integrations/deepseek-harness/index.mjs').as_uri(), 'config': config}
    entries = [entry]
    if args.with_agentguard:
        group2 = ROOT / 'modules/agentguard-group2'
        agentguard_python = group2 / '.venv/Scripts/python.exe'
        for prerequisite in [agentguard_python, group2 / 'tools/opa.exe']:
            if not prerequisite.is_file():
                parser.error(f'missing AgentGuard prerequisite: {prerequisite}')
        entries.append({
            'id': 'govagentsec-agentguard-mcp', 'name': '@deepseek-ai/dsh-mcp-client',
            'config': {
                'serverName': 'agentguard', 'transport': 'stdio', 'command': str(agentguard_python),
                'args': ['-m', 'integrations.openclaw_mcp'], 'cwd': str(group2),
                'env': {
                    'PYTHONUTF8': '1', 'AGENTGUARD_MCP_BASE_URL': 'http://127.0.0.1:18080',
                    'AGENTGUARD_MCP_IDENTITY_MODE': 'loopback_static_dev',
                    'AGENTGUARD_MCP_DEV_SUBJECT_FILE': str(group2 / 'integrations/openclaw_mcp/dev-subject.example.json'),
                },
                'failOnStartupError': True,
            },
        })
    overlay = runtime / 'govagentsec.cordis.yml'
    overlay.write_text(json.dumps([{'insert': entries}], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    snippet = f'{BEGIN}\n- insert: {json.dumps(entries, ensure_ascii=False)}\n{END}\n'
    (runtime / 'profile-snippet.yml').write_text(snippet, encoding='utf-8')
    manifest = {
        'harnessRoot': str(args.harness_root.resolve()), 'dshHome': str(args.dsh_home.resolve()),
        'overlay': str(overlay), 'mode': args.mode, 'baseUrl': config['baseUrl'],
        'tokenFile': str(token), 'auditFile': config['auditFile'],
        'profileInstalled': False,
        'agentGuardEnabled': args.with_agentguard,
    }
    patch = args.dsh_home / 'profiles/web/cordis.patch.yml'
    existing = patch.read_text(encoding='utf-8') if patch.exists() else ''
    if not args.install_profile and BEGIN in existing:
        if snippet.rstrip('\n') not in existing:
            parser.error('An integration is already installed; use --install-profile to update it')
        manifest.update(profileInstalled=True, profilePatch=str(patch))
    if args.install_profile:
        if args.mode != 'real':
            parser.error('Only verified real-model configuration may be installed persistently')
        if not patch.exists():
            parser.error('Initialize the Harness web profile before installing')
        if existing.count(BEGIN) != existing.count(END) or existing.count(BEGIN) > 1:
            parser.error('Malformed managed profile block; refusing to edit')
        backup = runtime / f'profile-backup-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")}.yml'
        backup.write_bytes(patch.read_bytes())
        if BEGIN in existing:
            start = existing.index(BEGIN)
            end = existing.index(END, start) + len(END)
            updated = existing[:start] + snippet.rstrip('\n') + existing[end:]
        else:
            if existing.strip() == '[]':
                existing = ''
            updated = existing.rstrip('\n') + '\n' + snippet
        patch.write_text(updated, encoding='utf-8')
        manifest.update(profileInstalled=True, profilePatch=str(patch), backup=str(backup))
    (runtime / 'installation.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
