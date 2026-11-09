"""Package committed source only; never walk the developer's runtime directories."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def build(out):
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise RuntimeError('Commit reviewed release files before packaging')
    manifest = json.loads((ROOT / 'release-manifest.json').read_text(encoding='utf-8'))
    out = out.resolve()
    if not out.is_relative_to(ROOT / 'local-validation'):
        raise ValueError('Release artifacts must stay under local-validation')
    out.mkdir(parents=True, exist_ok=True)
    archive = out / manifest['archive']
    subprocess.run(['git', 'archive', '--format=zip', '--prefix=GovAgentSec/', '-o', str(archive), 'HEAD'], cwd=ROOT, check=True)
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            parts = pathlib.PurePosixPath(name).parts
            if any(p in {'.git','.runtime','local-validation','node_modules','.venv','models','live-runtime','__pycache__'} for p in parts) or name.endswith(('.env','.token','.sqlite','.db','.log')):
                raise RuntimeError('Runtime or private file in release: ' + name)
    subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'scripts/build_windows_installer.ps1'),'-OutputDirectory',str(out)],cwd=ROOT,check=True)
    installer = out / 'GovAgentSec-v1.0-Setup.exe'
    checksums = '\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name for p in [archive,installer])+'\n'
    (out/'SHA256SUMS.txt').write_text(checksums,encoding='ascii')
    report = dict(version=manifest['version'],tag=manifest['tag'],commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),source='git-archive-committed-source',archive=archive.name,bytes=archive.stat().st_size)
    (out/'package-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('output',type=pathlib.Path)
    build(parser.parse_args().output)
