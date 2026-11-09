"""받은 그림을 정리해서 게임에 등록한다.

아트 에셋 요청서의 파일 이름 그대로 art/incoming/ 에 그림을 넣고 실행한다.

    python tools/art_import.py           정리하고 art/manifest.json 에 등록
    python tools/art_import.py --check   무엇을 할지만 보여 준다

- 배경이 투명하지 않으면 #FF00FF 단색이나, 가장자리에서 이어진 단색 배경을 지운다.
- 전신(sd_)은 768x768 칸에서 머리 꼭대기와 발끝 높이를 맞춘다. 캔버스 크기가 그림마다 달라도 포즈끼리 키가 같아진다.
- 치는 동작을 나눈 그림(split, turn, power, hit, follow)은 한 동작 안에서 차례로 바뀌므로 그림마다 키를 맞추지 않는다
  (쪼그린 자세가 커지면 안 된다). 같은 캐릭터·방향의 묶음을 한 비율로 줄이고(묶음 키의 중앙값이 준비 자세 키와 같게),
  발끝 높이와 머리 가운데만 맞춘다. 라켓이 잘리지 않게 1152x768 칸에 둔다.
- 결과는 WebP로 art/sd, art/chr, art/fairy, art/bg, art/intro 에 저장하고, 원본은 art/incoming/done/ 으로 옮긴다.
- 그림마다 art/SOURCES.md 에 날짜와 도구를 남긴다.

필요한 것: Python 3, Pillow (pip install pillow)
"""
import datetime
import json
import re
import shutil
import sys
from collections import Counter, deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art'
INCOMING = ART / 'incoming'
DONE = INCOMING / 'done'
MANIFEST = ART / 'manifest.json'
SOURCES = ART / 'SOURCES.md'

SD = 768        # 전신 칸 크기 (정사각)
FOOT = 0.97     # 발끝 높이, 칸 위에서부터의 비율 (경기 스프라이트 기준점과 맞춤)
HEAD = 0.30     # 머리 꼭대기 높이. 머리부터 발끝까지가 칸의 67%가 된다
CHR = 512       # 대화용 얼굴
FAIRY = 384     # 요정
BG_W = 1024     # 배경과 인트로 컷의 최대 너비
MOTION_W = 1152  # 부분 동작 칸 너비(높이는 SD). 게임은 가운데 아래를 발밑으로 본다
MOTION = re.compile(r'^(split|turn(fh|bh)|power(fh|bh)(slice)?(neutral|semi|open|run|cross)|(hit|follow)(fh|bh)(slice)?)$')

RULES = [
    (re.compile(r'^sd_([a-z0-9]+)_([a-z]+)_(front|back)$'), 'sd'),
    (re.compile(r'^chr_([a-z0-9]+)_([a-z]+)$'), 'chr'),
    (re.compile(r'^fairy_([a-z]+)$'), 'fairy'),
    (re.compile(r'^bg_([a-z]+)$'), 'bg'),
    (re.compile(r'^intro_(\d\d)$'), 'intro'),
]


def classify(stem):
    for rx, kind in RULES:
        m = rx.match(stem)
        if m:
            return kind, m.groups()
    return None, None


def border_pixels(px, w, h, step=1):
    return ([px[x, 0] for x in range(0, w, step)] + [px[x, h - 1] for x in range(0, w, step)]
            + [px[0, y] for y in range(0, h, step)] + [px[w - 1, y] for y in range(0, h, step)])


def already_transparent(im):
    if im.mode != 'RGBA':
        return False
    w, h = im.size
    a = border_pixels(im.getchannel('A').load(), w, h, 8)
    return sum(1 for v in a if v < 32) > len(a) * 0.6


def remove_bg(im):
    """투명 배경으로 만든다. 지웠으면 True도 같이 돌려준다."""
    im = im.convert('RGBA')
    if already_transparent(im):
        return im, True
    px = im.load()
    w, h = im.size
    key = Counter((p[0] // 8, p[1] // 8, p[2] // 8) for p in border_pixels(px, w, h, 2)).most_common(1)[0][0]
    kr, kg, kb = (c * 8 + 4 for c in key)

    def dist(p):
        return abs(p[0] - kr) + abs(p[1] - kg) + abs(p[2] - kb)

    if kr > 200 and kb > 200 and kg < 80:
        # #FF00FF 배경: 색으로 지운다. 경계는 부드럽게, 분홍 번짐은 줄인다.
        for y in range(h):
            for x in range(w):
                r, g, b, _ = px[x, y]
                d = dist((r, g, b))
                if d < 90:
                    px[x, y] = (0, 0, 0, 0)
                elif d < 170:
                    t = (d - 90) / 80
                    px[x, y] = (min(r, g + int((r - g) * t)), g, min(b, g + int((b - g) * t)), int(255 * t))
        return im, True

    # 가장자리에서 이어진 비슷한 색만 지운다. 윤곽선 안쪽은 지키므로 흰 옷이 남는다.
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    removed = 0
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if dist(px[x, y]) > 60:
            continue
        px[x, y] = (0, 0, 0, 0)
        removed += 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    return im, removed > w * h * 0.15


def fit(im, size, anchor='center'):
    """투명 여백을 잘라 size 정사각 칸 가운데에 맞춘다."""
    box = im.getchannel('A').getbbox()
    if not box:
        return None
    cut = im.crop(box)
    k = min(size * 0.92 / cut.width, size * 0.92 / cut.height)
    cut = cut.resize((max(1, round(cut.width * k)), max(1, round(cut.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(cut, ((size - cut.width) // 2, (size - cut.height) // 2))
    return out


def head_of(im):
    """머리 꼭대기 높이와 머리의 가로 가운데를 찾는다.
    SD 캐릭터는 머리(머리카락)가 몸에서 가장 넓은 덩어리라, 가장 넓은 줄 폭의 45% 이상인 첫 줄을 머리 꼭대기로 본다.
    위로 든 팔, 라켓, 삐친 머리카락은 폭이 좁아서 건너뛴다."""
    a = im.getchannel('A').load()
    w, h = im.size
    widths = [sum(1 for x in range(0, w, 2) if a[x, y] > 128) for y in range(h)]
    top = next(y for y, c in enumerate(widths) if c >= max(widths) * 0.45)
    band = range(top, min(h, top + max(4, h // 12)))
    xs = [x for y in band for x in range(0, w, 2) if a[x, y] > 128]
    return top, sum(xs) / len(xs)


def place_sd(im):
    """머리 꼭대기에서 발끝까지의 키가 모든 포즈에서 같도록 줄이고, 발끝을 FOOT 높이, 머리를 가운데에 둔다."""
    box = im.getchannel('A').getbbox()
    if not box:
        return None
    top, cx = head_of(im)
    s = SD * (FOOT - HEAD) / max(1, box[3] - top)
    cut = im.crop(box)
    nw, nh = cut.width * s, cut.height * s
    if nh > SD * FOOT or nw > SD:   # 라켓을 높이 든 포즈가 칸을 넘으면 그 포즈만 조금 줄인다
        k = min(SD * FOOT / nh, SD / nw)
        nw, nh, s = nw * k, nh * k, s * k
    cut = cut.resize((max(1, round(nw)), max(1, round(nh))), Image.LANCZOS)
    x = round(SD / 2 - (cx - box[0]) * s)
    x = min(max(x, 0), SD - cut.width)
    out = Image.new('RGBA', (SD, SD), (0, 0, 0, 0))
    out.alpha_composite(cut, (x, round(SD * FOOT) - cut.height))
    return out


def motion_height(im):
    box = im.getchannel('A').getbbox()
    top, _ = head_of(im)
    return box[3] - top


def place_motion(im, s):
    """부분 동작: 묶음 비율 s로 줄여 발끝을 FOOT 높이, 머리를 가운데에 둔다. 칸을 넘으면 넘친 픽셀 수를 같이 돌려준다."""
    box = im.getchannel('A').getbbox()
    if not box:
        return None, 0
    _, cx = head_of(im)
    cut = im.crop(box)
    cut = cut.resize((max(1, round(cut.width * s)), max(1, round(cut.height * s))), Image.LANCZOS)
    x, y = round(MOTION_W / 2 - (cx - box[0]) * s), round(SD * FOOT) - cut.height
    over = max(0, -x, x + cut.width - MOTION_W, -y)
    out = Image.new('RGBA', (MOTION_W, SD), (0, 0, 0, 0))
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(cut.width, MOTION_W - x), min(cut.height, SD - y)
    out.alpha_composite(cut, (x + sx, y + sy), (sx, sy, ex, ey))
    return out, over


def scene(im):
    im = im.convert('RGB')
    if im.width > BG_W:
        im = im.resize((BG_W, round(im.height * BG_W / im.width)), Image.LANCZOS)
    return im


def main():
    check = '--check' in sys.argv
    files = sorted(p for p in INCOMING.glob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'))
    if not files:
        print(f'{INCOMING.relative_to(ROOT)} 에 그림이 없습니다.')
        return
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    for k in ('chr', 'sd', 'bg', 'fairy'):
        manifest.setdefault(k, {})
    manifest.setdefault('intro', [])
    done, warn, sources = [], [], []
    # 부분 동작 묶음(캐릭터, 방향)마다 비율 하나: 묶음 키의 중앙값이 준비 자세 키(SD*(FOOT-HEAD))가 되게
    groups = {}
    for f in files:
        kind, g = classify(f.stem)
        if kind == 'sd' and MOTION.match(g[1]):
            groups.setdefault((g[0], g[2]), []).append(f)
    motion_s = {}
    for key, fs in groups.items():
        hs = sorted(motion_height(remove_bg(Image.open(f))[0]) for f in fs)
        motion_s[key] = SD * (FOOT - HEAD) / hs[len(hs) // 2]
        print(f'부분 동작 {key[0]} {key[1]}: {len(fs)}장, 비율 {motion_s[key]:.3f}')
    for f in files:
        kind, g = classify(f.stem)
        if not kind:
            warn.append(f'{f.name}: 이름이 요청서 규칙과 달라 건너뜀')
            continue
        if kind == 'sd':
            char, pose, facing = g
            out_path = ART / 'sd' / char / f'{pose}_{facing}.webp'
        elif kind == 'chr':
            char, expr = g
            out_path = ART / 'chr' / char / f'{expr}.webp'
        elif kind == 'fairy':
            out_path = ART / 'fairy' / f'{g[0]}.webp'
        elif kind == 'bg':
            out_path = ART / 'bg' / f'{g[0]}.webp'
        else:
            out_path = ART / 'intro' / f'{g[0]}.webp'
        rel = out_path.relative_to(ROOT).as_posix()
        if check:
            done.append(f'{f.name} -> {rel}')
            continue

        src = Image.open(f)
        if kind in ('sd', 'chr', 'fairy'):
            im, ok = remove_bg(src)
            if not ok:
                warn.append(f'{f.name}: 배경을 다 지우지 못했을 수 있음. 투명 배경이나 #FF00FF 배경으로 다시 받기를 권함')
            if kind == 'sd' and MOTION.match(pose):
                out, over = place_motion(im, motion_s[(char, facing)])
                if over:
                    warn.append(f'{f.name}: 칸을 {over}px 넘어 조금 잘림')
            else:
                out = place_sd(im) if kind == 'sd' else fit(im, CHR if kind == 'chr' else FAIRY)
            if out is None:
                warn.append(f'{f.name}: 그림이 비어 있어 건너뜀')
                continue
        else:
            out = scene(src)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out.save(out_path, 'WEBP', quality=88, method=6)

        if kind == 'sd':
            entry = manifest['sd'].setdefault(char, {})
            entry.pop('image', None)
            entry.pop('json', None)
            entry[f'{pose}_{facing}'] = rel
        elif kind == 'chr':
            manifest['chr'].setdefault(char, {})[expr] = rel
        elif kind == 'fairy':
            manifest['fairy'][g[0]] = rel
        elif kind == 'bg':
            manifest['bg'][g[0]] = rel
        else:
            i = int(g[0]) - 1
            while len(manifest['intro']) <= i:
                manifest['intro'].append(None)
            manifest['intro'][i] = rel
        DONE.mkdir(parents=True, exist_ok=True)
        shutil.move(str(f), str(DONE / f.name))
        sources.append(rel)
        done.append(f'{f.name} -> {rel}')

    if not check and sources:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if not SOURCES.exists():
            SOURCES.write_text('# 그림 출처\n\n그림마다 만든 도구와 날짜를 남긴다. 요청 내용은 Claude 문서 「테니스 선수 키우기 — 아트 에셋 요청서」의 같은 파일 이름 줄이다.\n\n| 날짜 | 파일 | 도구 |\n| --- | --- | --- |\n', encoding='utf-8')
        today = datetime.date.today().isoformat()
        with SOURCES.open('a', encoding='utf-8') as fp:
            for rel in sources:
                fp.write(f'| {today} | {rel} | ChatGPT 이미지 생성 |\n')
    print(('할 일' if check else '정리함') + f' {len(done)}장')
    for line in done:
        print('  ' + line)
    for line in warn:
        print('주의: ' + line)


if __name__ == '__main__':
    main()
