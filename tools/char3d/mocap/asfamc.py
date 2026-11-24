# CMU 모션캡처(ASF 뼈대 + AMC 동작)를 읽어 프레임마다 관절의 세계 자리를 낸다. loco.py가 100STYLE BVH와 같은 꼴로 쓰게
# 관절 이름을 100STYLE 이름으로 바꾸고, 회전(골반·가슴·발목)은 자리로 만든 틀로 낸다(뼈대마다 축 약속이 달라서)
# 자료: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), 모든 쓰임에 자유(원본을 그대로 팔지만 않으면)
import numpy as np

def _rx(a):
    c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def _ry(a):
    c, s = np.cos(a), np.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def _rz(a):
    c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
def _rot(order, angs):
    """order 'XYZ' 등, angs(도): 고정 축 순서대로 곱한 회전(CMU 약속: Rz·Ry·Rx)"""
    M = np.eye(3)
    for ax, a in zip(order, angs):
        R = {'X': _rx, 'Y': _ry, 'Z': _rz}[ax](np.radians(a)); M = R @ M
    return M

def parse_asf(path):
    L = [l.strip() for l in open(path, encoding='latin-1')]
    bones = {}; hier = {}; length_unit = 1.0; root_order = ['TX', 'TY', 'TZ', 'RX', 'RY', 'RZ']; root_axis = 'XYZ'
    i = 0; sec = None; cur = None
    while i < len(L):
        l = L[i]
        if l.startswith(':'):
            sec = l.split()[0]
            if sec == ':units': pass
        elif sec == ':units' and l.startswith('length'): length_unit = float(l.split()[1])
        elif sec == ':root':
            if l.startswith('order'): root_order = l.split()[1:]
            if l.startswith('axis'): root_axis = l.split()[1]
        elif sec == ':bonedata':
            if l == 'begin': cur = {'dof': [], 'axis': [0, 0, 0], 'order': 'XYZ'}
            elif l == 'end': bones[cur['name']] = cur; cur = None
            elif cur is not None:
                t = l.split()
                if t[0] == 'name': cur['name'] = t[1]
                elif t[0] == 'direction': cur['dir'] = np.array(list(map(float, t[1:4])))
                elif t[0] == 'length': cur['len'] = float(t[1])
                elif t[0] == 'axis': cur['axis'] = list(map(float, t[1:4])); cur['order'] = t[4]
                elif t[0] == 'dof': cur['dof'] = [d.lower() for d in t[1:]]
        elif sec == ':hierarchy':
            t = l.split()
            if t and t[0] not in ('begin', 'end'): hier[t[0]] = t[1:]
        i += 1
    for b in bones.values():
        C = _rot(b['order'], b['axis']); b['C'] = C; b['Ci'] = C.T
    parent = {}
    for p, ch in hier.items():
        for c in ch: parent[c] = p
    return dict(bones=bones, parent=parent, children=hier, unit=length_unit, root_order=root_order, root_axis=root_axis)

def parse_amc(path):
    frames = []; cur = None
    for l in open(path, encoding='latin-1'):
        l = l.strip()
        if not l or l.startswith('#') or l.startswith(':'): continue
        if l.isdigit(): cur = {}; frames.append(cur); continue
        t = l.split(); cur[t[0]] = list(map(float, t[1:]))
    return frames

def fk(asf, frames, to_m=None):
    """프레임마다 뼈 끝 자리(m)와 뼈의 세계 회전. 뼈 끝 = 그 뼈가 이어 주는 다음 관절"""
    B, par = asf['bones'], asf['parent']
    unit = to_m if to_m is not None else (1.0 / asf['unit']) * 0.0254   # CMU: 길이 단위 0.45 → 인치 / 0.45
    order = []; stack = ['root']
    while stack:
        n = stack.pop(); order.append(n); stack += list(reversed(asf['children'].get(n, [])))
    F = len(frames); pos = {n: np.zeros((F, 3)) for n in order}; R = {n: np.zeros((F, 3, 3)) for n in order}
    rax = asf['root_axis']
    for f, fr in enumerate(frames):
        r = fr['root']; o = asf['root_order']
        tv = np.array([r[o.index('TX')], r[o.index('TY')], r[o.index('TZ')]]) * unit
        angs = [r[o.index('R' + a)] for a in rax]
        Rr = _rot(rax, angs)
        pos['root'][f] = tv; R['root'][f] = Rr
        for n in order[1:]:
            b = B[n]; p = par[n]
            vals = fr.get(n, []); a = {'rx': 0.0, 'ry': 0.0, 'rz': 0.0}
            for k, d in enumerate(b['dof']):
                if k < len(vals): a[d] = vals[k]
            M = _rot('XYZ', [a['rx'], a['ry'], a['rz']])
            Rw = R[p][f] @ b['C'] @ M @ b['Ci']
            R[n][f] = Rw
            pos[n][f] = pos[p][f] + Rw @ (b['dir'] * b['len'] * unit)
    return pos, R

def frame_of(p0, p1, up_hint):
    """왼쪽(p0 - p1)과 위(up_hint)로 만든 틀: 열 = (왼쪽 x, 위 y, 앞 z)"""
    x = p0 - p1; x /= np.linalg.norm(x, axis=-1, keepdims=True)
    y = up_hint - np.sum(up_hint * x, -1, keepdims=True) * x; y /= np.linalg.norm(y, axis=-1, keepdims=True)
    z = np.cross(x, y)
    return np.stack([x, y, z], -1)

def load(asf_path, amc_path, fps_in=120):
    """loco.py의 100STYLE 꼴: P(이름 → 자리 m, 세계, y 위), R(Hips·Chest3·LeftAnkle·RightAnkle 회전 틀), 프레임 간격(초)"""
    asf = parse_asf(asf_path); frames = parse_amc(amc_path)
    pos, R = fk(asf, frames)
    P = {
        'Hips': pos['root'],
        'LeftHip': pos['lhipjoint'], 'RightHip': pos['rhipjoint'],
        'LeftShoulder': pos['lclavicle'], 'RightShoulder': pos['rclavicle'],
        'LeftWrist': pos['lradius'], 'RightWrist': pos['rradius'],
        'LeftKnee': pos['lfemur'], 'RightKnee': pos['rfemur'],
        'LeftAnkle': pos['ltibia'], 'RightAnkle': pos['rtibia'],
        'LeftToe': pos['lfoot'], 'RightToe': pos['rfoot'],
        'Chest': pos['thorax'], 'Neck': pos['lowerneck'],
    }
    up = np.array([0, 1.0, 0])
    spine = P['Neck'] - P['Hips']
    Rm = {'Hips': frame_of(P['LeftHip'], P['RightHip'], spine), 'Chest3': frame_of(P['LeftShoulder'], P['RightShoulder'], P['Neck'] - P['Chest'])}
    for s in ('Left', 'Right'):
        fw = P[s + 'Toe'] - P[s + 'Ankle']; fw[:, 1] = 0; fw /= np.linalg.norm(fw, axis=1, keepdims=True)
        lat = np.cross(np.broadcast_to(up, fw.shape), fw)   # 발의 왼쪽(가로축): cross(lat, 위) = 발끝 쪽
        Rm[s + 'Ankle'] = np.stack([lat, np.broadcast_to(up, fw.shape), fw], -1)
    return P, Rm, 1.0 / fps_in
