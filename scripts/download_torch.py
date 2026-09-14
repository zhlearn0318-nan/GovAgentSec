"""Verified ranged download from PyTorch's official primary host."""
import hashlib
from http.client import IncompleteRead
from html.parser import HTMLParser
from pathlib import Path
import time
import urllib.request
from urllib.parse import unquote, urlsplit, urlunsplit
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
NAME = 'torch-2.6.0+cu124-cp312-cp312-win_amd64.whl'

def open_retry(request):
    for attempt in range(6):
        try:
            return urllib.request.urlopen(request, timeout=45)
        except OSError:
            if attempt == 5:
                raise
            time.sleep(2)

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.links.extend(value for key, value in attrs if key == 'href')

def main():
    with open_retry('https://download.pytorch.org/whl/cu124/torch/') as response:
        parser = Links()
        parser.feed(response.read().decode())
    match = next(link for link in parser.links if NAME in unquote(link))
    split = urlsplit(match)
    expected = split.fragment.removeprefix('sha256=')
    if len(expected) != 64:
        raise ValueError('Missing official wheel SHA-256')
    url = urlunsplit(('https', 'download.pytorch.org', split.path, '', ''))
    folder = ROOT / '.runtime' / 'wheels'
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / NAME
    if target.exists():
        with target.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() == expected:
                print(target, flush=True)
                return
    print('Reading official wheel length and checksum', flush=True)
    with open_retry(urllib.request.Request(url, headers={'Range': 'bytes=0-1023'})) as response:
        if response.status != 206:
            raise RuntimeError('Official server does not support ranged downloads')
        total = int(response.headers['Content-Range'].split('/')[-1])
        response.read()
    chunk_size = 8 * 1024 * 1024
    pieces = folder / 'torch-parts'
    pieces.mkdir(exist_ok=True)
    def download(index):
        start = index * chunk_size
        end = min(total - 1, start + chunk_size - 1)
        piece = pieces / f'{index:05d}.part'
        if piece.exists() and piece.stat().st_size == end - start + 1:
            return piece
        for attempt in range(6):
            try:
                request = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}'})
                with urllib.request.urlopen(request, timeout=60) as response:
                    if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{total}':
                        raise ValueError('Incorrect server range')
                    data = response.read()
                if len(data) != end - start + 1:
                    raise ValueError('Incomplete chunk')
                piece.write_bytes(data)
                if index % 16 == 0:
                    print(f'Wheel chunk {index + 1}/{(total + chunk_size - 1) // chunk_size}', flush=True)
                return piece
            except (OSError, ValueError, IncompleteRead):
                if attempt == 5:
                    raise
                time.sleep(2)
    with ThreadPoolExecutor(max_workers=4) as pool:
        downloaded = list(pool.map(download, range((total + chunk_size - 1) // chunk_size)))
    partial = target.with_suffix('.partial')
    with partial.open('wb') as out:
        for piece in downloaded:
            out.write(piece.read_bytes())
    with partial.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != expected:
        raise ValueError('Official wheel hash mismatch')
    partial.replace(target)
    print(f'Verified official CUDA wheel: {target}', flush=True)

if __name__ == '__main__':
    main()
