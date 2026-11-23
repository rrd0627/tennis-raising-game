# PPO로 따라가기 제어기를 학습한다(Brax PPO, MuJoCo Warp). python train.py run_name ref.npz num_timesteps [num_envs] [restore.pkl]
import functools, json, os, pickle, sys, time
RUN, REF, STEPS = sys.argv[1], sys.argv[2], int(float(sys.argv[3]))
N = int(sys.argv[4]) if len(sys.argv) > 4 else 8192
RESTORE = sys.argv[5] if len(sys.argv) > 5 else None
os.environ["NACON"] = str(10 * N)
import jax, jax.numpy as jnp
# Brax 0.14.2가 JAX 0.12에서 없어진 함수를 쓴다: 같은 일을 하게 채운다(장치 하나)
def _dpr(x, devices):
    return jax.tree.map(lambda a: jax.device_put(jnp.stack([jnp.asarray(a)] * len(devices)), devices[0]), x)
jax.device_put_replicated = _dpr
from brax.training.agents.ppo import train as ppo
from brax.training.agents.ppo import networks as ppo_networks
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import TrackEnv

out = os.path.expanduser(f"~/tennis-rl/runs/{RUN}/"); os.makedirs(out, exist_ok=True)
env = TrackEnv(REF, impl="warp")
eval_env = TrackEnv(REF, impl="warp")
LAYERS = (512, 256, 128)
NOISE = float(os.environ.get("NOISE", 0.2)); ENT = float(os.environ.get("ENT", 0.0)); LR = float(os.environ.get("LR", 2e-4))
net = functools.partial(ppo_networks.make_ppo_networks, policy_hidden_layer_sizes=LAYERS, value_hidden_layer_sizes=(512, 256, 256), init_noise_std=NOISE)
log = open(out + "log.txt", "a"); t0 = time.time()


def progress(step, m):
    keys = ["eval/episode_reward", "eval/avg_episode_length", "eval/episode_r_pose", "eval/episode_r_kp", "eval/episode_r_root", "eval/episode_r_vel", "eval/episode_r_pos", "eval/episode_res"]
    line = f"{time.time() - t0:7.0f}s step {step:>10d} " + " ".join(f"{k.split('/')[-1]}={float(m[k]):.3f}" for k in keys if k in m)
    print(line, flush=True); log.write(line + "\n"); log.flush()


def save(step, make_policy, params):
    with open(out + "params_latest.pkl", "wb") as f: pickle.dump({"params": jax.device_get(params), "layers": LAYERS, "step": int(step), "obs": env.observation_size, "act": env.action_size}, f)


restore = None
if RESTORE:
    restore = pickle.load(open(RESTORE, "rb"))["params"]
    # 행동 수가 늘었으면(남는 힘 3개) 마지막 층을 넓힌다: 새 행동의 평균은 0, 크기는 예전 것의 평균
    pol = restore[1]["params"]; last = sorted(pol.keys(), key=lambda k: int(k.split("_")[1]))[-1]
    import numpy as np
    W = np.asarray(pol[last]["kernel"]); b = np.asarray(pol[last]["bias"]); old_a = W.shape[1] // 2; new_a = env.action_size
    if new_a > old_a:
        k = new_a - old_a
        W2 = np.concatenate([W[:, :old_a], np.zeros((W.shape[0], k)), W[:, old_a:], np.repeat(W[:, old_a:].mean(1, keepdims=True), k, 1)], 1)
        b2 = np.concatenate([b[:old_a], np.zeros(k), b[old_a:], np.full(k, b[old_a:].mean())])
        pol[last] = {"kernel": jnp.asarray(W2, jnp.float32), "bias": jnp.asarray(b2, jnp.float32)}
        print("widened", last, W.shape, "->", W2.shape, flush=True)
make_inference_fn, params, metrics = ppo.train(
    environment=env, eval_env=eval_env, num_timesteps=STEPS, num_envs=N, episode_length=300,
    learning_rate=LR, entropy_cost=ENT, discounting=0.95, unroll_length=20, batch_size=256, num_minibatches=32,
    num_updates_per_batch=4, normalize_observations=True, reward_scaling=1.0, clipping_epsilon=0.2, gae_lambda=0.95,
    max_grad_norm=1.0, network_factory=net, num_evals=max(2, STEPS // 5_000_000), num_resets_per_eval=1, num_eval_envs=256, deterministic_eval=True,
    progress_fn=progress, policy_params_fn=save, seed=0, restore_params=restore,
)
save(STEPS, None, params)
print("done", time.time() - t0, flush=True)
