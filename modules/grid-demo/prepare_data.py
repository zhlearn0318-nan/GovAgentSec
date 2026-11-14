"""Extract a small anonymized September sample; never overwrite source workbooks.

Only this preparation script needs openpyxl. The runtime analysis uses the stdlib.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import datetime
from pathlib import Path


BASE = Path(__file__).resolve().parent
SOURCE_NAME = "c_twc_mk_bi_custer_pq_day_det.xlsx"
# Verified Excel row numbers select four distinct meters, without persisting IDs.
SELECTION = [(3660, "M001"), (2040, "M002"), (4291, "M003"), (2039, "M004")]


def prepare(source_root: Path, output: Path) -> dict:
    import openpyxl

    source = source_root / "export" / SOURCE_NAME
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
    ws = wb["data"]
    values = iter(ws.values)
    headers = next(values)
    original = [(i, dict(zip(headers, row))) for i, row in enumerate(values, 2)]
    wb.close()
    by_row = dict(original)
    selected = {str(by_row[row]["计量点编号"]): (meter, row) for row, meter in SELECTION}
    assert len(selected) == 4, "Selection no longer identifies four distinct meters"
    curves, changes = [], []
    for row_number, row in original:
        if str(row["计量点编号"]) not in selected:
            continue
        date = datetime.strptime(str(row["统计日期"]), "%Y/%m/%d").date().isoformat()
        if not date.startswith("2024-09-"):
            continue
        meter = selected[str(row["计量点编号"])][0]
        value = float(row["日电量"])
        point = dict(meter_id=meter, date=date, kwh=value, status="observed",
                     source_file=SOURCE_NAME, source_sheet="data", source_row=row_number,
                     source_field="日电量", source_type="source_sample")
        if meter == "M001" and "2024-09-12" <= date <= "2024-09-14":
            changes.append(dict(meter_id=meter, date=date, source_row=row_number,
                                original_value=value, demo_value=None,
                                reason="演示采集缺失；原表该日存在数值，未改动原文件"))
            point.update(kwh="", status="missing", source_type="synthetic_gap_overlay")
        curves.append(point)
    curves.sort(key=lambda r: (r["meter_id"], r["date"]))
    assert len(curves) == 120 and len({(r['meter_id'], r['date']) for r in curves}) == 120
    output.mkdir(parents=True, exist_ok=True)
    with (output / "curves.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(curves[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(curves)
    records = {
        "title": "A园区匿名企业档案与生产检修记录",
        "source_type": "source_industry_with_synthetic_business_context",
        "notice": "A园区及企业代号为演示设定；行业来自原表。检修及采集事件为合成补充，不是实际企业工单。",
        "meters": [
            {"meter_id": meter, "label": f"A园区计量点 {meter}",
             "industry": str(by_row[row]["行业分类名称"]).strip(),
             "source_row": row, "source_file": SOURCE_NAME,
             "maintenance": ([{"record_id": "DEMO-MAINT-001", "start": "2024-09-17",
                               "end": "2024-09-17", "reason": "生产线计划停机检修（合成演示工单）",
                               "source_type": "synthetic_maintenance_record"}] if meter == "M002" else []),
             "notes": "不保留企业实名、地址、原始计量点编号或联系方式；无检修记录不代表未检修。"}
            for row, meter in SELECTION],
        "collection_events": [{"record_id": "DEMO-COLLECT-001", "meter_id": "M001",
                               "start": "2024-09-12", "end": "2024-09-14",
                               "event": "采集通道中断，三个日采样点未返回（合成演示事件）",
                               "source_type": "synthetic_collection_event"}],
    }
    manifest = {
        "title": "A园区用电异常分析演示样本",
        "period": {"start": "2024-09-01", "end": "2024-09-30"},
        "unit": "原表电量单位",
        "unit_note": "原表“日电量”字段和提供的数据字典未明确单位；未擅自换算或标注为 kWh。kwh 为程序兼容字段名。",
        "sampling": "日", "meter_count": 4, "point_count": len(curves),
        "source": {"file": SOURCE_NAME, "sheet": "data", "row_count": len(original),
                   "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                   "fields": ["计量点编号（仅在内存匹配后替换）", "统计日期", "日电量", "行业分类名称"]},
        "selection": [{"meter_id": meter, "anchor_source_row": row,
                       "source_rows": [r["source_row"] for r in curves if r["meter_id"] == meter]}
                      for row, meter in SELECTION],
        "changes": changes,
        "privacy": "仅保留匿名计量点、日期、电量及行业。原始标识、企业名称、地址、坐标、联系方式与账单未复制。来源行号仅用于本地核查。",
        "notes": ["A园区是演示组织名称，四个计量点不声称来自同一真实园区。",
                  "117 个电量值保持源表数值；3 个值在演示副本设为缺失，原值保存在改动清单。",
                  "检修工单与采集事件是合成业务背景；真实下降的原因未由原数据证明。",
                  "M003 原始下降保留为待核查，不直接解释为经营恶化。"],
    }
    for name, content in [("records.json", records), ("manifest.json", manifest)]:
        (output / name).write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=BASE.parents[2] / "最终展示材料" / "演示数据")
    parser.add_argument("--output-dir", type=Path, default=BASE / "data")
    args = parser.parse_args()
    result = prepare(args.source_dir, args.output_dir)
    print(json.dumps({"status": "ok", "meters": result["meter_count"], "points": result["point_count"]}))
