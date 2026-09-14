import uuid
import time
import json
from datetime import datetime
import os
import sys
import re
import json
from datetime import datetime

# ========== 路径配置 ==========
根目录 = os.path.dirname(os.path.abspath(__file__))
规则文件 = os.path.join(根目录, "rules.json")
文件分级表 = os.path.join(根目录, "third_stage_runtime", "file_level_map.json")
行为规则库 = os.path.join(根目录, "fourth_stage_sandbox", "behavior_rules.json")

等级排序 = {"公开": 0, "普通": 1, "敏感": 2, "绝密": 3}

# Direct English imperative overrides were absent from the original Chinese
# keyword list. Anchoring to an instruction avoids matching quoted examples
# inside ordinary defensive explanations. This is a bounded rule, not a model.
英文提示投毒规则 = re.compile(
    r"^\s*(?:[-*]\s+)?(?:"
    r"(?:ignore|disregard|override)\b[^\n]{0,180}\b(?:instructions?|user(?:'s)?\s+task|system\s+prompt|safety\s+guidance)"
    r"|(?:read|extract|collect)\b[^\n]{0,120}\b(?:credentials|api\s*keys?|secrets)\b[^\n]{0,140}\b(?:include|send|encode|base64|reveal)"
    r")", re.IGNORECASE,
)

# ========== 风险类型中文映射与危害说明 ==========
静态风险映射 = {
    "prompt_poisoning": {"中文名": "提示投毒", "危害": "试图绕过系统安全规则，诱导执行违规指令"},
    "malicious_link": {"中文名": "恶意外链", "危害": "包含非可信域名，可能指向恶意下载或数据外传地址"},
    "over_permission": {"中文名": "过度权限声明", "危害": "声明超出功能所需的权限，存在权限滥用风险"},
    "suspicious_meta": {"中文名": "可疑元数据", "危害": "作者、来源、版本信息不明确，供应链来源不可信"}
}

沙箱风险映射 = {
    "system_cmd": {"中文名": "系统命令执行", "危害": "可执行任意系统指令，存在主机被控制风险"},
    "file_delete": {"中文名": "文件删除操作", "危害": "可删除文件或目录，存在数据破坏风险"},
    "malicious_network": {"中文名": "违规网络请求", "危害": "向非可信服务器发起请求，存在数据外传风险"},
    "sensitive_write": {"中文名": "敏感路径写入", "危害": "向系统目录写入文件，存在植入后门风险"}
}
# ========== 合规条款映射表 ==========
合规映射表 = {
    "提示投毒": {
        "对应条款": "等保2.0 恶意代码防范；政务数据安全 内容安全管理",
        "合规说明": "禁止输入包含绕过安全规则的诱导性指令",
        "整改建议": "强化输入内容校验，拦截提示注入类攻击"
    },
    "恶意外链": {
        "对应条款": "等保2.0 访问控制；政务数据安全 数据传输安全",
        "合规说明": "禁止内置非可信域名与恶意下载地址",
        "整改建议": "建立域名白名单，拦截外连恶意站点"
    },
    "过度权限声明": {
        "对应条款": "等保2.0 访问控制；政务数据安全 数据分级授权",
        "合规说明": "技能权限应遵循最小必要原则",
        "整改建议": "收窄技能权限范围，按需求分级授权"
    },
    "可疑元数据": {
        "对应条款": "政务数据安全 供应链安全管理",
        "合规说明": "第三方技能应来源明确、可追溯",
        "整改建议": "建立技能准入审核机制，核验来源与版本"
    },
    "系统命令执行": {
        "对应条款": "等保2.0 入侵防范；政务数据安全 运行安全管理",
        "合规说明": "禁止未授权执行系统级命令",
        "整改建议": "禁用高危系统调用接口，执行命令白名单"
    },
    "文件删除操作": {
        "对应条款": "等保2.0 数据完整性；政务数据安全 数据安全保护",
        "合规说明": "禁止未授权删除、破坏数据文件",
        "整改建议": "开启文件操作审计，配置数据备份机制"
    },
    "违规网络请求": {
        "对应条款": "等保2.0 通信安全；政务数据安全 数据外传管控",
        "合规说明": "禁止向非可信服务器外传数据",
        "整改建议": "网络出口统一管控，建立外发地址白名单"
    },
    "敏感路径写入": {
        "对应条款": "等保2.0 主机安全；政务数据安全 系统安全管理",
        "合规说明": "禁止向系统敏感目录写入文件",
        "整改建议": "收紧目录写入权限，监控敏感路径文件操作"
    }
}

# ========== 加载规则 ==========
def 加载规则(文件路径):
    with open(文件路径, "r", encoding="utf-8") as f:
        return json.load(f)

# ========== 第一关：静态文档扫描 ==========
def 第一关静态扫描(skill文件夹):
    说明书路径 = os.path.join(skill文件夹, "SKILL.md")
    if not os.path.exists(说明书路径):
        return {"状态": "跳过", "风险数": 0, "高危数": 0, "风险列表": [], "备注": "未找到SKILL.md文档"}
    
    规则 = 加载规则(规则文件)
    风险列表 = []
    
    with open(说明书路径, "r", encoding="utf-8") as f:
        所有行 = f.readlines()
    
    for 行号, 行内容 in enumerate(所有行, 1):
        行内容 = 行内容.strip()
        if not 行内容:
            continue

        英文命中 = 英文提示投毒规则.search(行内容)
        if 英文命中:
            风险列表.append({
                "等级": "高危", "类型": "提示投毒",
                "危害": "指令直接要求覆盖用户任务或提取并泄露凭据",
                "行号": 行号, "匹配": 英文命中.group(0), "内容": 行内容,
            })
        
        # 高危规则
        if "high_risk" in 规则:
            for 分类, 关键词列表 in 规则["high_risk"].items():
                for 关键词 in 关键词列表:
                    if 关键词 in 行内容:
                        映射信息 = 静态风险映射.get(分类, {"中文名": 分类, "危害": "未知风险"})
                        风险列表.append({
                            "等级": "高危",
                            "类型": 映射信息["中文名"],
                            "危害": 映射信息["危害"],
                            "行号": 行号,
                            "匹配": 关键词,
                            "内容": 行内容
                        })
        
        # 中危规则
        if "medium_risk" in 规则:
            for 分类, 关键词列表 in 规则["medium_risk"].items():
                for 关键词 in 关键词列表:
                    if 关键词 in 行内容:
                        映射信息 = 静态风险映射.get(分类, {"中文名": 分类, "危害": "未知风险"})
                        风险列表.append({
                            "等级": "中危",
                            "类型": 映射信息["中文名"],
                            "危害": 映射信息["危害"],
                            "行号": 行号,
                            "匹配": 关键词,
                            "内容": 行内容
                        })
        
        # 低危规则
        if "low_risk" in 规则:
            for 分类, 关键词列表 in 规则["low_risk"].items():
                for 关键词 in 关键词列表:
                    if 关键词 in 行内容:
                        映射信息 = 静态风险映射.get(分类, {"中文名": 分类, "危害": "未知风险"})
                        风险列表.append({
                            "等级": "低危",
                            "类型": 映射信息["中文名"],
                            "危害": 映射信息["危害"],
                            "行号": 行号,
                            "匹配": 关键词,
                            "内容": 行内容
                        })
    
    高危数 = len([r for r in 风险列表 if r["等级"] == "高危"])
    return {
        "状态": "完成",
        "风险数": len(风险列表),
        "高危数": 高危数,
        "风险列表": 风险列表,
        "备注": f"发现{len(风险列表)}项风险，其中高危{高危数}项"
    }

# ========== 第二关：数据访问权限评估 ==========
def 第二关权限校验(skill文件夹路径):
    权限配置文件路径 = os.path.join(skill文件夹路径, 'skill_config.json')
    if not os.path.exists(权限配置文件路径):
        return {'状态': '跳过', '风险数': 0, '风险列表': [], '备注': '未找到权限配置文件'}
    
    # 加载权限配置、规则文件和文件分级表
    权限配置 = 加载规则(权限配置文件路径)
    规则文件路径 = os.path.join(os.path.dirname(__file__), 'rules.json')
    分级表路径 = os.path.join(os.path.dirname(__file__), 'third_stage_runtime', 'file_level_map.json')
    规则文件 = 加载规则(规则文件路径)
    文件分级表 = 加载规则(分级表路径)

    # 权限等级映射（兼容中英文）
    level_map = {
        "公开": 0, "public": 0,
        "普通": 1, "internal": 1,
        "敏感": 2, "sensitive": 2,
        "绝密": 3, "secret": 3
    }

    access_level_raw = 权限配置.get("access_level", "").strip()
    skill_name = 权限配置.get("skill_name", "未知")

    # 等级识别：未知等级直接判最高风险，禁止静默降级
    if access_level_raw in level_map:
        skill等级 = access_level_raw
        风险级别 = level_map[access_level_raw]
    else:
        skill等级 = access_level_raw if access_level_raw else "未配置"
        风险级别 = 3  # 未知等级默认最高风险

    # 统计可访问/不可访问文件数（文件等级转数字后再比较）
    可访问的 = 0
    不能访问的 = 0
    for 文件名, 文件等级_str in 文件分级表.items():
        文件等级 = level_map.get(文件等级_str, 99)
        if 文件等级 <= 风险级别:
            可访问的 += 1
        else:
            不能访问的 += 1

    # 风险说明
    if 风险级别 == 0:
        权限风险说明 = "仅可访问公开/普通数据，权限范围可控"
    elif 风险级别 == 1:
        权限风险说明 = "可访问内部敏感数据，存在数据泄露潜在风险"
    elif 风险级别 == 2:
        权限风险说明 = "可访问核心敏感数据，存在数据泄露高风险"
    else:
        权限风险说明 = "权限等级未识别/未配置，默认最高风险，禁止放行"

    # 返回字段与总报告完全对齐，避免KeyError
    return {
        '状态': '完成',
        'skill名称': skill_name,
        '授权等级': skill等级,
        '权限风险等级': 风险级别,
        '可访问文件数': 可访问的,
        '拦截文件数': 不能访问的,
        '风险说明': 权限风险说明,
        '备注': f"按等级映射：{skill等级}，可访问{可访问的}个文件，拦截{不能访问的}个高等级文件"
    }
# ========== 第三关：代码行为沙箱检测 ==========
def 第三关行为检测(skill文件夹):
    # 查找Python脚本
    主脚本 = None
    for 文件名 in os.listdir(skill文件夹):
        if 文件名.endswith(".py") and 文件名 != "__init__.py":
            主脚本 = os.path.join(skill文件夹, 文件名)
            break
    
    if not 主脚本:
        return {"状态": "跳过", "风险数": 0, "高危数": 0, "风险列表": [], "备注": "未找到Python脚本文件"}
    
    规则 = 加载规则(行为规则库)
    风险列表 = []
    
    with open(主脚本, "r", encoding="utf-8") as f:
        所有行 = f.readlines()
    
    for 行号, 行内容 in enumerate(所有行, 1):
        行内容 = 行内容.strip()
        if not 行内容:
            continue
        
        # 高危规则
        if "high_risk" in 规则:
            for 分类, 关键词列表 in 规则["high_risk"].items():
                for 关键词 in 关键词列表:
                    if 关键词 in 行内容:
                        # 网络白名单判断
                        if 分类 == "malicious_network" and "network_whitelist" in 规则:
                            在白名单 = any(域名 in 行内容 for 域名 in 规则["network_whitelist"])
                            if 在白名单:
                                continue
                        映射信息 = 沙箱风险映射.get(分类, {"中文名": 分类, "危害": "未知风险"})
                        风险列表.append({
                            "等级": "高危",
                            "类型": 映射信息["中文名"],
                            "危害": 映射信息["危害"],
                            "行号": 行号,
                            "匹配": 关键词,
                            "内容": 行内容
                        })
        
        # 中危规则
        if "medium_risk" in 规则:
            for 分类, 关键词列表 in 规则["medium_risk"].items():
                for 关键词 in 关键词列表:
                    if 关键词 in 行内容:
                        映射信息 = 沙箱风险映射.get(分类, {"中文名": 分类, "危害": "未知风险"})
                        风险列表.append({
                            "等级": "中危",
                            "类型": 映射信息["中文名"],
                            "危害": 映射信息["危害"],
                            "行号": 行号,
                            "匹配": 关键词,
                            "内容": 行内容
                        })
    
    高危数 = len([r for r in 风险列表 if r["等级"] == "高危"])
    最终决策 = "拦截禁止运行" if 高危数 > 0 else "允许运行"
    
    return {
        "状态": "完成",
        "脚本名": os.path.basename(主脚本),
        "风险数": len(风险列表),
        "高危数": 高危数,
        "最终决策": 最终决策,
        "风险列表": 风险列表,
        "备注": f"发现{len(风险列表)}项风险，高危{高危数}项，{最终决策}"
    }
# ========== 合规风险评估函数 ==========
def 合规评估(第一关结果, 第三关结果):
    # 合并两个阶段的所有风险
    所有风险 = 第一关结果.get("风险列表", []) + 第三关结果.get("风险列表", [])
    不合规项 = []
    
    # 逐个匹配合规条款
    for 风险 in 所有风险:
        类型 = 风险["类型"]
        if 类型 in 合规映射表:
            映射 = 合规映射表[类型]
            不合规项.append({
                "风险类型": 类型,
                "对应条款": 映射["对应条款"],
                "整改建议": 映射["整改建议"],
                "风险位置": f"第{风险['行号']}行"
            })
    
    # 判断合规等级
    if len(不合规项) == 0:
        合规等级 = "基本合规"
        合规结论 = "未检测到合规风险项，符合核心安全合规要求"
    elif len(不合规项) <= 2:
        合规等级 = "一般不合规"
        合规结论 = "存在少量合规风险项，需限期整改"
    else:
        合规等级 = "严重不合规"
        合规结论 = "存在多项高危合规风险，需立即整改"
    
    return {
        "合规等级": 合规等级,
        "合规结论": 合规结论,
        "不合规项数": len(不合规项),
        "不合规详情": 不合规项
    }

# ========== 生成综合报告 ==========
def 生成总报告(skill路径,第一关结果,第二关结果,第三关结果,报告路径, AUDIT_TRACE_ID, EVAL_START_TIME):
    有高危 = 第一关结果.get("高危数", 0) > 0 or 第三关结果.get("高危数", 0) > 0
    有中危 = len([r for r in 第一关结果.get("风险列表", []) if r["等级"] == "中危"]) > 0 or \
              len([r for r in 第三关结果.get("风险列表", []) if r["等级"] == "中危"]) > 0
    
    if 有高危:
        最终等级 = "高危"
        建议 = "拦截禁止运行，建议深度排查恶意行为"
    elif 有中危:
        最终等级 = "警告"
        建议 = "允许有限运行，建议人工复核风险点"
    else:
        最终等级 = "安全"
        建议 = "允许正常运行"
    
    报告 = []
    报告.append(f"审计追踪ID: {AUDIT_TRACE_ID}")
    报告.append(f"评测开始时间: {EVAL_START_TIME}")
    报告.append(f"评测结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    报告.append("风险维度: 供应链安全")
    报告.append("-" * 60)
    报告.append("=" * 60)
    报告.append("      Skill供应链安全综合检测报告")
    报告.append("=" * 60)
    报告.append(f"检测时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    报告.append(f"检测对象：{os.path.basename(skill路径)}")
    报告.append(f"最终安全等级：{最终等级}")
    报告.append(f"执行建议：{建议}")
    报告.append("-" * 60 + "\n")
    
    # 第一关
    报告.append("【阶段一】静态文档描述扫描")
    报告.append(f"  检测状态：{第一关结果['状态']}")
    报告.append(f"  结果摘要：{第一关结果['备注']}")
    if 第一关结果.get("风险列表"):
        报告.append("  风险详情：")
        for r in 第一关结果["风险列表"]:
            报告.append(f"    - [{r['等级']}] {r['类型']}（第{r['行号']}行）")
            报告.append(f"      匹配特征：{r['匹配']}")
            报告.append(f"      危害说明：{r['危害']}")
            报告.append(f"      原文内容：{r['内容']}")
    报告.append("\n")
    
    # 第二关
    报告.append("【阶段二】数据访问权限评估")
    报告.append(f"  检测状态：{第二关结果['状态']}")
    if 第二关结果["状态"] == "完成":
        报告.append(f"  Skill名称：{第二关结果['skill名称']}")
        报告.append(f"  授权等级：{第二关结果['授权等级']}")
        报告.append(f"  权限风险：{第二关结果['权限风险等级']}")
        报告.append(f"  风险说明：{第二关结果['风险说明']}")
        报告.append(f"  结果摘要：{第二关结果['备注']}")
    报告.append("\n")
    
    # 第三关
    报告.append("【阶段三】代码行为沙箱检测")
    报告.append(f"  检测状态：{第三关结果['状态']}")
    报告.append(f"  结果摘要：{第三关结果['备注']}")
    if 第三关结果.get("风险列表"):
        报告.append("  风险详情：")
        for r in 第三关结果["风险列表"]:
            报告.append(f"    - [{r['等级']}] {r['类型']}（第{r['行号']}行）")
            报告.append(f"      匹配特征：{r['匹配']}")
            报告.append(f"      危害说明：{r['危害']}")
            报告.append(f"      代码原文：{r['内容']}")
    报告.append("\n")
    
        # ===== 合规风险评估章节 =====
    合规结果 = 合规评估(第一关结果, 第三关结果)
    报告.append("【合规风险评估】")
    报告.append(f"  合规等级：{合规结果['合规等级']}")
    报告.append(f"  合规结论：{合规结果['合规结论']}")
    报告.append(f"  不合规项数：{合规结果['不合规项数']}")
    if 合规结果["不合规详情"]:
        报告.append("  不合规详情：")
        for 项 in 合规结果["不合规详情"]:
            报告.append(f"    - [{项['风险类型']}] {项['风险位置']}")
            报告.append(f"      对应条款：{项['对应条款']}")
            报告.append(f"      整改建议：{项['整改建议']}")
    报告.append("\n")

    报告.append("=" * 60)
    报告.append("检测结论：三层纵深防护检测完成")
    报告.append("  静态文档筛查 → 数据权限管控 → 代码行为沙箱")
    报告.append("=" * 60)
    
    with open(报告路径, "w", encoding="utf-8") as f:
        f.write("\n".join(报告))
    
    return 最终等级, 建议

# ========== 主入口 ==========
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法：python skill_security_pipeline.py <Skill目录路径>")
        print("示例：python skill_security_pipeline.py ./sample_skill")
        sys.exit(1)
    
    skill文件夹 = sys.argv[1]
    if not os.path.isdir(skill文件夹):
        print("错误：指定的Skill目录不存在")
        sys.exit(1)
    AUDIT_TRACE_ID = f"eval-skill-{uuid.uuid4().hex[:12]}"
    EVAL_START_TIME = datetime.now().strftime("%Y-%m-%d %H:%M:%S")  
    print(f"[Trace: {AUDIT_TRACE_ID}] ==== Skill安全检测流水线启动 ====\n")
    
    print("[1/3] 执行静态文档扫描...")
    第一关 = 第一关静态扫描(skill文件夹)
    print(f"      {第一关['备注']}\n")
    
    print("[2/3] 执行数据访问权限评估...")
    第二关 = 第二关权限校验(skill文件夹)
    print(f"      {第二关['备注']}\n")
    
    print("[3/3] 执行代码行为沙箱检测...")
    第三关 = 第三关行为检测(skill文件夹)
    print(f"      {第三关['备注']}\n")
    
    报告文件 = os.path.join(skill文件夹, "综合安全检测报告.txt")
    等级, 建议 = 生成总报告(skill文件夹,第一关,第二关,第三关,报告文件, AUDIT_TRACE_ID, EVAL_START_TIME)

    
    print("===== 全部检测完成 =====")
    print(f"最终安全等级：{等级}")
    print(f"执行建议：{建议}")
    print(f"详细报告：{报告文件}")
