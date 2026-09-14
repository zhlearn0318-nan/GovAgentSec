"""Fetch the official OPA Windows release and verify its release checksum."""
import hashlib
from pathlib import Path
import urllib.request
from download_models import fetch

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.19.0'
URL = f'https://github.com/open-policy-agent/opa/releases/download/v{VERSION}/opa_windows_amd64.exe'

def main():
    target = ROOT / 'modules' / 'agentguard-group2' / 'tools' / 'opa.exe'
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(URL + '.sha256', timeout=60) as response:
        checksum = response.read().decode().split()[0]
    if len(checksum) != 64:
        raise ValueError('Invalid upstream OPA checksum')
    if target.exists():
        with target.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() == checksum:
                return
    fetch(URL, target, checksum)
    print(f'OPA {VERSION} verified: {checksum}')

if __name__ == '__main__':
    main()
