"""Bounded, read-only Aegis + Group4 static checks for the Harness tool.

This is deliberately not the OpenClaw install protocol, Cisco scanner, semantic
model, or Docker sandbox. The response declares its exact coverage.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def _linked(path: Path) -> bool:
    return path.is_symlink() or bool(getattr(path.lstat(), 'st_file_attributes', 0) & 0x400)


def _validate(target: Path, roots: list[Path]) -> Path:
    if not target.is_absolute() or _linked(target):
        raise ValueError('Target must be an absolute ordinary directory')
    # Reject junctions/symlinks in every component, not just the leaf directory.
    if any(_linked(parent) for parent in target.parents):
        raise ValueError('Target contains a linked directory')
    target = target.resolve(strict=True)
    if not target.is_dir() or not any(target.is_relative_to(root.resolve(strict=True)) for root in roots):
        raise ValueError('Target is outside the configured scan roots')
    count = total = 0
    for directory, dirs, files in os.walk(target, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            if _linked(path):
                raise ValueError('Linked scan entries are not allowed')
            count += 1
            if count > 500:
                raise ValueError('Scan tree exceeds 500 entries')
            if path.is_file():
                size = path.stat().st_size
                total += size
                if size > 1024 * 1024 or total > 5 * 1024 * 1024:
                    raise ValueError('Scan tree exceeds the file or total byte limit')
    return target


def scan(target: Path, roots: list[Path]) -> dict:
    target = _validate(target, roots)
    def tree_digest():
        digest = hashlib.sha256()
        for path in sorted(target.rglob('*')):
            if path.is_file():
                digest.update(path.relative_to(target).as_posix().encode('utf-8') + b'\0')
                digest.update(hashlib.sha256(path.read_bytes()).digest())
        return digest.hexdigest()
    before = tree_digest()
    sys.path.insert(0, str(ROOT / 'modules/aegis/demo_web'))
    from backend.skill_static_pipeline import run_local_skill_static_pipeline
    from backend.policy import evaluate_findings
    local = run_local_skill_static_pipeline(target)
    findings, analyzers = local['findings'], local['analyzers']
    local_decision = evaluate_findings(findings).decision.value
    pipeline_path = ROOT / 'modules/supply-chain-group4/02-Skill供应链安全检测流水线/skill_security_pipeline.py'
    spec = importlib.util.spec_from_file_location('harness_group4_pipeline', pipeline_path)
    pipeline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pipeline)
    static = pipeline.第一关静态扫描(str(target))
    permissions = pipeline.第二关权限校验(str(target))
    behavior = pipeline.第三关行为检测(str(target))
    high = local_decision == 'BLOCK'
    high = high or bool(static.get('高危数', 0)) or any(item.get('等级') == '高危' for item in behavior.get('风险列表', []))
    review = local_decision == 'REVIEW' or bool(static.get('风险数', 0) or behavior.get('风险数', 0))
    # Group4 returns 完成, not 通过. Consume its explicit level instead of
    # treating every successfully checked package as an unavailable check.
    permission_complete = permissions.get('状态') == '完成'
    permission_level = permissions.get('权限风险等级')
    known_permission = permissions.get('授权等级') in {'公开', 'public', '普通', 'internal', '敏感', 'sensitive', '绝密', 'secret'}
    high = high or (permission_complete and not known_permission)
    review = review or not (permission_complete and known_permission and permission_level == 0)
    manifest = (target / 'SKILL.md').read_text(encoding='utf-8').replace('\r\n', '\n')
    body = re.sub(r'\A---\n.*?\n---(?:\n|$)', '', manifest, count=1, flags=re.DOTALL).strip()
    _validate(target, roots)
    if tree_digest() != before:
        raise ValueError('Skill changed during scanning')
    return {
        'decision': 'BLOCK' if high else 'REVIEW' if review else 'ALLOW',
        'target': str(target), 'aegis_findings': findings[:100],
        'analyzers': sorted(set(analyzers)), 'group4_static_high': static.get('高危数', 0),
        'group4_static': static, 'group4_permissions': permissions, 'group4_behavior': behavior,
        'tree_sha256': before, 'manifest_body_sha256': hashlib.sha256(body.encode('utf-8')).hexdigest(),
        'dynamic_execution': False, 'installed': False,
        'coverage': 'All existing Aegis local static/semantic/capability/context checks with F3 and Group4 static/permission/code-behavior; no Cisco vendor scan, external semantic model, Docker execution, or plugin-install admission.',
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--path', required=True)
    parser.add_argument('--roots-json', required=True)
    args = parser.parse_args()
    try:
        roots = json.loads(args.roots_json)
        if not isinstance(roots, list) or not roots or not all(isinstance(root, str) for root in roots):
            raise ValueError('Invalid scan roots')
        print(json.dumps(scan(Path(args.path), [Path(root) for root in roots]), ensure_ascii=False))
        return 0
    except Exception:
        print(json.dumps({'decision': 'BLOCK', 'error': 'Scan unavailable or target outside configured limits', 'installed': False}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
