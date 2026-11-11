# 모션캡처(BVH) → 스윙 키 재료(JSON). 시간은 임팩트가 0, 자리는 선수 기준(+z 네트 쪽, +x 왼쪽, m)
# 손목 자리와 팔꿈치 방향은 가슴 기준으로 남기고, 리그의 어깨에 붙이는 일은 JS(build_keys.js)가 한다
# 실행: python -I tools/char3d/mocap/convert.py  (BVH는 tools/char3d/mocap/raw/에, 커밋하지 않는다)
import sys, os, json, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bvh
RAW = os.path.join(HERE, 'raw') + os.sep
DT = 0.05   # 키 간격(초)
# 샷 → (파일, 창 시작, 창 끝, 왼손 잡는 법)
CLIPS = {
  'fh': ('mrios_Derecha', -1.0, 0.9, None),
  'bh': ('mrios_Reves', -1.0, 0.9, 'grip2'),
  'fv': ('mrios_VDerecha', -0.8, 0.75, 'throat'),
  'bv': ('astrejos_VReves', -0.8, 0.75, 'throat'),
  'sv': ('mrios_Servicio', -1.6, 1.0, None),
  'sm': ('mrios_Remate', -1.2, 0.8, 'throat'),
}
SRC_LABEL = {'mrios': '여자 선수 C(일반)', 'astrejos': '여자 선수 A(일반)'}

def peaks(sp, thr, gap):
    pk = []
    for i in np.argsort(-sp):
        if sp[i] < thr: break
        if all(abs(i - p) > gap for p in pk): pk.append(i)
    return sorted(pk)
def unit(v): return v / np.linalg.norm(v, axis=-1, keepdims=True)
def rotY(a):
    c, s = np.cos(a), np.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def eulYXZ(M):   # M = Ry(a) Rx(b) Rz(c) → (a, b, c) 도
    b = np.arcsin(np.clip(-M[1, 2], -1, 1)); a = np.arctan2(M[0, 2], M[2, 2]); c = np.arctan2(M[1, 0], M[1, 1])
    return np.degrees([a, b, c])

data = {}
cache = {}
def get(name):
    if name not in cache: cache[name] = bvh.load(RAW + name + '.bvh')
    return cache[name]

# 라켓 축(오른손목 회전 기준): 양손 백핸드에서 오른손목 → 왼손목 방향은 손목에 대해 거의 일정하다(가운데 7~11도). 그것을 손잡이 방향으로 쓴다
ax = []
for name in ['mrios_Reves', 'mrios_VReves', 'jangel_Reves']:
    pos, R, dt, J = get(name)
    rw, lw = pos['RightWrist'], pos['LeftWrist']
    sp = np.linalg.norm(np.diff(rw, axis=0), axis=1) / dt / 100
    for p in peaks(sp, 0.6 * np.percentile(sp, 99.5), 120):
        for i in range(max(0, p - 50), min(len(rw), p + 20), 5):
            d = lw[i] - rw[i]; g = np.linalg.norm(d)
            if g <= 30: ax.append(R['RightWrist'][i].T @ (d / g))
SHAFT = unit(np.mean(ax, 0)); print('shaft axis in wrist frame', np.round(SHAFT, 3), 'n', len(ax))

for sid, (name, w0, w1, hold) in CLIPS.items():
    pos, R, dt, J = get(name)
    F = len(pos['Hips'])
    rw, lw = pos['RightWrist'], pos['LeftWrist']
    sp = np.linalg.norm(np.diff(rw, axis=0), axis=1) / dt / 100
    sp = np.convolve(sp, np.ones(3) / 3, 'same')
    pk = peaks(sp, 0.6 * np.percentile(sp, 99.5), 120)
    # 서브·스매시: 빠르기 꼭대기 앞뒤에서 오른손목이 가장 높을 때가 임팩트
    # 서브·스매시: 라켓이 떨어졌다가 올라와 가장 곧게 선 때(손잡이 축이 가장 위를 볼 때)가 임팩트
    if sid in ('sv', 'sm'):
        pk = [p - 25 + int(np.argmax(np.einsum('fij,j->fi', R['RightWrist'][p - 25:p + 12], SHAFT)[:, 1])) for p in pk]
    # 땅볼: 손목이 가장 빠를 때는 라켓 머리가 아직 뒤에 처져 있다. 라켓이 네트와 나란해지는(손잡이 축의 앞뒤 성분이 0을 지나는) 때가 임팩트
    if sid in ('fh', 'bh'):
        def sq(p):
            sz = np.einsum('fij,j->fi', R['RightWrist'][p:p + 16], SHAFT)[:, 2]
            for j in range(1, len(sz)):
                if sz[j - 1] < 0 <= sz[j]: return p + j
            return p + int(np.argmin(np.abs(sz)))
        pk = [sq(p) for p in pk]
    n0, n1 = int(round(w0 / dt)), int(round(w1 / dt))
    pk = [p for p in pk if p + n0 >= 0 and p + n1 < F and all(q == p or abs(q - p) > max(-n0, n1) * 0.8 for q in pk)]
    # 가장 흔한 한 번(가운데에 가장 가까운 것): 골반 기준 오른손목 길
    feats = []
    for p in pk:
        idx = np.arange(p + n0, p + n1 + 1, 5)
        feats.append((rw[idx] - pos['Hips'][idx]).ravel())
    feats = np.array(feats); D = np.linalg.norm(feats[:, None] - feats[None], axis=2).sum(1)
    i0 = pk[int(np.argmin(D))]
    # 줄 면: 임팩트 때 네트 쪽(+z)을 본다고 보고 손목 기준 방향을 맞춘다(같은 샷 모든 번의 평균)
    fa = []
    for p in pk:
        s = R['RightWrist'][p] @ SHAFT; z = np.array([0, 0, 1.]); f = unit(z - s * (z @ s))
        fa.append(R['RightWrist'][p].T @ f)
    FACE = unit(np.mean(fa, 0)); FACE = unit(FACE - SHAFT * (FACE @ SHAFT))
    spread = np.degrees(np.arccos(np.clip(np.array(fa) @ FACE, -1, 1)))
    # 바닥, 원점(창 시작 때 두 발목 가운데)
    ground = np.percentile(np.minimum(pos['LeftAnkle_end'][:, 1], pos['RightAnkle_end'][:, 1]), 1)
    o = (pos['LeftAnkle'][i0 + n0] + pos['RightAnkle'][i0 + n0]) / 2
    toss = None
    if sid == 'sv':
        a = i0 - int(1.6 / dt); top = a + int(np.argmax(lw[a:i0, 1])); toss = round((top - i0) * dt - 0.05, 2)
    rows = []
    for t in np.arange(w0, w1 + 1e-9, DT):
        i = i0 + int(round(t / dt))
        Rh = R['Hips'][i]; fw = Rh @ np.array([0, 0, 1.]); yaw = np.arctan2(fw[0], fw[2])
        Rc = R['Chest'][i]; ch = eulYXZ(rotY(-yaw) @ Rc)
        row = dict(t=round(float(t), 3), hip=[*((pos['Hips'][i] - o) / 100 * [1, 0, 1])[[0, 2]].tolist(), float((pos['Hips'][i][1] - ground) / 100), float(np.degrees(yaw))],
                   chest=ch.tolist(), chestQ=Rc.tolist())
        for side, k in (('Right', 'r'), ('Left', 'l')):
            A, T = pos[side + 'Ankle'][i], pos[side + 'Ankle_end'][i]; v = T - A
            ball = A + 0.72 * v
            pitch = np.degrees(np.arctan2(-v[1], np.hypot(v[0], v[2]))) - np.degrees(np.arctan2(4.75, 16.15))
            lat = R[side + 'Ankle'][i] @ np.array([1, 0, 0.]); fw = np.cross(lat, [0, 1, 0])
            row[k + 'f'] = [float((ball[0] - o[0]) / 100), float((ball[2] - o[2]) / 100), float(np.degrees(np.arctan2(fw[0], fw[2]))), float(max(0, ball[1] - ground - 1.33) / 100)]
            row[k + 'heel'] = float(max(0, pitch))
            S_, E, W = pos[side + 'Shoulder'][i], pos[side + 'Elbow'][i], pos[side + 'Wrist'][i]
            row[k + 'hOff'] = (Rc.T @ (W - S_) / 100).tolist()
            a_ = unit(W - S_); pv = (E - S_) - a_ * ((E - S_) @ a_)
            row[k + 'pc'] = (Rc.T @ unit(pv)).tolist() if np.linalg.norm(pv) > 3 else None
        s = R['RightWrist'][i] @ SHAFT; f = R['RightWrist'][i] @ FACE; f = unit(f - s * (f @ s))
        row['s'] = s.tolist(); row['f'] = f.tolist()
        gap = np.linalg.norm(lw[i] - rw[i]) / 100
        throat = rw[i] / 100 + s * 0.28
        if hold == 'grip2': row['hold'] = 'grip2' if gap < 0.30 else None
        elif hold == 'throat': row['hold'] = 'throat' if np.linalg.norm(lw[i] / 100 - throat) < 0.16 else None
        else: row['hold'] = None
        rows.append(row)
    # 발끝 방향을 이어지게 펴고, 비운 팔꿈치 방향은 이웃 사이로 메운다
    for kf in ('rf', 'lf'):
        y = np.unwrap(np.radians([r[kf][2] for r in rows]))
        for r, v in zip(rows, np.degrees(y)): r[kf][2] = float(v)
    for kp in ('rpc', 'lpc'):
        idx = [j for j, r in enumerate(rows) if r[kp] is not None]
        for j, r in enumerate(rows):
            if r[kp] is None:
                a = max([x for x in idx if x < j], default=None); b = min([x for x in idx if x > j], default=None)
                if a is None: r[kp] = rows[b][kp]
                elif b is None: r[kp] = rows[a][kp]
                else: u = (j - a) / (b - a); r[kp] = unit((1 - u) * np.array(rows[a][kp]) + u * np.array(rows[b][kp])).tolist()
    # 쥐는 법(손잡이 축 둘레로 돌린 각): 포핸드를 이스턴(0)으로 두고 손목 기준을 맞춰, 샷마다 줄 면이 손에 대해 어디를 보는지로 정한다
    GS = unit(np.array([-0.45, 0, 0.89])); GF = np.array([0, -1, 0.]); GX = np.cross(GS, GF)
    # 포핸드는 세미웨스턴(-40도)으로 본다. 그러면 서브가 컨티넨탈(+45도) 쯤에 온다(동호인 여자 선수에게 흔한 쥐는 법)
    b0 = np.radians(-40); F0 = np.cos(b0) * GF + np.sin(b0) * GX
    if sid == 'fh': globals()['MAPM'] = np.column_stack([GS, F0, np.cross(GS, F0)]) @ np.column_stack([SHAFT, FACE, np.cross(SHAFT, FACE)]).T
    fv_ = MAPM @ FACE; bevel = float(np.degrees(np.arctan2(fv_ @ GX, fv_ @ GF)))
    who = name.split('_')[0]
    data[sid] = dict(bevel=round(bevel, 1), src=SRC_LABEL[who], impact=float(i0 * dt), reps=len(pk), faceSpread=float(np.median(spread)), toss=toss, rows=rows,
                     armLen=float(np.linalg.norm(pos['RightElbow'][0] - pos['RightShoulder'][0]) + np.linalg.norm(pos['RightWrist'][0] - pos['RightElbow'][0])) / 100, hipH=0.8233)
    holds = ''.join('T' if r['hold'] == 'throat' else 'G' if r['hold'] == 'grip2' else '.' for r in rows)
    move = np.linalg.norm(np.array(rows[-1]['hip'][:2]) - np.array(rows[0]['hip'][:2]))
    print(f"{sid}: bevel {bevel:.0f}", end=' ')
    print(f"{sid}: {SRC_LABEL[who]} reps {len(pk)} pick {i0*dt:.2f}s faceSpread {np.median(spread):.0f}deg toss {toss} hipsMove {move:.2f}m hold {holds}")
json.dump(data, open(os.path.join(HERE, 'clips.json'), 'w', encoding='utf-8'), ensure_ascii=True)
print('ok')
