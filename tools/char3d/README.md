# 3D 캐릭터 시험

게임에는 아직 없는 시험 화면이다. 3D 캐릭터로 바꿀지 정하려고 만들었다.

- `swing.html`: 캐릭터에 손으로 짠 포핸드를 입히고, 공 높이·거리에 맞춰 IK로 라켓 가운데를 공에 맞힌다. 확인 링크(`?check`)의 "8. 시험 중"에서 연다.
- `view.html`: glb(AI 3D)나 vrm(VRoid) 모델을 원본·툰·외곽선으로 보고 경기장에 세운다. `?glb=파일&mode=studio|stadium`
- `vroid_sample.vrm`: VRoid Studio로 만든 pixiv 공식 샘플(VRM1_Constraint_Twist_Sample, © 2022 pixiv Inc.). 모델 안의 라이선스: VRM 공개 라이선스 1.0, 재배포·수정·상업 이용 허용, 표기 필요 없음. 출처: https://github.com/pixiv/three-vrm
- `models/`: 이 컴퓨터에서만 쓰는 시험 모델(커밋하지 않음)
