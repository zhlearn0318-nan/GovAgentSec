"""Maintainer utility: resolve official upstream revisions before release."""
import json
from pathlib import Path
import urllib.request
import subprocess

root = Path(__file__).resolve().parents[1]

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'GovAgentSec-release'})
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)

models = []
for repo, directory in [
    ('leolee99/PIGuard', 'PIGuard'),
    ('Qwen/Qwen3Guard-Gen-0.6B', 'Qwen3Guard-Gen-0.6B'),
    ('princeton-nlp/sup-simcse-bert-base-uncased', 'princeton-nlp-sup-simcse-bert-base-uncased'),
]:
    data = get(f'https://huggingface.co/api/models/{repo}?blobs=true')
    files = []
    available = {item['rfilename'] for item in data['siblings']}
    for item in data['siblings']:
        name = item['rfilename']
        if '/' in name or name.startswith('.'):
            continue
        if name.endswith(('.json', '.safetensors', '.model', '.txt')) or name in ('README.md', 'LICENSE', 'modeling_piguard.py') or (name == 'pytorch_model.bin' and 'model.safetensors' not in available):
            record = {'name': name}
            if item.get('lfs', {}).get('sha256'):
                record['sha256'] = item['lfs']['sha256']
            files.append(record)
    models.append({'repository': repo, 'directory': directory, 'revision': data['sha'], 'license': data.get('cardData', {}).get('license'), 'files': files})
    print(repo, data['sha'], len(files), flush=True)
revision = subprocess.check_output(['git', 'ls-remote', 'https://github.com/HuichiZhou/TrustRAG.git', 'HEAD'], text=True).split()[0]
lock = {'models': models, 'trustrag': {'repository': 'https://github.com/HuichiZhou/TrustRAG', 'revision': revision, 'license': 'MIT'}}
(root / 'models.lock.json').write_text(json.dumps(lock, indent=2) + '\n', encoding='utf-8')
