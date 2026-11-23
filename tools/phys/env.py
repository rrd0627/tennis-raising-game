# 3D 선수 물리 몸이 애니메이션(참고 동작)을 따라가며 균형을 잡도록 학습하는 환경(DReCon·DeepMimic 방식, MJX).
# 몸·관절 근육은 게임(js/phys3d.js)과 같다: 볼 관절 PD(용수철은 직접, 감쇠는 관절 damping), 물리 1/300초, 제어 30Hz.
# 행동: 관절마다 목표 회전에 더하는 작은 회전(축·각, SIG rad까지). 보상: 자세·손발 자리·몸 높이·기울기·빠르기를 따라간 만큼.
import json, os
import numpy as np
import jax, jax.numpy as jp
import mujoco
from mujoco import mjx
from brax.envs.base import Env, State

D = os.path.expanduser("~/tennis-rl/")
FPS = 30.0
SIG = 0.5
ZERO_V = float(os.environ.get("ZERO_V", 0.3))        # 멈춘 채로 시작하는 몫
PUSH_P = float(os.environ.get("PUSH_P", 1 / 90))     # 판단마다 골반을 밀 확률(평균 3초에 한 번)
PUSH_F = float(os.environ.get("PUSH_F", 200.0))      # 미는 힘 최대(N, 1/30초 동안)
OBS_N = float(os.environ.get("OBS_N", 0.01))         # 관측 잡음
BLEED = float(os.environ.get("BLEED", 1.0))          # 1이면 옮겨 주지 않는다: 물리 몸이 애니메이션 자리(그대로)를 따라간다
DRIFT = float(os.environ.get("DRIFT", 1.0))          # 애니메이션 자리에서 이만큼(m) 넘게 벌어지면 판이 끝난다
RES = float(os.environ.get("RES", 0.5))              # 남는 힘(Residual Force Control): 골반에 주는 힘의 최대(몸무게 비). 0이면 없음
RES_W = float(os.environ.get("RES_W", 0.3))          # 남는 힘을 쓴 만큼 빼는 보상


def qmul(a, b):
    w1, x1, y1, z1 = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    w2, x2, y2, z2 = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return jp.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], -1)


def qconj(a): return a * jp.array([1., -1., -1., -1.])
def qnorm(a): return a / jp.linalg.norm(a, axis=-1, keepdims=True)


def rotvec(q):
    q = jp.where(q[..., :1] < 0, -q, q)
    s = jp.linalg.norm(q[..., 1:], axis=-1, keepdims=True)
    a = 2 * jp.arctan2(s, q[..., :1])
    return jp.where(s < 1e-7, 2 * q[..., 1:], q[..., 1:] * a / jp.maximum(s, 1e-7))


def expq(v):
    a = jp.linalg.norm(v, axis=-1, keepdims=True)
    return jp.concatenate([jp.cos(a / 2), jp.where(a < 1e-7, v / 2, v * jp.sin(a / 2) / jp.maximum(a, 1e-7))], -1)


def qrot(q, v):
    t = qmul(qmul(q, jp.concatenate([jp.zeros(v.shape[:-1] + (1,)), v], -1)), qconj(q))
    return t[..., 1:]


def nlerp(a, b, u):
    s = jp.where(jp.sum(a * b, -1, keepdims=True) < 0, -1., 1.)
    return qnorm(a + (s * b - a) * u)


def heading_inv(q):
    f = qrot(q, jp.array([0., 0., 1.]))
    yaw = jp.arctan2(f[..., 0], f[..., 2])
    return jp.stack([jp.cos(-yaw / 2), jp.zeros_like(yaw), jp.sin(-yaw / 2), jp.zeros_like(yaw)], -1)


def tan6(q):   # 회전 행렬의 두 열(x축, y축)
    return jp.concatenate([qrot(q, jp.array([1., 0., 0.])), qrot(q, jp.array([0., 1., 0.]))], -1)


class TrackEnv(Env):
    def __init__(self, ref_path, ep_len=300, model_dir=None, impl=None):
        md = model_dir or D + "model/"
        C = json.load(open(md + "ctrl.json"))
        m = mujoco.MjModel.from_xml_string(open(md + "model.xml").read())
        J = C["J"]
        for j in J:
            for k in range(3):
                m.dof_damping[j["da"] + k] = j["kd"]
        self.mj = m
        self.impl = impl
        self.mx = mjx.put_model(m, impl=impl) if impl else mjx.put_model(m)
        if impl == "warp":   # 접촉 풀이 반복이 모자랐다는 경고를 매 걸음 찍지 않게(게임도 같은 반복 수라 그대로 둔다)
            o = self.mx.opt; self.mx = self.mx.replace(opt=o.replace(_impl=o._impl.replace(warn_overflow=0)))
        self.qa = jp.array([j["qa"] for j in J])
        self.da = jp.array([j["da"] for j in J])
        self.kp = jp.array([j["kp"] for j in J])
        self.kd = jp.array([j["kd"] for j in J])
        self.tm = jp.array([j["tm"] for j in J])
        self.nj = len(J)
        self.Mg = float(np.sum(m.body_mass)) * 9.81
        self.nsub = int(round(1 / FPS / m.opt.timestep))
        name = lambda n: mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, n)
        self.kid = jp.array([name(n) for n in ["leftHand", "rightHand", "leftFoot", "rightFoot", "head"]])
        self.rh = name("rightHand")
        K = C["spec"]["K"]
        g = C["spec"]["grip"]
        sh = np.array(g["shaft"]); sh /= np.linalg.norm(sh)
        self.sweet = jp.array((np.array(g["pos"]) + sh * 0.45) * K)
        R = np.load(ref_path)
        self.rq = jp.array(R["qpos"]); self.rv = jp.array(R["qvel"]); self.rk = jp.array(R["kp"])
        st, ln = R["starts"], R["lens"]
        valid = np.concatenate([np.arange(s, s + l - 1) for s, l in zip(st, ln)])
        ends = np.zeros(len(R["qpos"]), np.int32)
        for s, l in zip(st, ln):
            ends[s:s + l] = s + l - 1
        self.valid = jp.array(valid); self.ends = jp.array(ends); self.ep_len = ep_len
        self.d0 = mjx.make_data(m, impl=impl, naconmax=int(os.environ.get("NACON", 16)), njmax=int(os.environ.get("NJMAX", 64))) if impl else mjx.make_data(self.mx)
        d = self._fwd(self.d0.replace(qpos=self.rq[0], qvel=self.rv[0]))
        self._obs_size = int(self._obs(d, jp.int32(0)).shape[0])

    @property
    def observation_size(self): return self._obs_size

    @property
    def action_size(self): return self.nj * 3 + (3 if RES > 0 else 0)

    @property
    def backend(self): return "mjx"

    def _fwd(self, d): return mjx.kinematics(self.mx, d)
    def jq(self, qpos): return qnorm(qpos[self.qa[:, None] + jp.arange(4)])

    def keyp(self, d):   # 손·발·머리·라켓 가운데(세계)
        rs = d.xpos[self.rh] + qrot(d.xquat[self.rh], self.sweet)
        return jp.concatenate([d.xpos[self.kid], rs[None]], 0)

    def _obs(self, d, t, off=None):
        # 관측(게임 js/phys3d.js obsOf와 같아야 한다): 몸 상태(골반 높이·기울기·빠르기, 관절 회전·각속도, 주요 지점) + 다음 목표(같은 꼴, 차이)
        q = d.qpos; rq = qnorm(q[3:7]); hi = heading_inv(rq); rp = q[0:3]
        lv = qrot(hi, d.qvel[0:3]); av = qrot(hi, qrot(rq, d.qvel[3:6]))
        jq = self.jq(q); jv = d.qvel[self.da[:, None] + jp.arange(3)]
        kp = qrot(hi, self.keyp(d) - rp)
        t1 = jp.minimum(t + 1, self.ends[t])
        Rq = self.rq[t1]; Rrq = qnorm(Rq[3:7]); Rhi = heading_inv(Rrq)
        Rjq = self.jq(Rq); Rlv = qrot(Rhi, self.rv[t1][0:3]); Rav = qrot(Rhi, qrot(Rrq, self.rv[t1][3:6]))
        Rkp = qrot(Rhi, self.rk[t1] - Rq[0:3])
        off = jp.zeros(2) if off is None else off
        pe = jp.clip(qrot(hi, jp.array([Rq[0] + off[0] - rp[0], 0., Rq[2] + off[1] - rp[2]])), -2., 2.)   # 목표 자리까지(골반 가로, 몸 기준, 2m까지)
        return jp.concatenate([
            rp[1:2], tan6(qmul(hi, rq)), lv, av, tan6(jq).reshape(-1), jv.reshape(-1) * 0.1, kp.reshape(-1),
            Rq[1:2] - rp[1:2], tan6(qmul(hi, Rrq)), Rlv, Rav, tan6(Rjq).reshape(-1), (Rkp - kp).reshape(-1),
            tan6(qmul(qconj(jq), Rjq)).reshape(-1), pe[jp.array([0, 2])],
        ])

    def reset(self, rng):
        r1, r2, r3 = jax.random.split(rng, 3)
        t = self.valid[jax.random.randint(r1, (), 0, self.valid.shape[0])]
        # 30%는 멈춘 채로 시작한다(게임은 화면을 끊고 자리를 옮기면 목표 자세에 멈춘 채로 다시 세운다)
        v0 = jp.where(jax.random.uniform(r3) < ZERO_V, 0.0, 1.0) * self.rv[t]
        d = mjx.forward(self.mx, self.d0.replace(qpos=self.rq[t], qvel=v0))
        tg = self.jq(self.rq[t])
        z = jp.zeros(())
        # Brax의 자동 다시 시작은 몸 상태·관측만 처음 것으로 되돌리고 info는 그대로 둔다: 처음 프레임(t0)과 처음 목표(tgt0)를 따로 둔다
        return State(d, self._obs(d, t), z, z, {"r_pose": z, "r_kp": z, "r_root": z, "r_vel": z, "r_pos": z, "res": z},
                     {"t": t, "tgt": tg, "t0": t, "tgt0": tg, "rng": r2, "off": jp.zeros(2)})

    def step(self, state, action):
        d = state.pipeline_state
        start = state.info.get("steps", jp.int32(1)) == 0   # 새 판(처음이거나 방금 다시 시작했다): 몸은 처음 상태다
        t = jp.where(start, state.info["t0"], state.info["t"]); t1 = jp.minimum(t + 1, self.ends[t])
        action = jp.clip(action, -1, 1)
        a = action[:self.nj * 3].reshape(self.nj, 3) * SIG
        tgt = qmul(self.jq(self.rq[t1]), expq(a)); prev = jp.where(start, state.info["tgt0"], state.info["tgt"])
        off = jp.where(start, 0., state.info["off"])
        wff = rotvec(qmul(qconj(prev), tgt)) * FPS

        # 가끔 골반을 옆으로 민다(버티는 법을 배우게)
        rng, rp, rf = jax.random.split(state.info["rng"], 3)
        push = jax.random.uniform(rp) < PUSH_P
        f = jax.random.uniform(rf, (3,), minval=-1, maxval=1) * PUSH_F * jp.array([1., 0.3, 1.]) * push
        # 남는 힘: 행동의 마지막 3개(몸 기준 x, y, z) × RES × 몸무게. 세계로 돌려 골반에(이 판단 동안 그대로)
        fres = jp.zeros(3)
        if RES > 0:
            hi0 = heading_inv(qnorm(d.qpos[3:7])); fres = qrot(qconj(hi0), action[self.nj * 3:] * RES * self.Mg)
        xf = jp.zeros((self.mx.nbody, 6)).at[1, 0:3].set(f + fres)
        d = d.replace(xfrc_applied=xf)

        def sub(d, s):
            u = (s + 1.) / self.nsub
            tg = nlerp(prev, tgt, u)
            e = rotvec(qmul(qconj(self.jq(d.qpos)), tg))
            tau = self.kp[:, None] * e + self.kd[:, None] * wff
            n = jp.linalg.norm(tau, axis=-1, keepdims=True)
            tau = tau * jp.minimum(1., self.tm[:, None] / jp.maximum(n, 1e-6))
            qf = jp.zeros(self.mx.nv).at[self.da[:, None] + jp.arange(3)].set(tau)
            return mjx.step(self.mx, d.replace(qfrc_applied=qf)), None

        d, _ = jax.lax.scan(sub, d, jp.arange(self.nsub, dtype=jp.float32))
        d = self._fwd(d)
        q = d.qpos; rq = qnorm(q[3:7]); hi = heading_inv(rq); Rq = self.rq[t1]; Rrq = qnorm(Rq[3:7]); Rhi = heading_inv(Rrq)
        jq = self.jq(q); Rjq = self.jq(Rq)
        e_pose = jp.sum(rotvec(qmul(qconj(jq), Rjq)) ** 2)
        kp = qrot(hi, self.keyp(d) - q[0:3]); Rkp = qrot(Rhi, self.rk[t1] - Rq[0:3])
        e_kp = jp.sum((kp - Rkp) ** 2)
        e_h = (q[1] - Rq[1]) ** 2
        e_tilt = jp.sum(rotvec(qmul(qmul(hi, rq), qconj(qmul(Rhi, Rrq)))) ** 2)
        lv = qrot(hi, d.qvel[0:3]); Rlv = qrot(Rhi, self.rv[t1][0:3])
        e_v = (lv[0] - Rlv[0]) ** 2 + (lv[2] - Rlv[2]) ** 2
        e_p = (q[0] - Rq[0] - off[0]) ** 2 + (q[2] - Rq[2] - off[1]) ** 2   # BLEED=1이면 애니메이션 자리와의 거리 그대로
        r_pose = jp.exp(-1.0 * e_pose); r_kp = jp.exp(-10.0 * e_kp); r_root = jp.exp(-20 * e_h - 2 * e_tilt); r_v = jp.exp(-1.0 * e_v); r_p = jp.exp(-3.0 * e_p)
        reward = 0.4 * r_pose + 0.2 * r_kp + 0.15 * r_root + 0.1 * r_v + 0.15 * r_p
        res_u = jp.sum((action[self.nj * 3:] if RES > 0 else jp.zeros(3)) ** 2) / 3
        reward = reward - RES_W * res_u
        off = jp.array([q[0] - Rq[0], q[2] - Rq[2]]) * (1 - BLEED)   # 게임처럼: 물리 몸 쪽으로 옮겨 주고 조금 줄인다
        fell = (q[1] < 0.55) | (e_tilt > 0.8 ** 2) | (jp.sqrt(e_kp / 6) > 0.45) | (e_p > DRIFT ** 2) | ~jp.all(jp.isfinite(q))
        done = jp.where(fell | (t1 >= self.ends[t1]), 1., 0.)   # 판 길이는 Brax EpisodeWrapper가 센다(info["steps"])
        info = {**state.info, "t": t1, "tgt": tgt, "rng": rng, "off": off}
        d = d.replace(xfrc_applied=jp.zeros((self.mx.nbody, 6)))
        metrics = {**state.metrics, "r_pose": r_pose, "r_kp": r_kp, "r_root": r_root, "r_vel": r_v, "r_pos": r_p, "res": jp.sqrt(res_u)}
        obs = self._obs(d, t1, off)
        obs = obs + OBS_N * jax.random.normal(jax.random.fold_in(rng, 7), obs.shape)
        return state.replace(pipeline_state=d, obs=obs, reward=reward, done=done, metrics=metrics, info=info)
