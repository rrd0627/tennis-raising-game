# 아트 넣는 법

그림은 Claude 문서 「테니스 선수 키우기 — 아트 에셋 요청서」(https://claude.ai/artifact/Nj3AA84HJhoFFKAPBxd8E1)대로 한 장에 하나씩 받습니다. UI(버튼, 카드, 게이지, 글자)는 코드로 만들므로 그림으로 받지 않습니다.

## 받은 그림 넣기

1. 받은 그림을 요청서의 파일 이름 그대로 `art/incoming/`에 넣습니다. 이 폴더는 저장소에 올라가지 않습니다.
2. 아래를 실행합니다. Python 3과 Pillow(`pip install pillow`)가 필요합니다.

```
python tools/art_import.py --check   # 무엇을 할지만 보기
python tools/art_import.py           # 정리하고 등록
```

스크립트가 하는 일은 다음과 같습니다.

- 배경이 투명하지 않으면 #FF00FF 단색이나, 가장자리에서 이어진 단색 배경을 지웁니다. 다 못 지웠으면 "주의"로 알려 줍니다.
- 전신은 768×768 칸에 발끝 높이를 맞춥니다. 원본 캔버스 높이를 기준으로 줄이므로 포즈끼리 크기가 같게 유지됩니다.
- 치는 동작을 나눈 포즈(`split` `turn…` `power…` `hit…` `follow…`)는 한 동작 안에서 차례로 바뀌므로 그림마다 키를 맞추지 않습니다. 같은 캐릭터·방향 묶음을 한 비율로 줄이고(묶음 키의 중앙값이 준비 자세 키와 같게), 발끝 높이와 머리 가운데만 맞춰 1152×768 칸에 둡니다. 그래서 이 포즈는 한 캐릭터 것을 한꺼번에 넣는 것이 좋습니다.
- 결과를 WebP로 저장하고 `manifest.json`에 등록합니다. 원본은 `art/incoming/done/`으로 옮깁니다.
- `art/SOURCES.md`에 날짜와 도구를 남깁니다.

등록하지 않은 그림은 계속 임시 그림으로 나옵니다.

## 파일 이름과 쓰이는 곳

| 받은 파일 | 저장 위치 | 게임에서 쓰이는 곳 |
| --- | --- | --- |
| `sd_{캐릭터}_{포즈}_front.png` | `art/sd/{캐릭터}/{포즈}_front.webp` | 주간 화면과 결과 화면의 전신(주인공, 파트너), 경기의 상대 선수 |
| `sd_{캐릭터}_{포즈}_back.png` | `art/sd/{캐릭터}/{포즈}_back.webp` | 경기 중계의 우리 팀 |
| `chr_{캐릭터}_{표정}.png` | `art/chr/{캐릭터}/{표정}.webp` | 대화와 메신저의 얼굴 (원으로 잘림) |
| `fairy_{표정}.png` | `art/fairy/{표정}.webp` | 주인공 옆 요정. 주인공이 기뻐하면 `joy`, 지치거나 아쉬우면 `worry`, 나머지는 `base` |
| `bg_{장소}.png` | `art/bg/{장소}.webp` | 장소 배경. `title`은 타이틀 화면 |
| `intro_{01~08}.png` | `art/intro/{번호}.webp` | 인트로 컷. 자막은 게임이 아래에 얹음 |

- 캐릭터 ID: `player`(주인공), `coach`, `boss`, `club`, 파트너 `hana` `sunhee` `sumin` `daeun` `jiwoo` `arah` `mikyung` `yujin`, 상대 선수 `oppa` `oppb`
- 포즈: 라켓을 든 `ready` `fh` `bh` `serve` `volley` `smash` `cheer` `sad`, 라켓 없이 `tired` `stretch` `relax`. 경기는 앞의 8개만 씁니다.
- 치는 동작을 나눈 포즈(받는 중, 「부분 동작 스프라이트 요청서」 https://claude.ai/artifact/7wvHUJRFD6YxpkuHd5bnan): `split` `turnfh` `turnbh`, 스탠스별 파워 포지션 `powerfhneutral` `powerfhsemi` `powerfhopen` `powerfhrun` `powerbhneutral` `powerbhopen` `powerbhrun`, `hitfh` `hitbh` `followfh` `followbh`, 한 손 슬라이스 `powerfhslicecross` `powerfhsliceneutral` `powerfhsliceopen` `powerfhslicerun` `powerbhslicecross` `powerbhsliceneutral` `powerbhsliceopen` `powerbhslicerun` `hitfhslice` `hitbhslice` `followfhslice` `followbhslice`, 서브 `servestance` `servetrophy` `servedrop` `servehit` `servefollow`, 발리(백핸드 한 손) `volleyprepfh` `volleyprepbh` `volleyhitfh` `volleyhitbh` `volleyfollowfh` `volleyfollowbh` `volleylowfh` `volleylowbh`, 스매시 `smashset` `smashhit` `smashfollow`. 이름에 밑줄을 쓰지 않습니다(가져오는 스크립트가 `sd_{캐릭터}_{포즈}_{방향}`으로 나눕니다). 드라이브 세트 14장은 `player`·`hana`(back), `oppa`·`oppb`(front)가 있습니다(2026-11-10). 없는 캐릭터는 경기에서 예전 포즈로 대신합니다.
- 표정: `base` `smile` `joy` `focus` `down` (코드에는 `surprise` `tense` `angry` `tired` `cry`도 있고, 없으면 `base`로 대신 나옵니다)
- 장소: `home` `court` `wall` `club` `room` `cafe` `venue` `office` `gym` `sea` `clinic` `title`
- 상대 선수(`oppa`, `oppb`)는 흰색·회색 옷으로 그려 두면 게임이 상대마다 옷 색을 입힙니다.
- 평상복·출근복 그림은 아직 없어서, 휴식이나 야근 장면에도 운동복 그림이 나옵니다.

## manifest.json 형식

`tools/art_import.py`가 채웁니다. 손으로 고칠 때는 아래 모양을 지킵니다.

```json
{
  "chr": { "player": { "base": "art/chr/player/base.webp", "smile": "art/chr/player/smile.webp" } },
  "sd": { "player": { "ready_front": "art/sd/player/ready_front.webp", "fh_back": "art/sd/player/fh_back.webp" } },
  "bg": { "court": "art/bg/court.webp", "title": "art/bg/title.webp" },
  "fairy": { "base": "art/fairy/base.webp", "joy": "art/fairy/joy.webp" },
  "intro": ["art/intro/01.webp", null, "art/intro/03.webp"]
}
```

경기 스프라이트는 예전처럼 시트 한 장(`"sd": { "player": { "image": "...png", "json": "...json" } }`, Aseprite 해시 JSON, 프레임 이름 `포즈_방향`)으로도 넣을 수 있습니다.
