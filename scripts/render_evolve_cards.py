"""Render evolve evidence cards (scores / selection / admission) as PNGs for judge video."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path(r"C:\Users\23684\Desktop\GovAgentSec-evidence")
report = json.loads((out / "evolve-real-report.json").read_text(encoding="utf-8"))

def font(size, bold=False):
    for name in ("msyhbd.ttc" if bold else "msyh.ttc", "msyh.ttc", "NotoSansCJKsc-Regular.otf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()

def card(title, lines, path, accent=(23, 111, 100)):
    img = Image.new("RGB", (1920, 1080), (15, 23, 42))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([60, 60, 1860, 1020], radius=20, fill=(20, 32, 52))
    d.rectangle([60, 60, 80, 1020], fill=accent)
    d.text((110, 90), title, fill=(255, 255, 255), font=font(40, True))
    y = 170
    for line in lines:
        d.text((110, y), line[:90], fill=(200, 220, 215), font=font(28))
        y += 42
        if y > 960:
            break
    img.save(path)
    print("wrote", path)

j = report["judge"]
card("经验自演进 · 真实流水线报告", [
    f"Judge: {j['class']}  mode={j.get('mode')}  version={j['version']}",
    f"source: {j['source']}",
    f"task_key: {report['task_key']}",
    f"traces: {', '.join(report['traces_used'])}",
    f"config.calibration_version: {report['config']['calibration_version']}",
    f"calibrated={report['config']['calibrated']}  (demo / not-production)",
    "",
    "—— 分数表 ——",
    *[f"{r['trace_id'][:8]}…  S={r['S']}  Q={r['Q']}  {r['decision']}  N={r['N']}  ({r['reason']})" for r in report['records']],
    "",
    f"TopK selected: {report['selection']['selected']}",
    f"denominator={report['selection']['denominator']} requested={report['selection']['requested_count']}",
], out / "evolve-real-scores.png", (180, 120, 40))

cand = report.get("candidate") or {}
adm = report.get("admission") or {}
poi = report.get("poisonAdmission") or {}
card("候选 Skill · 联合准入结果", [
    f"candidate: {cand.get('name')}  id={str(cand.get('id'))[:8]}…",
    f"generator: {cand.get('generator')}  test_only={cand.get('test_only')}",
    f"common_steps: {cand.get('common_steps')}",
    f"SKILL.md: {cand.get('path')}",
    "",
    f"良性候选准入: status={adm.get('status')} decision={adm.get('decision')}",
    f"毒候选准入: status={poi.get('status')} (期望 rejected)",
    "",
    "诚实边界：",
    *[f"· {h}" for h in report.get("honesty", [])],
    "",
    f"generateError: {report.get('generateError')}",
], out / "evolve-real-candidates.png", (23, 111, 100))

# compare-like card from selection decisions
lines = ["同 task_key 选择决策：", ""]
for d in report["selection"]["decisions"]:
    mark = "✓" if d["selected"] else "·"
    lines.append(f"{mark} {d['trace_id'][:13]}…  selected={d['selected']}  {d['reason']}")
card("TopK / 隔离对比", lines, out / "evolve-real-compare.png", (90, 60, 140))
print("done")
