import json
import time

# 安全等级数字，数字越大越机密
level_order = {
    "公开": 0,
    "普通": 1,
    "敏感": 2,
    "绝密": 3
}

# 加载两张配置表
with open("file_level_map.json", "r", encoding="utf-8") as f:
    file_level = json.load(f)

with open("skill_permission.json", "r", encoding="utf-8") as f:
    skill_auth = json.load(f)


def check_access(skill_name: str, target_file: str):
    """校验skill能不能读这个文件"""
    # 获取skill最大允许等级
    skill_max = skill_auth[skill_name]
    # 获取文件的保密等级
    file_sec = file_level[target_file]

    allow = False
    msg = ""
    if level_order[file_sec] > level_order[skill_max]:
        allow = False
        msg = f"【拦截】越权访问，{skill_name} 不能访问 {file_sec}等级文件"
    else:
        allow = True
        msg = f"【放行】访问通过，文件等级:{file_sec}"

    # 写日志
    log_line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} | Skill:{skill_name} | 文件:{target_file} | 文件等级:{file_sec} | 是否允许:{allow}\n"
    with open("access_runtime.log", "a", encoding="utf-8") as log_f:
        log_f.write(log_line)

    return allow, msg


# --------测试用例，直接运行就自动测4组场景--------
if __name__ == "__main__":
    print("=====开始运行时访问校验测试=====\n")
    test_cases = [
        ("普通业务Skill", "./data/public.txt"),
        ("普通业务Skill", "./data/user_privacy.txt"),
        ("授权隐私Skill", "./data/user_privacy.txt"),
        ("授权隐私Skill", "./data/secret_key.txt")
    ]

    for skill, filepath in test_cases:
        ok, info = check_access(skill, filepath)
        print(info)
