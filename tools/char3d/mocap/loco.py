# 이동 동작(100STYLE, CC BY 4.0) → 이동 엔진 자료(art/char3d/loco.bin)
# 걷기·달리기·옆으로·뒤로·서 있기·바뀌기를 초당 30프레임으로 줄이고, 프레임마다
#   뿌리(골반을 바닥에 내리고 부드럽게 편 자리와 방향)의 움직임, 뿌리 기준 골반·가슴·발(앞꿈치 자리, 발끝 방향, 들림, 뒤꿈치 각), 발 닿음을 남긴다.
# 게임(js/loco3d.js)은 이것으로 '앞으로 갈 길'이 가장 비슷한 프레임을 찾아 이어 튼다(모션 매칭).
# 실행: python -I tools/char3d/mocap/loco.py   (BVH는 tools/char3d/mocap/raw/100style/에, 커밋하지 않는다)
import sys, os, json, struct, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bvh
RAW = os.path.join(HERE, 'raw', '100style') + os.sep
OUT = os.path.join(HERE, '..', '..', '..', 'art', 'char3d', 'loco.bin')
FILES = ['ID', 'FW', 'FR', 'BW', 'BR', 'SW', 'SR', 'TR1']
FPS = 30

def gauss(x, sig, axis=0):
    """프레임 sig(표준편차)로 가우스 평활(끝은 끝값으로 채움)"""
    r = int(3 * sig) + 1; k = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2); k /= k.sum()
    pad = [(0, 0)] * x.ndim; pad[axis] = (r, r)
    xp = np.pad(x, pad, mode='edge')
    return np.apply_along_axis(lambda v: np.convolve(v, k, 'valid'), axis, xp)
def eulYXZ(M):   # M = Ry(a) Rx(b) Rz(c) → (a, b, c) 도
    b = np.arcsin(np.clip(-M[..., 1, 2], -1, 1)); a = np.arctan2(M[..., 0, 2], M[..., 2, 2]); c = np.arctan2(M[..., 1, 0], M[..., 1, 1])
    return np.degrees(np.stack([a, b, c], -1))
def rotY(a):
    c, s = np.cos(a), np.sin(a); z, o = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([c, z, s], -1), np.stack([z, o, z], -1), np.stack([-s, z, c], -1)], -2)

segs = []
for name in FILES:
    J, D, dt = bvh.parse(RAW + 'Neutral_%s.bvh' % name)
    pos, R = bvh.fk(J, D)
    step = int(round(1 / FPS / dt))
    P = {k: v[::step] / 100 for k, v in pos.items()}; Rm = {k: v[::step] for k, v in R.items()}
    F = len(P['Hips'])
    # T자세(팔을 옆으로 편 것)와 그 앞뒤 1초는 뺀다
    ww = np.linalg.norm(P['LeftWrist'] - P['RightWrist'], axis=1)
    bad = ww > 1.15
    bad = np.convolve(bad.astype(float), np.ones(2 * FPS + 1), 'same') > 0
    ground = np.percentile(np.minimum(P['LeftToe'][:, 1], P['RightToe'][:, 1]), 1)
    # 뿌리: 골반을 바닥에 내려 0.1초로 편 자리, 방향은 골반·가슴의 앞쪽을 0.2초로 편 것
    hip = P['Hips']
    lr = P['LeftHip'] - P['RightHip']; lr[:, 1] = 0; lr /= np.linalg.norm(lr, axis=1, keepdims=True)
    fh = np.stack([-lr[:, 2], np.zeros(F), lr[:, 0]], 1)
    ls = P['LeftShoulder'] - P['RightShoulder']; ls[:, 1] = 0; ls /= np.linalg.norm(ls, axis=1, keepdims=True)
    fc = np.stack([-ls[:, 2], np.zeros(F), ls[:, 0]], 1)
    fw = gauss(fh + fc, 0.2 * FPS); fw /= np.linalg.norm(fw, axis=1, keepdims=True)
    yaw = np.unwrap(np.arctan2(fw[:, 0], fw[:, 2]))
    rp = gauss(hip[:, [0, 2]], 0.1 * FPS)
    # 이어진 좋은 구간마다 자른다
    good = ~bad; i = 0
    while i < F:
        if not good[i]: i += 1; continue
        j = i
        while j < F and good[j]: j += 1
        if j - i > 2 * FPS:
            segs.append(dict(name=name, P={k: v[i:j] for k, v in P.items()}, R={k: v[i:j] for k, v in Rm.items()}, yaw=yaw[i:j], rp=rp[i:j], ground=ground))
        i = j

print('segments', len(segs), 'frames', sum(len(s['yaw']) for s in segs))
rows = []   # 프레임마다 값
CH = ['rx', 'rz', 'ry',            # 뿌리(세계): 자리, 방향(라디안)
      'hx', 'hy', 'hz', 'hyaw',     # 뿌리 기준 골반 자리(높이는 바닥 위), 골반 방향(도, 뿌리 기준)
      'cy', 'cp', 'cr',             # 가슴 회전(골반 방향 기준, 도)
      'rfx', 'rfz', 'rfy', 'rfl', 'rhe', 'lfx', 'lfz', 'lfy', 'lfl', 'lhe',   # 발(뿌리 기준 앞꿈치 x z, 발끝 방향 도, 들림 m, 뒤꿈치 각 도)
      'rc', 'lc']                    # 발 닿음(0~1)
seg_start = []
allv = []
for s in segs:
    P, R, yaw, rp, gnd = s['P'], s['R'], s['yaw'], s['rp'], s['ground']
    F = len(yaw); seg_start.append(len(allv))
    Ry = rotY(-yaw)   # 세계 → 뿌리
    def loc(p):   # 세계 자리 → 뿌리 기준(x 왼쪽, z 앞)
        d = p.copy(); d[:, 0] -= rp[:, 0]; d[:, 2] -= rp[:, 1]
        return np.einsum('fij,fj->fi', Ry, d)
    h = loc(P['Hips']); hy_ = P['Hips'][:, 1] - gnd
    Rh = R['Hips']; hf = np.einsum('fij,j->fi', Rh, [0, 0, 1.]); hyaw = np.degrees(np.unwrap(np.arctan2(hf[:, 0], hf[:, 2]) - yaw))
    hyaw = (hyaw + 180) % 360 - 180
    ch = eulYXZ(np.einsum('fij,fjk->fik', rotY(-np.arctan2(hf[:, 0], hf[:, 2])), R['Chest3']))
    feet = {}
    for side, k in (('Right', 'r'), ('Left', 'l')):
        A, T = P[side + 'Ankle'], P[side + 'Toe']
        b = loc(T)
        lat = np.einsum('fij,j->fi', R[side + 'Ankle'], [1, 0, 0.]); f_ = np.cross(lat, [0, 1, 0])
        fy = np.degrees(np.arctan2(f_[:, 0], f_[:, 2]) - yaw); fy = (fy + 180) % 360 - 180
        v = T - A; pitch = np.degrees(np.arctan2(-v[:, 1], np.hypot(v[:, 0], v[:, 2])))
        lift = T[:, 1] - gnd
        sp = np.linalg.norm(np.gradient(T[:, [0, 2]], 1 / FPS, axis=0), axis=1)
        c = ((lift < 0.045) & (sp < 0.4)).astype(float)
        c = np.round(np.convolve(c, np.ones(3) / 3, 'same'))
        feet[k] = (b, fy, lift, pitch, c)
    # 뒤꿈치 각은 서 있을 때 값을 0으로
    p0 = np.percentile(np.concatenate([feet['r'][3], feet['l'][3]]), 20)
    for f in range(F):
        r = feet['r']; l = feet['l']
        allv.append([rp[f, 0], rp[f, 1], yaw[f], h[f, 0], hy_[f], h[f, 2], hyaw[f], *ch[f],
                     r[0][f, 0], r[0][f, 2], r[1][f], max(0, r[2][f] - 0.02), max(0, r[3][f] - p0), l[0][f, 0], l[0][f, 2], l[1][f], max(0, l[2][f] - 0.02), max(0, l[3][f] - p0), r[4][f], l[4][f]])
A = np.array(allv, dtype=np.float64); N = len(A)
seg_start.append(N)
# 서 있을 때 골반 높이(키 비교용): 뿌리가 거의 서 있는 프레임의 가운데값
sp = np.linalg.norm(np.diff(A[:, :2], axis=0), axis=1) * FPS
hipH = float(np.median(A[1:][sp < 0.05, 4]))
print('N', N, 'hipH %.3f' % hipH, 'root speed p50 %.2f p90 %.2f max %.2f' % (np.percentile(sp, 50), np.percentile(sp, 90), sp.max()))
print('contacts r %.2f l %.2f' % (A[:, -2].mean(), A[:, -1].mean()), 'lift p90 %.2f' % np.percentile(A[:, CH.index('rfl')], 90), 'heel p90 %.1f' % np.percentile(A[:, CH.index('rhe')], 90))
# 묶음: 머리(JSON) + Float32
meta = dict(fps=FPS, channels=CH, n=N, segs=seg_start, hipH=round(hipH, 4), names=[s['name'] for s in segs],
            src='100STYLE (Neutral) https://www.ianxmason.com/100style CC BY 4.0')
mb = json.dumps(meta).encode('utf-8')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'wb') as f:
    f.write(b'LOC1'); f.write(struct.pack('<I', len(mb))); f.write(mb)
    f.write(b'\0' * ((4 - (8 + len(mb)) % 4) % 4))
    f.write(A.astype('<f4').tobytes())
print('wrote', os.path.normpath(OUT), os.path.getsize(OUT), 'bytes')
