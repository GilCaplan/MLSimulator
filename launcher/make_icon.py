"""Render the ML Playground app icon (glass squircle + neural-net motif) and build an .icns."""
import math, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 1024

def squircle_mask(size, n=5.0, pad=0.0):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    r = size / 2 - pad
    pts = []
    for i in range(720):
        t = 2 * math.pi * i / 720
        c, s = math.cos(t), math.sin(t)
        x = abs(c) ** (2 / n) * r * (1 if c >= 0 else -1)
        y = abs(s) ** (2 / n) * r * (1 if s >= 0 else -1)
        pts.append((size / 2 + x, size / 2 + y))
    d.polygon(pts, fill=255)
    return m

def gradient(size, top, bottom):
    g = Image.new("RGB", (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            t = (y * 0.75 + x * 0.25) / size
            px[x, y] = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
    return g

def render():
    pad = 100
    body = gradient(S, (94, 92, 230), (10, 132, 255)).convert("RGBA")
    # soft colour blobs for depth
    blobs = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blobs)
    bd.ellipse((520, 80, 1000, 560), fill=(191, 90, 242, 170))
    bd.ellipse((40, 560, 560, 1060), fill=(48, 209, 88, 120))
    blobs = blobs.filter(ImageFilter.GaussianBlur(110))
    body = Image.alpha_composite(body, blobs)

    # neural-net motif
    net = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    nd = ImageDraw.Draw(net)
    layers = [3, 4, 4, 2]
    xs = [280, 440, 600, 760]
    nodes = []
    for li, n in enumerate(layers):
        span = 120 * (n - 1)
        nodes.append([(xs[li], 512 - span / 2 + 120 * k) for k in range(n)])
    for a, b in zip(nodes, nodes[1:]):
        for p in a:
            for q in b:
                nd.line([p, q], fill=(255, 255, 255, 95), width=7)
    for li, layer in enumerate(nodes):
        for (x, y) in layer:
            r = 34
            nd.ellipse((x - r - 8, y - r - 8, x + r + 8, y + r + 8), fill=(255, 255, 255, 60))
            nd.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 245))
    glow = net.filter(ImageFilter.GaussianBlur(14))
    body = Image.alpha_composite(body, glow)
    body = Image.alpha_composite(body, net)

    # glass highlight on the upper half
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse((-200, -760, S + 200, 470), fill=(255, 255, 255, 70))
    hl = hl.filter(ImageFilter.GaussianBlur(70))
    body = Image.alpha_composite(body, hl)

    mask = squircle_mask(S, pad=pad)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # drop shadow
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.putalpha(mask.filter(ImageFilter.GaussianBlur(24)).point(lambda v: v * 0.45))
    out = Image.alpha_composite(out, sh.transform((S, S), Image.AFFINE, (1, 0, 0, 0, 1, -14)))
    body.putalpha(mask)
    out = Image.alpha_composite(out, body)
    # thin bright rim
    rim = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    edge = mask.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.5))
    rim.putalpha(edge.point(lambda v: min(255, v * 2) * 0.55))
    out = Image.alpha_composite(out, rim)
    return out

def main(dest_dir):
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    img = render()
    img.save(dest / "icon.png")
    with tempfile.TemporaryDirectory() as td:
        iconset = Path(td) / "AppIcon.iconset"
        iconset.mkdir()
        for base in (16, 32, 128, 256, 512):
            img.resize((base, base), Image.LANCZOS).save(iconset / f"icon_{base}x{base}.png")
            img.resize((base * 2, base * 2), Image.LANCZOS).save(iconset / f"icon_{base}x{base}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(dest / "AppIcon.icns")], check=True)
    print("icon written to", dest)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent)
