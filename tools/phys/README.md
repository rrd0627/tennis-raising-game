# 3D 선수 물리 몸 제어기 학습(2단계)

3D 선수의 물리 몸(`js/phys3d.js`)이 애니메이션(목표 자세)을 따라가며 스스로 균형을 잡게 하는 작은 신경망을 학습한다(DReCon·DeepMimic 방식).
학습은 이 PC의 WSL 우분투에서 GPU(MuJoCo Warp + Brax PPO)로 하고, 게임은 같은 MuJoCo(웹어셈블리)로 같은 몸·같은 관절 근육을 돌린다.

## 준비(한 번)

WSL 우분투에 따로 둔 파이썬 환경(`~/tennis-rl/venv`, 비밀번호 없이):

```
mkdir -p ~/tennis-rl && cd ~/tennis-rl
python3 -m venv --without-pip venv && curl -sSfL https://bootstrap.pypa.io/get-pip.py -o get-pip.py && venv/bin/python get-pip.py
venv/bin/pip install "jax[cuda12]" mujoco mujoco-mjx brax warp-lang mujoco-warp
```

Windows 쪽 Node 도구(`export.mjs`, `obscheck.mjs`)는 이 폴더에서 `npm i @mujoco/mujoco@4.0.1`.

## 순서

1. 몸 모델 내보내기: `node export.mjs ~/tennis-rl/model` → `model.xml`(몸), `ctrl.json`(관절 근육 세기). 게임과 같은 코드(`js/phys3d.js`)로 만든다. `spec.json`은 3D 모델의 처음 뼈 자리(게임에서 `restSpec`).
2. 참고 동작 녹화: 개발 서버를 띄우고 `SEED=1 node rec_ref.mjs http://localhost:8080/ refs/r1.json 120`(확인 링크 '승부처' 경기를 가상 시계로, 물리는 끈 채 애니메이션 자세만). 씨앗마다 다른 경기.
3. 학습 자료: `venv/bin/python data.py refs/ model/ref.npz`(선수마다 이어진 조각, 30Hz qpos·qvel·주요 지점).
4. 학습: `NOISE=0.2 ENT=0 LR=2e-4 venv/bin/python train.py 이름 model/ref.npz 100e6 8192 [이어 할.pkl]` → `runs/이름/params_latest.pkl`, `log.txt`. 환경 값은 환경 변수로(`RES` 남는 힘 최대(몸무게 비, 0이면 없음), `RES_W` 그 벌점, `DRIFT` 애니메이션 자리에서 벌어지면 끝낼 거리, `ZERO_V`·`PUSH_P`·`PUSH_F`·`OBS_N` 견고함). 행동 수가 늘면(남는 힘) 이어 할 무게의 마지막 층을 넓힌다.
5. 게임용으로: `venv/bin/python export.py runs/이름/params_latest.pkl policy.json check.json` → `art/char3d/policy.json`.
6. 맞춰 보기: `node obscheck.mjs policy.json check.json`(게임의 관측·제어기 출력이 학습과 같은지, 차이 1e-5 안). 한 판단(물리 10걸음)이 같은지: `stepcheck.py` → `stepcheck.mjs`.
7. 녹화한 경기로 게임 코드를 돌려 보기: `node polreplay.mjs refs/r38.json pol bleed`(넘어짐, 애니메이션 자리와의 거리).

## 겪은 것

- Brax의 자동 다시 시작은 몸 상태·관측만 처음 것으로 되돌리고 info(참고 프레임 번호)는 그대로 둔다: 처음 프레임(`t0`, `tgt0`)을 따로 두고 판이 막 시작했으면(`info['steps'] == 0`) 거기서 이어 간다. 이걸 몰라 학습이 거꾸로 갔다.
- 바닥 접촉 수(`naconmax`)는 MuJoCo Warp에서 모든 환경을 합친 수다(환경 수 × 10).
- Brax 0.14.2는 JAX 0.12에서 없어진 `jax.device_put_replicated`를 쓴다(`train.py`에서 채운다).
- 위치 보상을 물리 몸 쪽으로 옮긴 목표 기준으로 재면(게임에서 옮겨 주는 몫이 94%일 때) 1m 벌어져도 6cm로 보여 따라잡지 않았다: 애니메이션 자리 그대로와의 거리로 잰다.

## 같아야 하는 것

- 물리 한 걸음 1/300초, 제어 30Hz(10걸음마다), 접촉 풀이 반복 4·8, 바닥과 부딪는 것은 발만(`PHYS`).
- 관절 근육: 볼 관절 PD(용수철 직접 + 목표 각속도, 감쇠는 관절 damping), 세기와 상한은 `ctrl.json`.
- 행동: 관절마다 목표 회전에 곱하는 회전(축·각 × 0.5rad) + 남는 힘 3개(골반, 몸 기준, × `res` × 몸무게). 관측: `env.py`의 `_obs`와 `phys3d.js`의 `obsOf`(463개: 몸 상태, 다음 목표, 애니메이션 자리까지 거리).
