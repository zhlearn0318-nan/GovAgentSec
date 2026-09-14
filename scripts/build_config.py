"""Generate a reviewable OpenClaw config batch, preserving unrelated plugins/MCP."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build(current: dict, state: Path, docker: Path) -> list[dict]:
    modules = ROOT / 'modules'
    aegis = modules / 'aegis'
    group1 = modules / 'protect-agent-group1' / '智能体安全'
    group2 = modules / 'agentguard-group2'
    group4 = modules / 'supply-chain-group4'
    python = aegis / '.runtime_mcp313' / 'Scripts' / 'python.exe'
    if not python.exists():
        python = aegis / '.runtime_mcp313' / 'python.exe'
    py2 = str(group2 / '.venv' / 'Scripts' / 'python.exe')
    pipeline = str(group4 / '02-Skill供应链安全检测流水线' / 'skill_security_pipeline.py')
    data = aegis / 'demo_web' / 'data' / 'openclaw-final'
    runtime = group2 / 'live-runtime'
    roots = [state / name for name in ('workspace', 'plugin-skills', 'skill-workshop')]
    roots.append(aegis / 'fixtures')
    plugin_paths = [str(aegis / 'demo_web' / 'openclaw_plugin' / 'aegis-admission-ui'), str(group2 / 'integrations' / 'openclaw_runtime_security_plugin'), str(group1 / 'integrations' / 'openclaw' / 'plugin')]
    ids = ('aegis-admission-ui', 'agentguard-runtime-security', 'protect-agent')
    plugins = current.get('plugins', {})
    old_paths = plugins.get('load', {}).get('paths', [])
    paths = [p for p in old_paths if Path(p).name not in {'aegis-admission-ui', 'openclaw_runtime_security_plugin'} and not ('protect-agent-group1' in p and p.endswith('plugin'))]
    paths = list(dict.fromkeys(paths + plugin_paths))
    environment = {key: os.environ[key] for key in ('SYSTEMROOT', 'WINDIR', 'LOCALAPPDATA', 'ProgramFiles', 'PATHEXT') if key in os.environ}
    environment.update({
        'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8',
        'DOCKER_CONFIG': str(Path.home() / '.docker'),
        'PATH': os.pathsep.join([str(docker.parent), str(Path(os.environ.get('WINDIR', 'C:/Windows')) / 'System32'), os.environ.get('WINDIR', 'C:/Windows')]),
        'AEGIS_OPENCLAW_SCAN_TIMEOUT_SECONDS': '60', 'AEGIS_OPENCLAW_REVIEW_MODE': 'block',
        'AEGIS_OPENCLAW_DYNAMIC_SKILL_POLICY': 'required', 'AEGIS_SEMANTIC_MODEL_MODE': 'local',
        'AEGIS_EXTERNAL_LLM_OPT_IN': '0',
        'AEGIS_OPENCLAW_AUDIT_DB': str(data / 'admission_audit.db'),
        'AEGIS_CUSTOM_RULES_PATH': str(data / 'custom_rules.json'),
        'AEGIS_ORIGINAL_POLICY_SCRIPT': str(aegis / 'demo_web' / 'tools' / 'openclaw_install_policy.py'),
        'GROUP4_PIPELINE_SCRIPT': pipeline,
        'GROUP4_AUDIT_REPORT_DIR': str(runtime / 'group4-install-reports'),
    })
    prior_policy = current.get('security', {}).get('installPolicy', {})
    if prior_policy.get('enabled'):
        args = prior_policy.get('exec', {}).get('args', [])
        if not any('openclaw_install_policy' in str(arg) or 'combined_install_policy' in str(arg) for arg in args):
            raise ValueError('An unrelated installation policy is active. Integrate it explicitly before installing GovAgentSec.')
    values = {
        'plugins.load.paths': paths,
        'plugins.entries.aegis-admission-ui': {'enabled': True},
        'plugins.entries.agentguard-runtime-security': {'enabled': True, 'config': {
            'agentGuardBaseUrl': 'http://127.0.0.1:8080',
            'auditPath': str(runtime / 'state' / 'enforcement_audit.jsonl'),
            'statusPath': str(runtime / 'mcp-control-statuses.json'),
            'approvalPath': str(runtime / 'operator-approvals.json'),
        }},
        'plugins.entries.protect-agent': {'enabled': True, 'config': {
            'mode': 'real', 'baseUrl': 'http://127.0.0.1:19171',
            'pythonPath': str(ROOT / '.runtime' / 'protect' / 'Scripts' / 'python.exe'),
            'projectRoot': str(group1), 'modelRoot': str(ROOT / 'models'),
            'trustRagModule': str(ROOT / 'third_party' / 'TrustRAG' / 'defend_module.py'),
            'tokenFile': str(state / 'govagentsec' / 'protect-agent.token'),
            'requestTimeoutMs': 60000, 'startupTimeoutMs': 300000,
        }},
        'gateway.controlUi.embedSandbox': 'trusted',
        'hooks.internal.enabled': True,
        'hooks.internal.entries.supply-chain-security': {'enabled': True},
        'security.installPolicy': {'enabled': True, 'targets': ['skill', 'plugin'], 'exec': {
            'source': 'exec', 'command': str(python),
            'args': [str(group4 / 'integration' / 'combined_install_policy.py')],
            'timeoutMs': 135000, 'noOutputTimeoutMs': 135000, 'maxOutputBytes': 1048576,
            'passEnv': [], 'env': environment,
            'trustedDirs': [str(python.parent), str(group4 / 'integration'), str(aegis / 'demo_web' / 'tools')],
            'allowInsecurePath': True,
        }},
        'mcp.servers.agentguard-notices': {'command': py2, 'args': ['-m', 'integrations.openclaw_mcp'], 'cwd': str(group2), 'env': {
            'AGENTGUARD_MCP_BASE_URL': 'http://127.0.0.1:8080',
            'AGENTGUARD_MCP_IDENTITY_MODE': 'loopback_static_dev',
            'AGENTGUARD_MCP_DEV_SUBJECT_FILE': str(group2 / 'integrations' / 'openclaw_mcp' / 'dev-subject.example.json'),
            'AGENTGUARD_MCP_STATUS_STORE_FILE': str(runtime / 'mcp-control-statuses.json'),
        }, 'requestTimeoutMs': 20000, 'connectionTimeoutMs': 8000, 'supportsParallelToolCalls': False,
            'toolFilter': {'include': ['list_notices', 'request_test_payment', 'run_protected_command', 'get_control_request_status']}},
        'mcp.servers.supply-chain-security': {'command': py2, 'args': [str(group4 / 'integration' / 'group4_mcp_server.py')], 'cwd': str(group4), 'env': {
            'GROUP4_PIPELINE_SCRIPT': pipeline, 'GROUP4_REPORT_DIR': str(runtime / 'group4-reports'),
            'GROUP4_ALLOWED_ROOTS': os.pathsep.join(map(str, roots)),
        }, 'requestTimeoutMs': 30000, 'connectionTimeoutMs': 8000, 'supportsParallelToolCalls': False,
            'toolFilter': {'include': ['security_scan']}},
    }
    if 'allow' in plugins:
        values['plugins.allow'] = list(dict.fromkeys(plugins['allow'] + list(ids)))
    return [{'path': path, 'value': value} for path, value in values.items()]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--docker', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    current = json.loads((args.state / 'openclaw.json').read_text(encoding='utf-8-sig'))
    batch = build(current, args.state.resolve(), args.docker.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(batch, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Generated configuration batch; no current configuration was changed.')
