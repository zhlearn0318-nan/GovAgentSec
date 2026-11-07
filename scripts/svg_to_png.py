"""Convert call-graph-real.svg to PNG using cairosvg or svglib/reportlab or pillow+wand; last resort: rasterize via pure XML parse + PIL drawing of boxes from JSON."""
import json, sys
from pathlib import Path
out = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\23684\Desktop\GovAgentSec-evidence")
svg = out / "call-graph-real.svg"
png = out / "call-graph-real.png"
js = out / "call-graph-real.json"
if png.exists() and png.stat().st_size > 1000:
    print("png already exists", png, png.stat().st_size)
    sys.exit(0)
# try cairosvg
try:
    import cairosvg
    cairosvg.svg2png(url=str(svg), write_to=str(png), output_width=1920)
    print("cairosvg ok", png.stat().st_size)
    sys.exit(0)
except Exception as e:
    print("cairosvg fail", e)
# try svglib
try:
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM
    drawing = svg2rlg(str(svg))
    renderPM.drawToFile(drawing, str(png), fmt="PNG")
    print("svglib ok", png.stat().st_size)
    sys.exit(0)
except Exception as e:
    print("svglib fail", e)
# Pillow from JSON
from PIL import Image, ImageDraw, ImageFont
data = json.loads(js.read_text(encoding="utf-8"))
nodes = data["nodes"]; edges = data["edges"]; summary = data["summary"]
row_h, width = 78, 1920
lane_w = (width - 40) / 5
height = len(nodes) * row_h + 120
img = Image.new("RGB", (width, height), "#fbfdfc")
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("msyh.ttc", 18)
    font_sm = ImageFont.truetype("msyh.ttc", 13)
    font_title = ImageFont.truetype("msyh.ttc", 24)
except Exception:
    font = font_sm = font_title = ImageFont.load_default()
d.text((24, 10), "过程台账 · 真实调用关系图", fill="#176f64", font=font_title)
d.text((24, 40), f"trace_id={summary['trace_id']} · nodes={summary['node_count']} edges={summary['edge_count']} · 由真实 JSONL + traceGraph 渲染", fill="#637570", font=font_sm)
lanes = ["LLM", "Skill", "MCP / 工具", "结果", "防护 / 审批"]
for i, name in enumerate(lanes):
    x0 = 20 + i * lane_w
    d.rectangle([x0, 48, x0 + lane_w, 84], fill="#edf4f0")
    d.text((x0 + 12, 56), name, fill="#233b37", font=font)
pos = {}
for i, n in enumerate(nodes):
    pos[n["event_id"]] = (20 + n["lane"] * lane_w + lane_w / 2, 90 + i * row_h + 30)
# edges
id_to_node = {n["event_id"]: n for n in nodes}
for e in edges:
    a, b = pos.get(e["from"]), pos.get(e["to"])
    if not a or not b: continue
    color = "#398c7c" if e["kind"] == "call" else "#c3d4cd"
    width_l = 3 if e["kind"] == "call" else 1
    d.line([a, b], fill=color, width=width_l)
colors = {"blocked": "#b94736", "failed": "#b94736", "risk": "#b5802b", "pending": "#b5802b", "approved": "#26845e", "normal": "#4d8d81"}
for i, n in enumerate(nodes):
    x = 20 + n["lane"] * lane_w + 8
    y = 90 + i * row_h + 8
    w = lane_w - 16
    h = 62
    border = colors.get(n.get("state") or "normal", "#4d8d81")
    d.rounded_rectangle([x, y, x + w, y + h], radius=8, fill="#ffffff", outline=border, width=3)
    label = n["label"] + (f" · {n['state']}" if n.get("state") and n["state"] != "normal" else "")
    d.text((x + 10, y + 8), label[:40], fill="#233b37", font=font)
    sub = (n.get("tool") or n.get("model") or n.get("decision") or "")[:48]
    d.text((x + 10, y + 30), str(sub), fill="#637570", font=font_sm)
    d.text((x + 10, y + 46), f"+{n.get('offset_ms')} ms · seq {n.get('sequence')}", fill="#637570", font=font_sm)
img.save(png)
print("pillow ok", png.stat().st_size, png)
