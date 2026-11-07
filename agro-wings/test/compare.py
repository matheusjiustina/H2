# Side-by-side visual comparison: reference video frames (left) vs game
# screenshots (right). Usage: python3 test/compare.py <video.mp4> <shotsDir> <out.png>
import subprocess, sys, os, tempfile
from PIL import Image, ImageDraw

video, shots, out = sys.argv[1], sys.argv[2], sys.argv[3]
pairs = [
    (1.0, 'aircraft & red roads', '03-takeoff.png'),
    (7.0, 'aircraft proportions', '04-spraying-chase.png'),
    (11.0, 'cockpit', '05-cockpit.png'),
    (17.5, 'spray over the field', '04b-spraying-side.png'),
    (2.5, 'base & tanks', '02b-service-close.png'),
]
tmp = tempfile.mkdtemp()
rows = []
for t, label, shot in pairs:
    f = os.path.join(tmp, f'v{t}.jpg')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', video, '-frames:v', '1', '-vf', 'crop=512:470:0:150', f], check=True)
    v = Image.open(f).resize((440, 404))
    p = os.path.join(shots, shot)
    g = Image.open(p).convert('RGB') if os.path.exists(p) else Image.new('RGB', (1280, 720), (40, 40, 40))
    g = g.resize((718, 404))
    row = Image.new('RGB', (440 + 718 + 10, 404 + 26), (18, 20, 18))
    row.paste(v, (0, 26))
    row.paste(g, (450, 26))
    d = ImageDraw.Draw(row)
    d.text((6, 6), f'reference video t={t}s', fill=(220, 220, 200))
    d.text((456, 6), f'AGRO WINGS — {label}', fill=(240, 190, 60))
    rows.append(row)
W = rows[0].width
H = sum(r.height for r in rows)
sheet = Image.new('RGB', (W, H), (10, 10, 10))
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height
sheet.save(out, quality=90)
print(out, sheet.size)
