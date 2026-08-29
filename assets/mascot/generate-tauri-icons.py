#!/usr/bin/env python3
"""Rasterize app-icon-1024.png into the icon set Tauri bundles.

Run after generate-icon.mjs. Requires Pillow.
"""
import struct
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "app-icon-1024.png"
OUT = HERE / "../../spikes/tauri-overlay/src-tauri/icons"

# macOS icns type -> pixel size. PNG payloads, accepted by 10.7+.
ICNS_TYPES = [
    (b"icp4", 16), (b"icp5", 32), (b"ic11", 32), (b"ic12", 64),
    (b"ic07", 128), (b"ic13", 256), (b"ic08", 256), (b"ic14", 512),
    (b"ic09", 512), (b"ic10", 1024),
]

WINDOWS_SQUARES = [30, 44, 71, 89, 107, 142, 150, 284, 310]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")

    def scaled(size):
        return src.resize((size, size), Image.LANCZOS)

    for name, size in [("32x32.png", 32), ("128x128.png", 128),
                       ("128x128@2x.png", 256), ("icon.png", 1024),
                       ("StoreLogo.png", 50)]:
        scaled(size).save(OUT / name)

    for size in WINDOWS_SQUARES:
        scaled(size).save(OUT / f"Square{size}x{size}Logo.png")

    scaled(256).save(OUT / "icon.ico", sizes=[(s, s) for s in (16, 32, 48, 64, 128, 256)])

    blocks = b""
    for type_tag, size in ICNS_TYPES:
        png = (OUT / f".icns-{size}.png")
        scaled(size).save(png)
        data = png.read_bytes()
        png.unlink()
        blocks += type_tag + struct.pack(">I", len(data) + 8) + data
    (OUT / "icon.icns").write_bytes(b"icns" + struct.pack(">I", len(blocks) + 8) + blocks)

    print(f"wrote tauri icon set to {OUT.resolve()}")


if __name__ == "__main__":
    main()
