# 학습한 제어기 무게를 게임(js/phys3d.js Policy)이 읽는 JSON으로. python export.py params.pkl out.json [check.json]
# check.json을 주면 관측·행동 맞춰 보기용 예시도 만든다(같은 상태에서 학습 환경의 관측과 제어기 출력)
import base64, json, pickle, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

src, out = sys.argv[1], sys.argv[2]
d = pickle.load(open(src, "rb"))
norm, pol = d["params"][0], d["params"][1]["params"]
b64 = lambda a: base64.b64encode(np.asarray(a, np.float32).tobytes()).decode()
act = d["act"]
names = sorted(pol.keys(), key=lambda k: int(k.split("_")[1]))
layers = []
for k, n in enumerate(names):
    W = np.asarray(pol[n]["kernel"]); b = np.asarray(pol[n]["bias"])
    if k == len(names) - 1:
        W = W[:, :act]; b = b[:act]   # 마지막 층: 평균(loc)만. 행동 = tanh(loc)
    layers.append({"in": int(W.shape[0]), "out": int(W.shape[1]), "w": b64(W), "b": b64(b)})
J = {"obs": int(d["obs"]), "act": int(act), "step": int(d["step"]), "mean": b64(norm.mean), "std": b64(norm.std), "layers": layers}
json.dump(J, open(out, "w"))
print("saved", out, "layers", [(l["in"], l["out"]) for l in layers], "step", d["step"])

if len(sys.argv) > 3:
    import jax, jax.numpy as jp
    from mujoco import mjx
    from env import TrackEnv
    ref = os.environ.get("REF", os.path.expanduser("~/tennis-rl/model/ref_b.npz"))
    env = TrackEnv(ref)
    rng = np.random.default_rng(0); cases = []
    for t in [int(env.valid[1234]), int(env.valid[40000]), int(env.valid[90000])]:
        q = np.array(env.rq[t]); v = np.array(env.rv[t])
        q[0:3] += rng.normal(0, 0.02, 3)
        for j in list(env.qa) + [3]:
            j = int(j); q[j:j + 4] += rng.normal(0, 0.03, 4); q[j:j + 4] /= np.linalg.norm(q[j:j + 4])
        v += rng.normal(0, 0.2, v.shape)
        dd = mjx.forward(env.mx, env.d0.replace(qpos=jp.array(q), qvel=jp.array(v)))
        obs = np.array(env._obs(dd, jp.int32(t)))
        t1 = min(t + 1, int(env.ends[t])); Rq = np.array(env.rq[t1]); Rv = np.array(env.rv[t1])
        x = (obs - np.asarray(norm.mean)) / np.asarray(norm.std)
        for k, n in enumerate(names):
            W = np.asarray(pol[n]["kernel"]); b = np.asarray(pol[n]["bias"]); x = x @ W + b
            if k < len(names) - 1: x = x / (1 + np.exp(-x))
        a = np.tanh(x[:act])
        cases.append({"qpos": q.tolist(), "qvel": v.tolist(), "R": {"p": Rq[0:3].tolist(), "q": Rq[3:7].tolist(), "j": np.concatenate([Rq[int(j):int(j) + 4] for j in env.qa]).tolist(), "lv": Rv[0:3].tolist(), "av": Rv[3:6].tolist()}, "obs": obs.tolist(), "act": a.tolist()})
    json.dump(cases, open(sys.argv[3], "w"))
    print("check cases", len(cases))
