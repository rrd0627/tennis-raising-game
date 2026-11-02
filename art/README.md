# 아트 넣는 법

그림 파일을 이 폴더에 넣고 `manifest.json`에 등록하면 임시 그림 대신 그 파일이 나옵니다. 등록하지 않은 것은 계속 임시 그림으로 나옵니다.

## manifest.json 형식

```json
{
  "chr": {
    "player": { "base": "art/chr/chr_player_base.png", "smile": "art/chr/chr_player_smile.png" },
    "coach":  { "base": "art/chr/chr_coach_base.png" }
  },
  "sd": {
    "player": { "image": "art/sd/sd_player.png", "json": "art/sd/sd_player.json" }
  }
}
```

### chr — 대화용 스탠딩 (정사각형 크롭, 원형으로 잘려 보임)

캐릭터 ID: `player`(주인공), `coach`, `boss`, `club`, 파트너 `hana` `sunhee` `sumin` `daeun` `jiwoo` `arah` `mikyung` `yujin`

표정 키 10개: `base` `smile` `joy` `surprise` `tense` `focus` `down` `angry` `tired` `cry`
없는 표정은 `base`로 대신 나옵니다.

### sd — 경기용 2D 캐릭터 (3D 코트 위에 세움)

스프라이트 시트 PNG + Aseprite JSON(해시 형식). 프레임 이름은 `동작_방향` 입니다.

- 방향: `back`(주인공 팀, 화면 아래쪽) / `front`(상대 팀, 화면 위쪽)
- 동작 8개(현재 엔진이 쓰는 것): `ready` `fh` `bh` `serve` `volley` `smash` `cheer` `sad`
- 예: `fh_back`, `serve_front`. 여러 프레임이면 `fh_back_0`처럼 붙여도 첫 프레임을 읽습니다.
- 기준점은 발 아래 중앙, 프레임 384×384 권장 (아트 명세서 3장)

캐릭터 ID: `player`, 파트너 ID들. 상대 선수는 지금 임시 그림 + 색 변형으로 나옵니다.

아트 명세서의 19개 동작 중 슬라이스·하프발리·스윙발리 등은 다음 단계에서 엔진의 샷 종류와 연결할 예정입니다.
