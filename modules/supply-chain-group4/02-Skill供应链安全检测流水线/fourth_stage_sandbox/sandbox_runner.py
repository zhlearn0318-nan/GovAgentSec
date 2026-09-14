import os
import re
import json
from datetime import datetime

class BehaviorSandbox:
    def __init__(self, rules_path):
        self.rules = self._load_rules(rules_path)
        self.behavior_log = []
        
    def _load_rules(self, path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    
    def scan_script(self, script_path):
        """扫描脚本中的危险行为"""
        script_name = os.path.basename(script_path)
        risks = []
        
        with open(script_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        for line_num, line in enumerate(lines, 1):
            if not line.strip():
                continue
            
            # 高危：系统命令执行
            for keyword in self.rules["high_risk"]["system_cmd"]:
                if keyword in line:
                    risks.append({
                        "level": "高危",
                        "type": "系统命令执行",
                        "line": line_num,
                        "match": keyword,
                        "content": line.strip()
                    })
            
            # 高危：文件删除
            for keyword in self.rules["high_risk"]["file_delete"]:
                if keyword in line:
                    risks.append({
                        "level": "高危",
                        "type": "文件删除操作",
                        "line": line_num,
                        "match": keyword,
                        "content": line.strip()
                    })
            
            # 高危：恶意网络请求
            for keyword in self.rules["high_risk"]["malicious_network"]:
                if keyword in line:
                    # 检查是否在白名单
                    in_whitelist = False
                    for domain in self.rules["network_whitelist"]:
                        if domain in line:
                            in_whitelist = True
                            break
                    if not in_whitelist:
                        risks.append({
                            "level": "高危",
                            "type": "违规网络请求",
                            "line": line_num,
                            "match": keyword,
                            "content": line.strip()
                        })
            
            # 中危：敏感路径写入
            for keyword in self.rules["medium_risk"]["sensitive_write"]:
                if keyword in line:
                    risks.append({
                        "level": "中危",
                        "type": "敏感路径写入",
                        "line": line_num,
                        "match": keyword,
                        "content": line.strip()
                    })
        
        # 生成审计记录
        record = {
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "script": script_name,
            "risk_count": len(risks),
            "risks": risks,
            "final_decision": "拦截禁止运行" if len([r for r in risks if r["level"]=="高危"]) > 0 else "允许运行"
        }
        self.behavior_log.append(record)
        return record
    
    def generate_report(self, output_file):
        """生成审计报告"""
        report = []
        report.append("=" * 60)
        report.append("      Skill运行时行为沙箱检测报告")
        report.append("=" * 60)
        report.append(f"检测时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("-" * 60 + "\n")
        
        for idx, record in enumerate(self.behavior_log, 1):
            report.append(f"【检测对象 {idx}】{record['script']}")
            report.append(f"  最终决策：{record['final_decision']}")
            report.append(f"  发现风险：{record['risk_count']} 项")
            
            if record["risks"]:
                for risk in record["risks"]:
                    report.append(f"    - [{risk['level']}] {risk['type']}")
                    report.append(f"      行号：第 {risk['line']} 行")
                    report.append(f"      匹配：{risk['match']}")
                    report.append(f"      代码：{risk['content'][:80]}")
            report.append("\n")
        
        report.append("=" * 60)
        
        with open(output_file, "w", encoding="utf-8") as f:
            f.write("\n".join(report))
        
        # 同时输出json日志
        json_file = output_file.replace(".txt", ".json")
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(self.behavior_log, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 检测完成，报告已生成：")
        print(f"   文本报告：{output_file}")
        print(f"   JSON日志：{json_file}")

if __name__ == "__main__":
    sandbox = BehaviorSandbox("behavior_rules.json")
    
    # 依次检测两个测试脚本
    sandbox.scan_script("./test_scripts/normal_script.py")
    sandbox.scan_script("./test_scripts/malicious_script.py")
    
    sandbox.generate_report("沙箱行为检测报告.txt")
