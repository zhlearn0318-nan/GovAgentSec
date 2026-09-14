# 正常文本处理脚本
def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def main():
    content = read_file("./data/public.txt")
    print("读取文件内容：", content[:20])
    print("正常处理完成")

if __name__ == "__main__":
    main()
