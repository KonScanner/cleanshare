#!/usr/bin/env python3
"""Generate CleanShare's PNG icons with only the Python standard library."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SS = 4  # supersampling factor per axis


def ring_distance(
    x: float, y: float, cx: float, cy: float, width: float, height: float, radius: float
) -> float:
    qx = abs(x - cx) - (width / 2 - radius)
    qy = abs(y - cy) - (height / 2 - radius)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius


def rounded_square_contains(x: float, y: float, size: float, radius: float) -> bool:
    return ring_distance(x, y, size / 2, size / 2, size, size, radius) <= 0


def sample(x: float, y: float, size: float) -> tuple[int, int, int, int]:
    # Rounded-square background with a top-left to bottom-right gradient.
    if not rounded_square_contains(x, y, size, size * 0.21875):
        return (0, 0, 0, 0)

    t = (x + y) / (2 * size)
    r = round(45 + (15 - 45) * t)
    g = round(212 + (118 - 212) * t)
    b = round(191 + (110 - 191) * t)

    # A soft gloss on the top half.
    if y < size * 0.55:
        gloss = (1 - y / (size * 0.55)) * 0.10
        r = round(r + (255 - r) * gloss)
        g = round(g + (255 - g) * gloss)
        b = round(b + (255 - b) * gloss)

    # Two chain-link capsules, rotated -45 degrees around the centre.
    dx = x - size / 2
    dy = y - size / 2
    angle = math.radians(45)
    lx = dx * math.cos(angle) - dy * math.sin(angle)
    ly = dx * math.sin(angle) + dy * math.cos(angle)

    scale = size / 128
    stroke = 11 * scale
    centers = (-16.5 * scale, 16.5 * scale)
    width = 53 * scale
    height = 36 * scale
    radius = 18 * scale
    for cx in centers:
        d = ring_distance(lx, ly, cx, 0, width, height, radius)
        if abs(d) <= stroke / 2:
            return (255, 255, 255, 255)

    return (r, g, b, 255)


def make_icon(size: int) -> bytes:
    pixels = bytearray()
    count = SS * SS
    for py in range(size):
        pixels.append(0)  # PNG filter: none
        for px in range(size):
            total = [0, 0, 0]
            covered = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    red, green, blue, alpha = sample(x, y, size)
                    if alpha:
                        covered += 1
                        total[0] += red
                        total[1] += green
                        total[2] += blue
            if covered:
                pixels.extend(round(channel / covered) for channel in total)
                pixels.append(round(255 * covered / count))
            else:
                pixels.extend((0, 0, 0, 0))
    return bytes(pixels)


def chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, size: int) -> None:
    raw = make_icon(size)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(png)
    tmp.replace(path)
    print(f"wrote {path.name} ({size}x{size}, {len(png)} bytes)")


if __name__ == "__main__":
    for icon_size in (16, 32, 48, 128):
        write_png(ROOT / f"icon{icon_size}.png", icon_size)
