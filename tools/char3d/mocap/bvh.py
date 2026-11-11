# BVH 읽기와 순운동학(관절 세계 자리). 단위 cm, Y 위, 쉴 때 +z 앞, +x 왼쪽
import numpy as np

def parse(path):
    txt = open(path, encoding='utf-8', errors='replace').read().split('MOTION')
    toks = txt[0].split()
    joints = []   # dict(name, parent, offset, channels, end)
    stack = []; i = 0; cur = None
    while i < len(toks):
        t = toks[i]
        if t in ('ROOT', 'JOINT'):
            j = dict(name=toks[i + 1], parent=stack[-1] if stack else -1, offset=None, channels=[], end=None)
            joints.append(j); cur = len(joints) - 1; i += 2
        elif t == 'End':
            j = dict(name=joints[stack[-1]]['name'] + '_end', parent=stack[-1], offset=None, channels=[], end=True)
            joints.append(j); cur = len(joints) - 1; i += 2
        elif t == '{':
            stack.append(cur); i += 1
        elif t == '}':
            stack.pop(); cur = stack[-1] if stack else None; i += 1
        elif t == 'OFFSET':
            joints[cur]['offset'] = np.array([float(x) for x in toks[i + 1:i + 4]]); i += 4
        elif t == 'CHANNELS':
            n = int(toks[i + 1]); joints[cur]['channels'] = toks[i + 2:i + 2 + n]; i += 2 + n
        else:
            i += 1
    lines = txt[1].strip().splitlines()
    nf = int(lines[0].split(':')[1]); dt = float(lines[1].split(':')[1])
    data = np.array([[float(x) for x in l.split()] for l in lines[2:2 + nf] if l.strip()])
    return joints, data, dt

def rot(axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    if axis == 'X': return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 'Y': return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def fk(joints, data):
    """프레임마다 관절 세계 자리(cm)와 회전. 반환: pos[name] (F,3), R[name] (F,3,3)"""
    F = len(data)
    pos = {}; R = {}
    col = 0; colmap = []
    for j in joints:
        colmap.append(col); col += len(j['channels'])
    for ji, j in enumerate(joints):
        c0 = colmap[ji]
        Rl = np.tile(np.eye(3), (F, 1, 1)); tl = np.tile(j['offset'], (F, 1))
        for k, ch in enumerate(j['channels']):
            v = data[:, c0 + k]
            if ch.endswith('position'):
                tl[:, 'XYZ'.index(ch[0])] = v + (0 if j['parent'] >= 0 else 0)
            else:
                Rk = np.stack([rot(ch[0], d) for d in v])
                Rl = Rl @ Rk
        if j['parent'] < 0:
            pos[j['name']] = tl; R[j['name']] = Rl
        else:
            pn = joints[j['parent']]['name']
            pos[j['name']] = pos[pn] + np.einsum('fij,fj->fi', R[pn], tl)
            R[j['name']] = R[pn] @ Rl
    return pos, R

def load(path):
    joints, data, dt = parse(path)
    pos, R = fk(joints, data)
    return pos, R, dt, joints
