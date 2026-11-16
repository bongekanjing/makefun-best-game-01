#!/usr/bin/env python3
"""Capture Tideglass's real screenshots with a headless Chromium.

Serves game/ with serve.ts, screenshots each scene from shots.json at 1280x480,
crops the letterbox bars (the 1280x720 field is scaled to fit a 1280x480 window),
and writes JPEGs into screenshots/ (each <= 256 KiB, <= 1280x480).

The bundled /opt/meta-chromium build refuses to start outside the Hatch browser
service ("Hatch WebGL domain policy is required for browser startup"), so this
uses the upstream headless shell Playwright downloads into ~/.cache/ms-playwright
(`npx playwright install chromium-headless-shell`). No network request is made by
the game itself; the browser only talks to the local server.

Run: python3 tests/capture_shots.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CHROME = next(
    (Path.home() / ".cache" / "ms-playwright").glob(
        "chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"
    ),
    None,
)
PORT = 8080


def main() -> int:
    if CHROME is None or not CHROME.exists():
        print("headless Chromium shell not found; run: npx playwright install chromium-headless-shell")
        return 1
    shots = json.loads((ROOT / "shots.json").read_text())
    server = subprocess.Popen(
        ["node", "serve.ts", "--port", str(PORT)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(1)
        dims = {}
        for shot in shots:
            png = Path(f"/tmp/tideglass-{shot['name']}.png")
            subprocess.run(
                [
                    str(CHROME), "--no-sandbox", "--disable-gpu",
                    "--window-size=1280,480", "--virtual-time-budget=8000",
                    f"--screenshot={png}",
                    f"http://localhost:{PORT}/{shot['query']}",
                ],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            image = Image.open(png).convert("RGB")
            # The field is 1280x720 scaled to fit 1280x480: scale 2/3, so the field
            # occupies x 213..1067 and the sides are the backdrop colour. Crop them.
            cropped = image.crop((213, 0, 1067, 480))
            out = ROOT / "screenshots" / shot["name"]
            cropped.save(out, "JPEG", quality=85, optimize=True)
            dims[shot["name"]] = {"width": cropped.width, "height": cropped.height, "bytes": out.stat().st_size}
            print(f"{shot['name']}: {cropped.width}x{cropped.height}, {out.stat().st_size} bytes")
        (ROOT / "tests" / "shot-dimensions.json").write_text(json.dumps(dims, indent=2) + "\n")
        return 0
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
