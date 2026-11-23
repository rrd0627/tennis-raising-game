# 제어 한 번(물리 10걸음)을 학습 환경(MJX JAX / Warp)으로 돌려 결과를 저장한다. 게임 코드(Node)와 견준다
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("NACON", "64")
import jax, jax.numpy as jp
from mujoco import mjx
from env import TrackEnv, qnorm

ref = os.path.expanduser("~/tennis-rl/model/ref_c.npz")
out = sys.argv[1]
res = {}
for impl in [None, "warp"]:
    env = TrackEnv(ref, impl=impl)
    rng = np.random.default_rng(1); cases = []
    for t in [int(env.valid[1234]), int(env.valid[40000]), int(env.valid[90000])]:
        q = np.array(env.rq[t]); v = np.array(env.rv[t])
        d = mjx.forward(env.mx, env.d0.replace(qpos=jp.array(q), qvel=jp.array(v)))
        a = rng.uniform(-0.5, 0.5, env.action_size).astype(np.float32)
        tg0 = env.jq(env.rq[t])
        st = env.reset(jax.random.PRNGKey(0)).replace(pipeline_state=d)
        st.info.update(t=jp.int32(t), tgt=tg0)
        s2 = jax.jit(env.step)(st, jp.array(a))
        t1 = min(t + 1, int(env.ends[t])); Rq = np.array(env.rq[t1])
        cases.append({"qpos": q.tolist(), "qvel": v.tolist(), "a": a.tolist(), "prev": np.array(tg0).reshape(-1).tolist(),
                      "T": {"p": Rq[0:3].tolist(), "q": Rq[3:7].tolist(), "j": np.concatenate([Rq[int(j):int(j) + 4] for j in env.qa]).tolist()},
                      "qpos1": np.array(s2.pipeline_state.qpos).tolist(), "qvel1": np.array(s2.pipeline_state.qvel).tolist()})
    res[impl or "jax"] = cases
json.dump(res, open(out, "w"))
for k in ["jax", "warp"]:
    print(k, [round(float(np.abs(np.array(c["qpos1"]) - np.array(c["qpos"])).max()), 3) for c in res[k]])
print("jax vs warp qpos1 max diff", [round(float(np.abs(np.array(a["qpos1"]) - np.array(b["qpos1"])).max()), 4) for a, b in zip(res["jax"], res["warp"])])
