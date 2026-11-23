# 경기에서 녹화한 애니메이션 자세(refs/*.json)를 학습용 참고 동작(npz)으로 바꾼다.
# 선수마다 이어진 조각으로 나누고(화면을 끊은 곳, 한 프레임에 35cm 넘게 옮긴 곳), 30Hz 그대로 qpos·qvel(MuJoCo 순서)과 주요 지점(손·발·머리·라켓 가운데) 세계 자리를 만든다.
import json, glob, sys, os
import numpy as np
import mujoco
D = os.path.expanduser("~/tennis-rl/")
C = json.load(open(D + "model/ctrl.json"))
m = mujoco.MjModel.from_xml_string(open(D + "model/model.xml").read()); d = mujoco.MjData(m)
J = C["J"]; NJ = len(J); FPS = 30.0
K = C["spec"]["K"]; g = C["spec"]["grip"]; sh = np.array(g["shaft"]); sh /= np.linalg.norm(sh)
SWEET = (np.array(g["pos"]) + sh * 0.45) * K
KEY = ["leftHand", "rightHand", "leftFoot", "rightFoot", "head"]
KID = [mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, n) for n in KEY]
RH = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "rightHand")

def qmul(a, b):
    w1, x1, y1, z1 = np.moveaxis(a, -1, 0); w2, x2, y2, z2 = np.moveaxis(b, -1, 0)
    return np.stack([w1*w2-x1*x2-y1*y2-z1*z2, w1*x2+x1*w2+y1*z2-z1*y2, w1*y2-x1*z2+y1*w2+z1*x2, w1*z2+x1*y2-y1*x2+z1*w2], -1)
def qconj(a): return a * np.array([1, -1, -1, -1])
def rotvec(q):
    q = np.where(q[..., :1] < 0, -q, q); s = np.linalg.norm(q[..., 1:], axis=-1, keepdims=True)
    a = 2 * np.arctan2(s, q[..., :1]); return np.where(s < 1e-9, 2 * q[..., 1:], q[..., 1:] * a / np.maximum(s, 1e-12))
def qrot(q, v):
    t = qmul(qmul(q, np.concatenate([np.zeros(v.shape[:-1] + (1,)), v], -1)), qconj(q)); return t[..., 1:]

def clips_of(path):
    R = json.load(open(path)); out = []
    names = R["names"]; assert names == [j["n"] for j in J], "관절 순서가 다르다"
    for i in range(4):
        F = [f for f in R["frames"] if f[0] == i]
        F.sort(key=lambda f: f[1])
        cur = []
        for k, f in enumerate(F):
            if cur:
                p0 = cur[-1]; jump = np.hypot(f[3][0] - p0[3][0], f[3][2] - p0[3][2])
                if f[2] or jump > 0.35 or abs(f[1] - p0[1] - 1 / FPS) > 0.02: out.append(cur); cur = []
            cur.append(f)
        if cur: out.append(cur)
    return [c for c in out if len(c) >= 2 * FPS]

def build(clip):
    T = len(clip)
    rp = np.array([f[3] for f in clip]); rq = np.array([f[4] for f in clip]); jq = np.array([f[5] for f in clip]).reshape(T, NJ, 4)
    # 부호를 이어지게(쿼터니언 q와 -q는 같은 회전)
    for a in [rq[:, None], jq]:
        for t in range(1, T):
            s = np.sign(np.sum(a[t] * a[t - 1], -1, keepdims=True)); s[s == 0] = 1; a[t] *= s
    qpos = np.zeros((T, m.nq)); qvel = np.zeros((T, m.nv))
    qpos[:, 0:3] = rp; qpos[:, 3:7] = rq
    for k, j in enumerate(J): qpos[:, j["qa"]:j["qa"] + 4] = jq[:, k]
    # 속도: 가운데 차분(끝은 한쪽)
    # 속도는 뒤 차분(바로 앞 프레임과의 차이): 게임은 앞 판단 때 목표와의 차이로 목표 빠르기를 잰다(js/phys3d.js stepPolicy)
    def diff(x): v = np.zeros_like(x); v[1:] = (x[1:] - x[:-1]) * FPS; v[0] = v[1] if len(x) > 1 else 0; return v
    def angv(q, local):   # q: (T,4) → 각속도. local이면 몸 기준(MuJoCo 볼 관절·자유 관절의 회전), 아니면 세계
        w = np.zeros((T, 3))
        a = np.concatenate([q[:1], q[:-2]]) if T > 2 else q; b = np.concatenate([q[2:], q[-1:]]) if T > 2 else q
        a = np.concatenate([q[:1], q[:-1]]); b = np.concatenate([q[1:], q[-1:]])
        dt = np.full((T, 1), 2 / FPS); dt[0] = dt[-1] = 1 / FPS
        a = np.concatenate([q[:1], q[:-1]]); b = q.copy(); dt = np.full((T, 1), 1 / FPS)
        e = qmul(qconj(a), b) if local else qmul(b, qconj(a))
        w = rotvec(e) / dt; w[0] = w[1] if T > 1 else 0; return w
    qvel[:, 0:3] = diff(rp); qvel[:, 3:6] = angv(rq, True)
    for k, j in enumerate(J): qvel[:, j["da"]:j["da"] + 3] = angv(jq[:, k], True)
    # 주요 지점 세계 자리(앞으로 계산)
    kp = np.zeros((T, len(KEY) + 1, 3))
    for t in range(T):
        d.qpos[:] = qpos[t]; mujoco.mj_kinematics(m, d)
        kp[t, :len(KEY)] = d.xpos[KID]; kp[t, -1] = d.xpos[RH] + qrot(d.xquat[RH], SWEET)
    return qpos, qvel, kp

if __name__ == "__main__":
    src = sys.argv[1]; out = sys.argv[2]
    Q, V, P, starts, lens = [], [], [], [], []
    n = 0
    for path in sorted(glob.glob(src + "/r*.json")):
        for c in clips_of(path):
            q, v, p = build(c); Q.append(q); V.append(v); P.append(p); starts.append(n); lens.append(len(q)); n += len(q)
    np.savez_compressed(out, qpos=np.concatenate(Q).astype(np.float32), qvel=np.concatenate(V).astype(np.float32), kp=np.concatenate(P).astype(np.float32), starts=np.array(starts), lens=np.array(lens))
    print("clips", len(starts), "frames", n, "minutes", round(n / FPS / 60, 1), "max |qvel| p99", float(np.percentile(np.abs(np.concatenate(V)), 99)))
