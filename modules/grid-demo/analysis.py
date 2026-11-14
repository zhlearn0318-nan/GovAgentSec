"""Local, deterministic electricity analysis and inspectable HTML/SVG delivery.

No network, model service, or third-party runtime package is needed. Authorization
belongs to the calling workflow, which must grant both input files before running.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import math
import statistics
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


BASE = Path(__file__).resolve().parent
LABELS = {"collection_issue": "采集质量待核查", "maintenance": "与演示检修记录吻合",
          "unresolved": "负荷下降待核查", "normal": "未触发下降规则"}
COLORS = {"collection_issue": "#bc832a", "maintenance": "#16827c",
          "unresolved": "#bd5250", "normal": "#64849c"}


def read_inputs(data_dir: Path) -> tuple[list, dict, dict]:
    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    records = json.loads((data_dir / "records.json").read_text(encoding="utf-8"))
    with (data_dir / "curves.csv").open(encoding="utf-8-sig", newline="") as f:
        curves = list(csv.DictReader(f))
    seen = set()
    for row in curves:
        key = (row["meter_id"], row["date"])
        if key in seen:
            raise ValueError(f"重复计量点日期: {key}")
        seen.add(key)
        date.fromisoformat(row["date"])
        row["kwh"] = None if row["kwh"] in (None, "") else float(row["kwh"])
        if row["kwh"] is not None and (not math.isfinite(row["kwh"]) or row["kwh"] < 0):
            raise ValueError(f"非法电量: {key}")
        row["source_row"] = int(row["source_row"]) if row.get("source_row") else None
    return curves, records, manifest


def analyze(data_dir: Path | str = BASE / "data") -> dict:
    data_dir = Path(data_dir)
    curves, records, manifest = read_inputs(data_dir)
    start, end = [date.fromisoformat(manifest["period"][k]) for k in ("start", "end")]
    if end < start or (end - start).days > 366:
        raise ValueError("分析日期范围无效")
    expected = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    if any(r["date"] not in expected for r in curves):
        raise ValueError("曲线日期不在登记分析期间内")
    metadata = {r["meter_id"]: r for r in records["meters"]}
    if len(metadata) != len(records["meters"]) or any(r["meter_id"] not in metadata for r in curves):
        raise ValueError("计量点档案缺失或重复")
    meters = []
    for meter_id, meta in sorted(metadata.items()):
        points = {r["date"]: r for r in curves if r["meter_id"] == meter_id}
        series = [points.get(d, {"meter_id": meter_id, "date": d, "kwh": None,
                               "status": "absent", "source_row": None,
                               "source_type": "absent_from_input"}) for d in expected]
        valid = [r["kwh"] for r in series if r["kwh"] is not None and r["status"] == "observed"]
        baseline = statistics.median(valid) if valid else None
        missing = [r["date"] for r in series if r["kwh"] is None or r["status"] != "observed"]
        drops = [r for r in series if baseline and r["kwh"] is not None
                 and r["status"] == "observed" and r["kwh"] < baseline * .5]
        maintenance = meta.get("maintenance", [])
        covered = [r["date"] for r in drops if any(m["start"] <= r["date"] <= m["end"] for m in maintenance)]
        unexplained = [r["date"] for r in drops if r["date"] not in covered]
        classification = ("collection_issue" if missing else "unresolved" if unexplained
                          else "maintenance" if covered else "normal")
        evidence = [{"source": "curves.csv", "detail": f"应有 {len(expected)} 个日采样点；有效 {len(valid)} 个；缺失或无效 {len(missing)} 个。",
                     "source_rows": [r["source_row"] for r in series if r.get("source_row")]},
                    {"source": "analysis.py", "detail": f"以本月有效日电量中位数 {baseline:,.2f} 为基线，低于基线 50% 的点进入下降核查。" if baseline is not None else "无有效观测，无法建立基线。"}]
        if missing:
            evidence.append({"source": "curves.csv", "detail": "缺失日期：" + "、".join(missing) + "。缺失不按零电量计算。"})
            for event in records.get("collection_events", []):
                if event["meter_id"] == meter_id and any(event["start"] <= d <= event["end"] for d in missing):
                    evidence.append({"source": "records.json", "record_id": event["record_id"],
                                     "source_type": event["source_type"], "detail": event["event"]})
        for point in drops:
            evidence.append({"source": point["source_file"], "source_row": point["source_row"],
                             "detail": f"{point['date']} 电量 {point['kwh']:,.2f}，较月中位数低 {(1-point['kwh']/baseline)*100:.1f}%。"})
        for record in maintenance:
            if any(record["start"] <= d <= record["end"] for d in covered):
                evidence.append({"source": "records.json", "record_id": record["record_id"],
                                 "source_type": record["source_type"],
                                 "detail": f"{record['start']} 至 {record['end']}：{record['reason']}。仅支持演示情境的关联判断。"})
        recommendation = {
            "collection_issue": "先核对采集通道并补采，恢复数据完整性后重新分析；不能把缺失直接当成停产。",
            "maintenance": "下降日期与合成检修记录吻合。真实业务应核验工单及恢复后的负荷，不能据此证明原企业发生了检修。",
            "unresolved": "核查节假日、生产安排、计量及现场记录；当前证据不足以归因或判断经营状况。",
            "normal": "本次规则未触发下降异常，保留日常监测；这不等于全部用电行为均无异常。",
        }[classification]
        meters.append({"meter_id": meter_id, "label": meta["label"], "industry": meta["industry"],
                       "classification": classification, "classification_label": LABELS[classification],
                       "baseline_kwh": round(baseline, 4) if baseline is not None else None,
                       "observed_total": round(sum(valid), 4), "missing_dates": missing,
                       "drop_dates": [r["date"] for r in drops], "maintenance_dates": covered,
                       "unexplained_dates": unexplained, "evidence": evidence,
                       "recommendation": recommendation, "series": series})
    counts = dict(Counter(m["classification"] for m in meters))
    return {"title": "A园区用电异常诊断报告", "period": manifest["period"],
            "unit": manifest["unit"], "unit_note": manifest["unit_note"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "summary": {"meter_count": len(meters), "point_count": len(curves),
                        "missing_count": sum(len(m["missing_dates"]) for m in meters),
                        "drop_point_count": sum(len(m["drop_dates"]) for m in meters),
                        "classifications": counts}, "meters": meters,
            "method": "逐计量点检查日采样完整性，以当月有效日电量中位数为基线，低于基线50%标记为下降；优先核查缺失，再关联检修日期，未覆盖下降保持待核查。",
            "source_notes": manifest["notes"],
            "input_hashes": {n: hashlib.sha256((data_dir / n).read_bytes()).hexdigest()
                             for n in ("curves.csv", "records.json", "manifest.json")}}


def render_chart(report: dict) -> str:
    """Four separate scales avoid hiding the lower-magnitude comparison meter."""
    esc = html.escape
    height = 112 + 235 * len(report["meters"])
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-label="各计量点日电量与异常位置">',
             '<rect width="100%" height="100%" fill="#ffffff"/>',
             '<style>text{font-family:"Microsoft YaHei",Arial,sans-serif;fill:#263f4c;font-size:13px}.title{font-size:23px;font-weight:700}.label{font-size:16px;font-weight:600}.muted{fill:#657983;font-size:12px}</style>',
             '<text class="title" x="30" y="37">日用电曲线与异常证据</text>',
             '<text class="muted" x="30" y="63">2024年9月 · 分图采用独立纵轴 · 虚线为月中位数的50% · 缺失点断开，不补零</text>']
    for index, meter in enumerate(report["meters"]):
        top = 90 + index * 235
        left, right, bottom = 110, 1060, top + 165
        points = meter["series"]
        maximum = max([p["kwh"] for p in points if p["kwh"] is not None] + [1]) * 1.12
        x = lambda i: left + i * (right - left) / max(1, len(points) - 1)
        y = lambda value: bottom - value / maximum * 120
        color = COLORS[meter["classification"]]
        parts.append(f'<text class="label" x="30" y="{top+16}">{esc(meter["meter_id"])} · {esc(meter["classification_label"])}</text>')
        parts.append(f'<text class="muted" x="30" y="{top+36}">电量（原表口径）</text>')
        for tick in range(4):
            value = maximum * tick / 3
            yy = y(value)
            parts.extend([f'<path d="M{left},{yy:.1f} H{right}" stroke="#e3eaed"/>',
                          f'<text x="98" y="{yy+4:.1f}" text-anchor="end" class="muted">{value:,.0f}</text>'])
        if meter["baseline_kwh"]:
            yy = y(meter["baseline_kwh"] * .5)
            parts.append(f'<path d="M{left},{yy:.1f} H{right}" stroke="#bd832a" stroke-dasharray="5,5"/>')
        segment = []
        for i, point in enumerate(points):
            if point["kwh"] is None or point["status"] != "observed":
                if segment:
                    parts.append(f'<polyline points="{" ".join(segment)}" fill="none" stroke="{color}" stroke-width="2.5"/>')
                    segment = []
                parts.append(f'<rect x="{x(i)-9:.1f}" y="{top+45}" width="18" height="120" fill="#f6e4bd"/>')
            else:
                xx, yy = x(i), y(point["kwh"])
                segment.append(f"{xx:.1f},{yy:.1f}")
                if point["date"] in meter["drop_dates"]:
                    parts.append(f'<circle cx="{xx:.1f}" cy="{yy:.1f}" r="4.5" fill="#bd5250"><title>{esc(point["date"])}: {point["kwh"]}</title></circle>')
            if i in (0, 4, 9, 14, 19, 24, len(points)-1):
                parts.append(f'<text x="{x(i):.1f}" y="{bottom+24}" text-anchor="middle" class="muted">{esc(point["date"][5:])}</text>')
        if segment:
            parts.append(f'<polyline points="{" ".join(segment)}" fill="none" stroke="{color}" stroke-width="2.5"/>')
    parts.append('</svg>')
    return "".join(parts)


def render_report(report: dict) -> str:
    esc = html.escape
    rows, sections = [], []
    for meter in report["meters"]:
        baseline = f'{meter["baseline_kwh"]:,.2f}' if meter["baseline_kwh"] is not None else "无有效数据"
        rows.append(f'<tr><td>{esc(meter["meter_id"])}</td><td>{esc(meter["industry"])}</td><td>{baseline}</td><td>{len(meter["missing_dates"])}</td><td>{len(meter["drop_dates"])}</td><td>{esc(meter["classification_label"])}</td></tr>')
        evidence = "".join(f'<li>{esc(e["detail"])} <small>来源：{esc(e["source"])}{("，Excel第"+str(e["source_row"])+"行") if e.get("source_row") else ""}{("，"+esc(e["record_id"])) if e.get("record_id") else ""}</small></li>' for e in meter["evidence"])
        sections.append(f'<section><h2>{esc(meter["meter_id"])} · {esc(meter["classification_label"])}</h2><ul>{evidence}</ul><p class="advice">核查建议：{esc(meter["recommendation"])}</p></section>')
    bars = "".join(f'<div class="bar"><span>{esc(LABELS[k])}</span><b style="width:{v*80}px;background:{COLORS[k]}"></b><strong>{v} 个计量点</strong></div>' for k, v in report["summary"]["classifications"].items())
    notes = "".join(f'<li>{esc(n)}</li>' for n in report["source_notes"])
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(report['title'])}</title>
<style>body{{font:16px/1.75 "Microsoft YaHei",Arial,sans-serif;color:#263f4c;background:#eef3f5;margin:0}}main{{max-width:1120px;padding:40px;margin:auto;background:white}}h1{{font-size:32px;line-height:1.3;margin:0 0 12px}}h2{{font-size:21px;margin:0 0 14px}}.sub,small{{color:#607782}}.sub{{margin-bottom:28px}}section{{padding:26px 0;border-top:1px solid #d8e4e8}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:12px;text-align:left;border-bottom:1px solid #d8e4e8}}th{{background:#edf3f5}}.advice{{background:#eaf5f2;padding:14px 18px}}li{{margin:8px 0}}small{{display:block}}.bar{{display:flex;align-items:center;gap:16px;margin:12px 0}}.bar span{{width:210px}}.bar b{{height:16px}}.bar strong{{font-weight:400}}svg{{width:100%;height:auto}}.source{{background:#f4f7f8;padding:20px}}@media print{{body{{background:white}}main{{padding:12px}}section{{break-inside:avoid}}}}@media(max-width:700px){{main{{padding:20px}}table{{display:block;overflow:auto}}}}</style>
<main><h1>{esc(report['title'])}</h1><p class="sub">{report['period']['start']} 至 {report['period']['end']} · {report['summary']['meter_count']} 个匿名计量点 · {report['summary']['point_count']} 条日记录</p>
<section><h2>异常分类</h2>{bars}<p>{esc(report['method'])}</p><table><thead><tr><th>计量点</th><th>行业</th><th>月中位数</th><th>缺失天数</th><th>下降天数</th><th>判断</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section>
<section>{render_chart(report)}</section>{''.join(sections)}
<section class="source"><h2>数据来源与演示设定</h2><ul>{notes}</ul><p>{esc(report['unit_note'])}</p><p>基础数值：用户提供的日电量表 data 工作表。每个曲线点保留源表行号；运行时重新计算，无预填结论。</p></section></main></html>'''


def deliver(data_dir: Path | str, output_dir: Path | str) -> dict:
    report = analyze(data_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "report.html").write_text(render_report(report), encoding="utf-8")
    (output_dir / "chart.svg").write_text(render_chart(report), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=BASE / "data")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = deliver(args.data_dir, args.output_dir)
    print(json.dumps({"status": "ok", "report_file": str(args.output_dir / "report.json"),
                      "summary": result["summary"]}, ensure_ascii=False))
