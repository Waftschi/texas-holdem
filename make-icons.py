"""Zeichnet das App-Icon: goldenes Pik auf grünem Filz. Aufruf: python3 make-icons.py pwa"""
import sys
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1] if len(sys.argv) > 1 else "pwa"
S = 2048  # groß zeichnen, dann verkleinern für glatte Kanten

bg = Image.new("RGB", (S, S), "#0a3326")
glow = Image.new("RGB", (S, S), "#0a3326")
ImageDraw.Draw(glow).ellipse((S * 0.12, S * 0.1, S * 0.88, S * 0.86), fill="#13613f")
bg = Image.blend(bg, glow.filter(ImageFilter.GaussianBlur(S * 0.16)), 1.0)

d = ImageDraw.Draw(bg)
cx, cy = S / 2, S / 2 - S * 0.015
gold = "#d3a64a"
r = 0.135 * S
d.polygon([(cx, cy - 0.3 * S), (cx + 0.255 * S, cy + 0.02 * S), (cx, cy + 0.14 * S), (cx - 0.255 * S, cy + 0.02 * S)], fill=gold)
for dx in (-0.12 * S, 0.12 * S):
    d.ellipse((cx + dx - r, cy + 0.04 * S - r, cx + dx + r, cy + 0.04 * S + r), fill=gold)
d.polygon([(cx - 0.03 * S, cy + 0.08 * S), (cx + 0.03 * S, cy + 0.08 * S), (cx + 0.11 * S, cy + 0.3 * S), (cx - 0.11 * S, cy + 0.3 * S)], fill=gold)

for name, size in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)):
    bg.resize((size, size), Image.LANCZOS).save(f"{out}/{name}", optimize=True)
    print(name, size)
