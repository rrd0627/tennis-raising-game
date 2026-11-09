# 툰풍 테니스 경기장을 Blender로 만들어 art/stadium/stadium.glb 로 내보낸다.
# 실행: "C:/Program Files/Blender Foundation/Blender 4.0/blender.exe" -b --factory-startup --python tools/stadium/build_stadium.py -- art/stadium/stadium.glb [저장할.blend]
#
# 좌표는 게임(three.js)과 같은 m 단위로 적는다: x 옆, y 위, z 코트 길이(우리 쪽 +, 맞은편 -). Blender로는 (x, -z, y).
# 코트·네트·코트 바닥은 대회마다 재질이 달라 게임 코드가 그린다. 여기서는 그 바깥(벽, 관중석, 지붕, 전광판, 조명탑, 나무, 산, 구름)만 만든다.
# 재질 이름이 게임에서 어떻게 칠할지를 정한다(js/stadium.js): 보통은 툰 재질, outline은 외곽선, screen은 전광판, light는 조명, cloud는 구름.
import bpy, bmesh, math, random, json, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'art/stadium/stadium.glb'
BLEND = argv[1] if len(argv) > 1 else None
rnd = random.Random(20261109)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection


def P(x, y, z):  # 게임 좌표 → Blender 좌표
    return Vector((x, -z, y))


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


MATS = {}


def mat(name, hexc):
    if name in MATS:
        return name
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    h = hexc.lstrip('#')
    r, g, b = (lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    m.diffuse_color = (r, g, b, 1)
    MATS[name] = m
    return name


# ── 색 ────────────────────────────────────────────
C = dict(
    concrete=mat('concrete', '#eef1f7'), concrete2=mat('concrete2', '#d7deeb'),
    wall=mat('wall', '#24407e'), wallTop=mat('wall_top', '#ffffff'),
    backdrop=mat('backdrop', '#1d3872'),
    pink=mat('pink', '#ff7fa8'), sky=mat('sky_blue', '#5cbcff'), yellow=mat('yellow', '#ffd24f'),
    mint=mat('mint', '#63d6a6'), lav=mat('lavender', '#a993ff'), white=mat('white', '#ffffff'),
    roof=mat('roof', '#ffffff'), beam=mat('beam', '#e9eef8'), fascia=mat('fascia', '#ff6f9a'),
    column=mat('column', '#f4f6fb'), navy=mat('navy', '#2a3560'), gold=mat('gold', '#ffc845'),
    ballc=mat('ball', '#d8f04a'), pole=mat('pole', '#cfd6e4'), lamp=mat('light', '#fffbe8'),
    post=mat('fence_post', '#2c6a56'), ground=mat('concourse', '#efe5d3'), lawn=mat('lawn', '#86d266'),
    lawn2=mat('lawn_dark', '#74c45a'), leaf=mat('leaf', '#56bb57'), leaf2=mat('leaf_light', '#7fd06a'),
    leaf3=mat('leaf_dark', '#3fa451'), trunk=mat('trunk', '#8c5d3e'),
    hill=mat('hill', '#8ccfa4'), hill2=mat('hill_far', '#a6d7cf'), cloud=mat('cloud', '#ffffff'),
    outline=mat('outline', '#2d2b45'), screen=mat('screen', '#1b2340'),
    awn=mat('awning', '#ff8fb3'),
)
SEAT = [C['pink'], C['sky'], C['yellow'], C['mint'], C['lav']]
SEAT_SHADE = {}  # 지붕 그늘 아래 자리: 같은 색을 조금 어둡게(실제 그림자는 게임에서 한 번 더 진다)

BUCKET = {}  # 재질마다 한 덩어리로 모아 그리기 횟수를 줄인다


def bucket(name):
    if name not in BUCKET:
        BUCKET[name] = bmesh.new()
    return BUCKET[name]


def merge(dst, src, smooth=False):
    src.verts.index_update()
    vs = [dst.verts.new(v.co) for v in src.verts]
    for f in src.faces:
        try:
            nf = dst.faces.new([vs[v.index] for v in f.verts])
            nf.smooth = smooth
        except ValueError:
            pass


def shell(src, t):
    """외곽선(뒤집은 껍질): 바깥으로 t만큼 부풀리고 면을 뒤집는다"""
    s = src.copy()
    s.normal_update()
    for v in s.verts:
        v.co += v.normal * (t * min(v.calc_shell_factor(), 2.5))
    bmesh.ops.reverse_faces(s, faces=s.faces)
    return s


def put(bm, m, ol=0.0, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if ol > 0:
        sb = shell(bm, ol)
        merge(bucket(C['outline']), sb, smooth)
        sb.free()
    merge(bucket(m), bm, smooth)
    bm.free()


def rot3(rx=0.0, ry=0.0, rz=0.0):
    # 게임 좌표의 회전(rz 먼저, 그다음 rx, ry)을 Blender 회전으로
    return Matrix.Rotation(ry, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(-rz, 4, 'Y')


def box(c, s, m, ol=0.05, rx=0.0, ry=0.0, rz=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.transform(Matrix.Translation(P(*c)) @ rot3(rx, ry, rz) @ Matrix.Diagonal((s[0], s[2], s[1], 1)))
    put(bm, m, ol)


def cyl(x, y0, z, r, h, m, seg=10, ol=0.04, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bm.transform(Matrix.Translation(P(x, y0 + h / 2, z)))
    put(bm, m, ol)


def blob(c, r, m, sub=1, ol=0.0, sy=1.0, sx=1.0, sz=1.0, smooth=True):
    bm = bmesh.new()
    if sub == 'uv':  # 나무 잎: 삼각형을 아끼면서 둥글게
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=1.0)
    else:
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    bm.transform(Matrix.Translation(P(*c)) @ Matrix.Diagonal((r * sx, r * sz, r * sy, 1)))
    put(bm, m, ol, smooth)


def prism(profile, a0, a1, m, axis='x', ol=0.06):
    """2D 단면(profile)을 한 축으로 밀어 만든 덩어리. axis='x'면 단면은 (z, y), axis='z'면 (x, y)"""
    bm = bmesh.new()
    def pt(u, v, w):
        return P(w, v, u) if axis == 'x' else P(u, v, w)
    A = [bm.verts.new(pt(u, v, a0)) for u, v in profile]
    B = [bm.verts.new(pt(u, v, a1)) for u, v in profile]
    n = len(profile)
    bm.faces.new(A)
    bm.faces.new(list(reversed(B)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([A[i], A[j], B[j], B[i]])
    put(bm, m, ol)


SEATS = []  # 관중이 앉는 자리 [x, y, z, 바라보는 방향(라디안), 그늘]

# ── 바닥 ──────────────────────────────────────────
box((0, -0.06, 0), (110, 0.1, 120), C['ground'], ol=0)
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=320)
bm.transform(Matrix.Translation(P(0, -0.09, 0)))
merge(bucket(C['lawn']), bm)
bm.free()
# 잔디 줄무늬(경기장 밖 공원)
for i in range(-6, 7):
    if i % 2 == 0:
        continue
    box((i * 18, -0.08, 0), (9, 0.02, 300), C['lawn2'], ol=0)

# ── 코트 둘레 벽 ──────────────────────────────────
WX, ZF, ZN, WH, BH = 11.05, -19.5, 21.2, 1.1, 3.0
for sx in (-1, 1):
    box((sx * (WX + 0.15), WH / 2, (ZF + ZN) / 2 - 0.15), (0.3, WH, ZN - ZF + 0.6), C['wall'], ol=0.03)
    box((sx * (WX + 0.15), WH + 0.04, (ZF + ZN) / 2 - 0.15), (0.34, 0.08, ZN - ZF + 0.6), C['wallTop'], ol=0.02)
box((0, WH / 2, ZN + 0.15), (2 * WX + 0.6, WH, 0.3), C['wall'], ol=0.03)
box((0, WH + 0.04, ZN + 0.15), (2 * WX + 0.64, 0.08, 0.34), C['wallTop'], ol=0.02)
# 맞은편 배경 벽(높다. 대회 이름 현수막은 게임이 붙인다)
box((0, BH / 2, ZF - 0.15), (2 * WX + 0.6, BH, 0.3), C['backdrop'], ol=0.03)
box((0, BH + 0.04, ZF - 0.15), (2 * WX + 0.64, 0.08, 0.34), C['wallTop'], ol=0.02)

# 펜스 기둥과 윗줄(그물은 게임이 반투명으로 그린다). 공이 펜스에 맞는 자리(js/ball.js)와 같다
NETS = []
FT = 4.6
for x in [i * 3.15 - 11.0 for i in range(8)]:
    if abs(x) <= 11.0:
        cyl(x, BH, ZF - 0.12, 0.05, FT - BH, C['post'], seg=6, ol=0.02)
box((0, FT, ZF - 0.12), (2 * WX, 0.08, 0.08), C['post'], ol=0.02)
NETS.append([0, (BH + FT) / 2, ZF - 0.1, 2 * WX, FT - BH, 0])
for sx in (-1, 1):
    for i in range(13):
        z = ZF + i * (ZN - ZF) / 12
        cyl(sx * (WX + 0.12), WH, z, 0.05, 4.0 - WH, C['post'], seg=6, ol=0.02)
    box((sx * (WX + 0.12), 4.0, (ZF + ZN) / 2), (0.08, 0.08, ZN - ZF), C['post'], ol=0.02)
    NETS.append([sx * (WX + 0.1), (WH + 4.0) / 2, (ZF + ZN) / 2, ZN - ZF, 4.0 - WH, sx * math.pi / 2])
for x in [i * 3.15 - 11.0 for i in range(8)]:
    cyl(x, WH, ZN + 0.12, 0.05, 4.0 - WH, C['post'], seg=6, ol=0.02)
box((0, 4.0, ZN + 0.12), (2 * WX, 0.08, 0.08), C['post'], ol=0.02)
NETS.append([0, (WH + 4.0) / 2, ZN + 0.1, 2 * WX, 4.0 - WH, math.pi])

# ── 맞은편 큰 관중석 ──────────────────────────────
GX = 20.4                      # 좌우 끝
Z0, WALK = ZF - 0.3, 1.0       # 앞면, 앞 통로
NR, TR, RS = 16, 0.86, 0.47    # 줄 수, 한 줄 깊이, 한 단 높이
zb = Z0 - WALK - NR * TR
ytop = BH + NR * RS
prof = [(Z0, 0), (Z0, BH), (Z0 - WALK, BH)]
for i in range(NR):
    y = BH + (i + 1) * RS
    prof += [(Z0 - WALK - i * TR, y), (Z0 - WALK - (i + 1) * TR, y)]
prof += [(zb, ytop + 1.1), (zb - 0.45, ytop + 1.1), (zb - 0.45, 0)]
prism(prof, -GX, GX, C['concrete'], axis='x', ol=0.06)
# 앞 난간: 흰 판 + 분홍 줄
box((0, BH + 0.32, Z0 - 0.08), (2 * GX, 0.56, 0.16), C['white'], ol=0.03)
box((0, BH + 0.5, Z0 - 0.0), (2 * GX, 0.12, 0.04), C['pink'], ol=0)
# 계단(통로) 자리. 가운데는 전광판 아래라 통로를 두지 않는다
AISLES = [-13.6, -6.8, 6.8, 13.6]
ROOF_X = 7.7                   # 지붕은 |x| > ROOF_X 에만 있다(가운데는 전광판)
def sections(a, b, aisles, w=1.2):
    cuts = [a] + [v for x in aisles for v in (x - w / 2, x + w / 2)] + [b]
    return [(cuts[k], cuts[k + 1]) for k in range(0, len(cuts), 2)]
for i in range(NR):
    y = BH + (i + 1) * RS
    zf, zr = Z0 - WALK - i * TR, Z0 - WALK - (i + 1) * TR   # 이 줄 디딤판 앞과 뒤
    for k, (x0, x1) in enumerate(sections(-GX, GX, AISLES)):
        cm = SEAT[(k + i // 4) % len(SEAT)] if i % 4 else C['white']
        box(((x0 + x1) / 2, y + 0.2, zr + 0.36), (x1 - x0 - 0.2, 0.4, 0.42), cm, ol=0)
        box(((x0 + x1) / 2, y + 0.55, zr + 0.1), (x1 - x0 - 0.2, 0.42, 0.08), cm, ol=0)
        n = int((x1 - x0 - 0.3) / 0.62)
        for s in range(n):
            x = x0 + 0.15 + (s + 0.5) * (x1 - x0 - 0.3) / n
            shade = 1 if (abs(x) > ROOF_X and zr < -26.5) else 0
            SEATS.append([round(x, 2), round(y + 0.4, 2), round(zr + 0.34, 2), 0, shade])
    # 통로 계단 코: 노란 줄
    for x in AISLES:
        box((x, y + 0.015, zf - 0.06), (1.1, 0.03, 0.1), C['yellow'], ol=0)

# 지붕 두 날개(가운데는 전광판)
RF, RB, YF, YB = -22.6, zb - 0.6, 15.6, 14.4
for sx in (-1, 1):
    xc = sx * (ROOF_X + GX + 0.4) / 2
    w = GX + 0.4 - ROOF_X
    d = RF - RB
    tilt = math.atan2(YF - YB, d)
    box((xc, (YF + YB) / 2, (RF + RB) / 2), (w, 0.45, d / math.cos(tilt)), C['roof'], ol=0.07, rx=-tilt)
    box((xc, YF - 0.05, RF + 0.05), (w + 0.1, 0.7, 0.3), C['fascia'], ol=0.04)
    box((xc, YF + 0.36, RF + 0.05), (w + 0.12, 0.12, 0.34), C['white'], ol=0.02)
    # 뒤 기둥과 지붕 밑 들보
    for j in range(4):
        x = sx * (ROOF_X + 0.9 + j * (w - 1.8) / 3)
        cyl(x, 0, RB + 0.5, 0.3, YB + 0.1, C['column'], seg=10, ol=0.05)
        bl = math.hypot(d, YF - YB)
        box((x, (YF + YB) / 2 - 0.5, (RF + RB) / 2), (0.28, 0.55, bl), C['beam'], ol=0.04, rx=-tilt)
        cyl(x, YB, RB + 0.5, 0.18, 2.8, C['column'], seg=8, ol=0.04)   # 지붕 위로 솟은 기둥 끝
    # 지붕 앞 깃발
    for j in range(7):
        x = sx * (ROOF_X + 0.5 + j * (w - 1.0) / 6)
        cyl(x, YF + 0.4, RF + 0.05, 0.04, 2.2, C['pole'], seg=6, ol=0.015)
        fl = SEAT[(j + (0 if sx > 0 else 2)) % len(SEAT)]
        bmf = bmesh.new()
        a = bmf.verts.new(P(x, YF + 2.55, RF + 0.05)); b = bmf.verts.new(P(x, YF + 1.85, RF + 0.05))
        c = bmf.verts.new(P(x + sx * 1.25, YF + 2.2, RF + 0.25))
        a2 = bmf.verts.new(P(x, YF + 2.55, RF + 0.11)); b2 = bmf.verts.new(P(x, YF + 1.85, RF + 0.11))
        c2 = bmf.verts.new(P(x + sx * 1.25, YF + 2.2, RF + 0.31))
        bmf.faces.new([a, b, c]); bmf.faces.new([a2, c2, b2])
        bmf.faces.new([a, a2, b2, b]); bmf.faces.new([b, b2, c2, c]); bmf.faces.new([c, c2, a2, a])
        put(bmf, fl, 0.02)

# 가운데 전광판 탑
SW, SB = 6.9, ytop + 0.9
ST = SB + 7.6
SZ = zb - 0.9
box((0, (SB + ST) / 2, SZ - 0.55), (2 * SW + 0.9, ST - SB + 0.9, 1.1), C['navy'], ol=0.07)
for sx in (-1, 1):
    box((sx * (SW + 0.2), SB / 2, SZ - 0.6), (0.9, SB, 0.9), C['column'], ol=0.05)
    box((sx * (SW + 0.55), ST + 1.0, SZ - 0.55), (0.5, 2.0, 0.9), C['white'], ol=0.04)
# 전광판 화면(게임이 글자를 그린다): 따로 한 덩어리, UV 있음
me = bpy.data.meshes.new('screen')
bmS = bmesh.new()
uv = bmS.loops.layers.uv.new('UVMap')
v = [bmS.verts.new(P(-SW, SB + 0.45, SZ + 0.02)), bmS.verts.new(P(SW, SB + 0.45, SZ + 0.02)),
     bmS.verts.new(P(SW, ST - 0.45, SZ + 0.02)), bmS.verts.new(P(-SW, ST - 0.45, SZ + 0.02))]
f = bmS.faces.new(v)
bmS.normal_update()
if f.normal.dot(Vector((0, -1, 0))) < 0:  # 코트(+z, Blender -y) 쪽을 보게
    bmesh.ops.reverse_faces(bmS, faces=[f])
for loop in f.loops:  # 코트에서 봤을 때 왼쪽 아래가 (0, 0)
    co = loop.vert.co
    loop[uv].uv = ((co.x + SW) / (2 * SW), (co.z - (SB + 0.45)) / (ST - SB - 0.9))
bmS.to_mesh(me)
bmS.free()
me.materials.append(MATS[C['screen']])
col.objects.link(bpy.data.objects.new('screen', me))
# 꼭대기 장식: 반원 판 + 큰 테니스공
half = [(4.2 * math.cos(math.pi * k / 16), ST + 0.45 + 4.2 * math.sin(math.pi * k / 16)) for k in range(17)]
prism(half, SZ - 0.9, SZ - 0.2, C['white'], axis='z', ol=0.07)
blob((0, ST + 2.6, SZ + 0.1), 1.45, C['ballc'], sub=3, ol=0.06)
for sx in (-1, 1):  # 공의 솔기(흰 줄 두 개)
    for k in range(10):
        a0 = math.pi * (k / 10 - 0.5)
        a1 = math.pi * ((k + 1) / 10 - 0.5)
        x0, y0 = sx * (0.55 + 0.75 * (1 - math.cos(a0))), math.sin(a0) * 1.32
        x1, y1 = sx * (0.55 + 0.75 * (1 - math.cos(a1))), math.sin(a1) * 1.32
        xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
        zz = SZ + 0.1 + math.sqrt(max(0.0, 1.45 ** 2 - xm ** 2 - ym ** 2)) + 0.02
        box((xm, ST + 2.6 + ym, zz), (0.12, math.hypot(x1 - x0, y1 - y0) + 0.04, 0.05), C['white'], ol=0, rz=-math.atan2(x1 - x0, y1 - y0))
# 꼭대기 깃대 둘
for sx in (-1, 1):
    cyl(sx * 3.4, ST + 0.4, SZ - 0.5, 0.06, 4.2, C['pole'], seg=6, ol=0.02)
    bmf = bmesh.new()
    a = bmf.verts.new(P(sx * 3.4, ST + 4.5, SZ - 0.5)); b = bmf.verts.new(P(sx * 3.4, ST + 3.3, SZ - 0.5))
    c = bmf.verts.new(P(sx * 3.4 + sx * 2.0, ST + 3.9, SZ - 0.2))
    a2 = bmf.verts.new(P(sx * 3.4, ST + 4.5, SZ - 0.42)); b2 = bmf.verts.new(P(sx * 3.4, ST + 3.3, SZ - 0.42))
    c2 = bmf.verts.new(P(sx * 3.4 + sx * 2.0, ST + 3.9, SZ - 0.12))
    bmf.faces.new([a, b, c]); bmf.faces.new([a2, c2, b2])
    bmf.faces.new([a, a2, b2, b]); bmf.faces.new([b, b2, c2, c]); bmf.faces.new([c, c2, a2, a])
    put(bmf, C['pink'] if sx < 0 else C['sky'], 0.02)

# ── 양옆 관중석 ──────────────────────────────────
SX0, SWALK, SNR, STR, SRS = WX + 0.3, 0.8, 9, 0.86, 0.43
SZ0, SZ1 = ZF - 0.3, 14.6
sxb = SX0 + SWALK + SNR * STR
sytop = WH + SNR * SRS
SAISLES = [-12.6, -5.4, 1.8, 9.0]
for sx in (-1, 1):
    prof = [(sx * SX0, 0), (sx * SX0, WH), (sx * (SX0 + SWALK), WH)]
    for i in range(SNR):
        y = WH + (i + 1) * SRS
        prof += [(sx * (SX0 + SWALK + i * STR), y), (sx * (SX0 + SWALK + (i + 1) * STR), y)]
    prof += [(sx * sxb, sytop + 1.0), (sx * (sxb + 0.4), sytop + 1.0), (sx * (sxb + 0.4), 0)]
    prism(prof, SZ0, SZ1, C['concrete'], axis='z', ol=0.06)
    box((sx * (SX0 + 0.08), WH + 0.3, (SZ0 + SZ1) / 2), (0.16, 0.5, SZ1 - SZ0), C['white'], ol=0.03)
    box((sx * SX0, WH + 0.46, (SZ0 + SZ1) / 2), (0.04, 0.11, SZ1 - SZ0), C['sky'], ol=0)
    for i in range(SNR):
        y = WH + (i + 1) * SRS
        xr = sx * (SX0 + SWALK + (i + 1) * STR)
        xf = sx * (SX0 + SWALK + i * STR)
        for k, (z0, z1) in enumerate(sections(SZ0, SZ1, SAISLES)):
            cm = SEAT[(k + 2 + i // 3) % len(SEAT)] if i % 3 else C['white']
            box((xr - sx * 0.36, y + 0.2, (z0 + z1) / 2), (0.42, 0.4, z1 - z0 - 0.2), cm, ol=0)
            box((xr - sx * 0.1, y + 0.55, (z0 + z1) / 2), (0.08, 0.42, z1 - z0 - 0.2), cm, ol=0)
            n = int((z1 - z0 - 0.3) / 0.62)
            for s in range(n):
                z = z0 + 0.15 + (s + 0.5) * (z1 - z0 - 0.3) / n
                SEATS.append([round(xr - sx * 0.34, 2), round(y + 0.4, 2), round(z, 2), round(-sx * math.pi / 2, 4), 1 if i >= 5 else 0])
        for z in SAISLES:
            box((xf + sx * 0.06, y + 0.015, z), (0.1, 0.03, 1.1), C['yellow'], ol=0)
    # 줄무늬 차양(뒤쪽 네 줄을 덮는다)
    ax0, ax1, ay0, ay1 = sx * (sxb + 0.5), sx * (SX0 + SWALK + 4.6 * STR), sytop + 3.2, sytop + 2.3
    tl = math.atan2(ay0 - ay1, abs(ax0 - ax1))
    L = math.hypot(ax0 - ax1, ay0 - ay1)
    nstr = 22
    for k in range(nstr):
        z0 = SZ0 + 0.2 + k * (SZ1 - SZ0 - 0.4) / nstr
        z1 = SZ0 + 0.2 + (k + 1) * (SZ1 - SZ0 - 0.4) / nstr
        box(((ax0 + ax1) / 2, (ay0 + ay1) / 2, (z0 + z1) / 2), (L, 0.14, z1 - z0), C['awn'] if k % 2 else C['white'], ol=0, rz=sx * tl)
    box((ax1, ay1 - 0.18, (SZ0 + SZ1) / 2), (0.12, 0.42, SZ1 - SZ0 - 0.3), C['awn'], ol=0.03)
    for j in range(6):
        z = SZ0 + 0.6 + j * (SZ1 - SZ0 - 1.2) / 5
        cyl(sx * (sxb + 0.2), 0, z, 0.16, ay0 + 0.1, C['column'], seg=8, ol=0.04)
        cyl(ax1 + sx * 0.25, WH + 4.6 * SRS, z, 0.07, ay1 - WH - 4.6 * SRS, C['pole'], seg=6, ol=0.02)

# 우리 쪽 끝: 낮은 단과 나무(카메라에는 거의 안 보인다)
box((0, 0.6, ZN + 2.2), (2 * GX, 1.2, 3.6), C['concrete2'], ol=0.04)

# ── 조명탑 ────────────────────────────────────────
for (x, z) in [(-23.5, -38.0), (23.5, -38.0), (-23.5, 18.5), (23.5, 18.5)]:
    H = 24.0
    cyl(x, 0, z, 0.55, H, C['pole'], seg=10, ol=0.06, r2=0.32)
    ang = math.atan2(-x, -z)  # 코트 가운데를 본다
    head = (x + math.sin(ang) * 0.6, H + 1.4, z + math.cos(ang) * 0.6)
    box(head, (5.2, 3.2, 0.5), C['navy'], ol=0.07, ry=ang, rx=0.32)
    R = rot3(rx=0.32, ry=ang)
    for r in range(3):
        for k in range(4):
            w = P(*head) + R @ P((k - 1.5) * 1.15, (r - 1) * 0.92, 0.3)
            box((w.x, w.z, -w.y), (0.95, 0.75, 0.12), C['lamp'], ol=0, ry=ang, rx=0.32)

# ── 나무: 경기장 둘레와 멀리 숲 ────────────────────
LEAF = [C['leaf'], C['leaf2'], C['leaf3']]
def tree(x, z, s, near=True):
    cyl(x, 0, z, 0.22 * s, 1.8 * s, C['trunk'], seg=6, ol=0.04 if near else 0)
    k = rnd.randrange(3)
    for j in range(3 if near else 2):
        ox, oz = rnd.uniform(-0.8, 0.8) * s, rnd.uniform(-0.8, 0.8) * s
        blob((x + ox, (2.3 + j * 0.9 + rnd.uniform(0, 0.4)) * s, z + oz), (1.5 - j * 0.25) * s, LEAF[(k + j) % 3], sub='uv' if near else 1, ol=0.08 if near else 0)
# 관중석 바깥쪽
for i in range(26):
    side = rnd.choice((-1, 1))
    tree(side * rnd.uniform(23.5, 34), rnd.uniform(-30, 26), rnd.uniform(1.4, 2.2))
for i in range(14):
    tree(rnd.uniform(-38, 38), rnd.uniform(-52, -42), rnd.uniform(1.8, 2.6))
# 멀리 숲(둥글게)
for i in range(70):
    a = rnd.uniform(0, 2 * math.pi)
    r = rnd.uniform(62, 120)
    x, z = math.sin(a) * r, math.cos(a) * r
    if z > 30 and abs(x) < 50:
        continue
    tree(x, z, rnd.uniform(2.6, 4.2), near=False)

# ── 산 ───────────────────────────────────────────
for i in range(16):
    a = math.pi + (i - 7.5) / 7.5 * 1.55 + rnd.uniform(-0.08, 0.08)
    r = rnd.uniform(185, 250)
    x, z = math.sin(a) * r, math.cos(a) * r
    rr = rnd.uniform(42, 78)
    blob((x, -rr * 0.12, z), rr, C['hill2'] if r > 215 else C['hill'], sub=3, sy=rnd.uniform(0.32, 0.5), sx=1.25)

# ── 구름 ──────────────────────────────────────────
for i in range(13):
    a = math.pi + (i - 6) / 6 * 1.45 + rnd.uniform(-0.08, 0.08)
    r = rnd.uniform(240, 300)
    el = rnd.uniform(0.36, 0.66)
    cx, cz, cy = math.sin(a) * r, math.cos(a) * r, math.tan(el) * r
    s = rnd.uniform(13, 21)
    tx, tz = math.cos(a), -math.sin(a)  # 시선과 직각인 방향으로 늘어놓는다
    for j in range(rnd.randint(5, 8)):
        u = rnd.uniform(-2.4, 2.4)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=11, v_segments=7, radius=1.0)
        rr = s * rnd.uniform(0.55, 1.0) * (1 - abs(u) / 4.2)
        bm.transform(Matrix.Translation(P(cx + tx * u * s, cy + rnd.uniform(0, 0.45) * s * (1 - abs(u) / 3), cz + tz * u * s)) @ Matrix.Diagonal((rr * 1.25, rr * 1.25, rr * 0.75, 1)))
        put(bm, C['cloud'], 0, True)

# ── 내보내기 ──────────────────────────────────────
for name, bm in BUCKET.items():
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(MATS[name])
    col.objects.link(bpy.data.objects.new(name, me))
info = bpy.data.objects.new('stadium_info', None)
col.objects.link(info)
info['seats'] = json.dumps(SEATS, separators=(',', ':'))
info['nets'] = json.dumps(NETS, separators=(',', ':'))
info['banner'] = json.dumps([0, 1.55, ZF + 0.02, 15.0, 1.5])
info['screen'] = json.dumps([0, (SB + ST) / 2, SZ, 2 * SW, ST - SB - 0.9])
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in col.objects if o.type == 'MESH')
print('STADIUM objects', len(col.objects), 'tris', tris, 'seats', len(SEATS))
# 법선은 빼고 내보낸다(파일이 40% 작아진다). 게임이 면 방향으로 다시 계산한다: 둥근 것(잎, 구름, 산, 공)은 부드럽게, 나머지는 각지게
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_yup=True, export_apply=True, export_normals=False,
                          export_animations=False, export_cameras=False, export_lights=False)
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print('STADIUM wrote', OUT)
