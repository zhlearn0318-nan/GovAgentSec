"""Download the UI font from Fontshare; do not redistribute its binary in Git."""
from pathlib import Path
from download_models import fetch

ROOT = Path(__file__).resolve().parents[1]
URL = ('https://cdn.fontshare.com/wf/XMXWOHABYLQDJ42L65EFRYNVRY37HQCB/'
       'B2O4O6V3JMFM2WDCYQI3A47L5U4THDUL/WN5274VQ3AUBDFP74GB4EC4XYJ3EKVNE.woff2')
SHA256 = '52208453fddad17efb2ec2d98729e18556d6c5b64ad22171f8e8b071802314d3'

if __name__ == '__main__':
    print('Cabinet Grotesk: official Fontshare download; ITF FFL applies.')
    print('License: https://www.fontshare.com/licenses/itf-ffl')
    fetch(URL, ROOT / 'modules/govagentsec-ui/vendor/CabinetGrotesk-Bold.woff2', SHA256)
    print('UI font verified.')
