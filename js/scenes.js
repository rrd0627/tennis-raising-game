// 매주 일어나는 작은 장면. 숫자 대신 사건으로 성장과 관계의 변화를 느끼게 한다.
// who: 말하는 사람(me는 주인공). tier: 0 입문, 1 중급, 2 고급 (관련 능력치 30·55 기준).
// week: 그 주에 먼저 나오는 고정 장면. withFace: 파트너와 같이 한 주에만 나오고 {p}에 이름이 들어간다.
export const SCENES = [
  // ── 첫 달 고정 장면 ──
  { week: 1, act: 'lesson', who: 'coach', text: '코치: "오늘은 포핸드만 100개요." 공이 펜스 너머로 날아갔다.' },
  { week: 5, act: 'lesson', who: 'coach', text: '코치: "토스가 왜 뒤로 가요?" 공이 머리 위로 떨어졌다.' },

  // ── 레슨: 스트로크 ──
  { act: 'lesson', topic: 'stroke', tier: 0, who: 'coach', text: '코치: "손목 쓰지 말라니까요." 오늘만 열 번째 듣는 말이다.' },
  { act: 'lesson', topic: 'stroke', tier: 0, who: 'me', text: '포핸드가 네트를 넘어가기 시작했다. 어디로 갈지는 아직 공만 안다.' },
  { act: 'lesson', topic: 'stroke', tier: 0, who: 'me', text: '공을 보라는데 자꾸 옆 코트 고수가 보인다.' },
  { act: 'lesson', topic: 'stroke', tier: 1, who: 'me', text: '크로스로 보낸 공이 정말 크로스로 갔다. 코치가 고개를 끄덕였다.' },
  { act: 'lesson', topic: 'stroke', tier: 1, who: 'coach', text: '코치: "이제 세게 말고 깊게 쳐 봐요." 깊게가 더 어렵다.' },
  { act: 'lesson', topic: 'stroke', tier: 2, who: 'coach', text: '코치가 공 바구니를 내려놓았다. "오늘은 저랑 랠리 해요."' },
  { act: 'lesson', topic: 'stroke', tier: 2, who: 'me', text: '공 맞는 소리가 달라졌다. 옆 코트가 돌아봤다.' },
  // ── 레슨: 네트 ──
  { act: 'lesson', topic: 'net', tier: 0, who: 'me', text: '발리를 하라는데 공이 얼굴로 왔다. 일단 피했다.' },
  { act: 'lesson', topic: 'net', tier: 0, who: 'coach', text: '코치: "발리는 치는 게 아니라 대는 거예요." 무슨 말인지 모르겠다.' },
  { act: 'lesson', topic: 'net', tier: 1, who: 'me', text: '네트 앞에 서도 이제 덜 무섭다. 조금만.' },
  { act: 'lesson', topic: 'net', tier: 1, who: 'coach', text: '코치: "앞으로 한 발 더요." 한 발이 이렇게 멀 줄 몰랐다.' },
  { act: 'lesson', topic: 'net', tier: 2, who: 'me', text: '포치 타이밍이 보이기 시작했다. 상대 표정이 굳는 게 보인다.' },
  // ── 레슨: 서브·리턴 ──
  { act: 'lesson', topic: 'serve', tier: 0, who: 'me', text: '더블폴트 열 개째. 코치가 말없이 공을 더 가져왔다.' },
  { act: 'lesson', topic: 'serve', tier: 0, who: 'coach', text: '코치: "서브는 던지는 거예요." 라켓을 던질 뻔했다.' },
  { act: 'lesson', topic: 'serve', tier: 1, who: 'me', text: '세컨 서브가 들어가기 시작했다. 세상이 달라 보인다.' },
  { act: 'lesson', topic: 'serve', tier: 1, who: 'me', text: '리턴이 상대 발밑에 떨어졌다. 의도한 건 아니다.' },
  { act: 'lesson', topic: 'serve', tier: 2, who: 'me', text: '퍼스트 서브 소리가 달라졌다. 오늘은 코치도 못 받았다.' },
  // ── 레슨: 체력 ──
  { act: 'lesson', topic: 'physical', tier: 0, who: 'coach', text: '코치: "가볍게 스텝만 10분요." 10분 뒤 벤치에 누워 있었다.' },
  { act: 'lesson', topic: 'physical', tier: 0, who: 'me', text: '다음 날 회사 계단을 옆으로 내려왔다.' },
  { act: 'lesson', topic: 'physical', tier: 1, who: 'me', text: '회사 계단을 뛰어 올라갔다. 동료들이 놀랐다.' },
  { act: 'lesson', topic: 'physical', tier: 2, who: 'me', text: '타이브레이크까지 가도 다리가 남는다.' },
  // ── 레슨: 멘탈·전술 ──
  { act: 'lesson', topic: 'mental', tier: 0, who: 'coach', text: '코치: "실수하면 스트링 한 번 보고 다시 서요."' },
  { act: 'lesson', topic: 'mental', tier: 0, who: 'me', text: '내 경기 영상을 봤다. 표정이 제일 문제였다.' },
  { act: 'lesson', topic: 'mental', tier: 1, who: 'coach', text: '코치: "상대 전위가 어디 보는지 봐요." 눈이 두 개 더 필요하다.' },
  { act: 'lesson', topic: 'mental', tier: 1, who: 'me', text: '더블폴트 뒤에 심호흡을 했다. 다음 서브가 들어갔다.' },
  { act: 'lesson', topic: 'mental', tier: 2, who: 'me', text: '브레이크 포인트인데 손이 떨리지 않았다.' },
  // ── 레슨: 대처 ──
  { act: 'lesson', topic: 'counter', who: 'coach', text: '코치가 {topic} 공만 골라서 보내 줬다. 마지막엔 네트를 넘겼다.' },
  { act: 'lesson', topic: 'counter', who: 'me', text: '{topic}. 오늘은 열 개 중 네 개를 받아냈다. 지난번엔 하나였다.' },
  { act: 'lesson', topic: 'counter', who: 'coach', text: '코치: "{topic}, 이제 눈에 보이죠?" 조금 보이는 것 같다.' },

  // ── 벽치기 ──
  { act: 'practice', who: 'me', text: '벽은 실수해도 아무 말이 없다. 그래서 좋다.' },
  { act: 'practice', who: 'me', text: '벽치기를 하는데 경비 아저씨가 "오늘도 왔네" 하신다.' },
  { act: 'practice', who: 'me', text: '퇴근하고 혼자 공 200개. 손에 물집이 잡혔다.' },
  { act: 'practice', who: 'me', text: '지난 레슨을 떠올리며 스윙했다. 거울 속 자세가 코치와 다르다.' },
  { act: 'practice', withFace: true, who: 'partner', text: '{p}: "벽이랑 싸우는 거야?" 같이 랠리를 했다.' },
  { act: 'practice', withFace: true, who: 'partner', text: '{p}도 와 있었다. 같이 공을 치다 보니 어두워졌다.' },

  // ── 헬스 ──
  { act: 'gym', who: 'me', text: '스쿼트 스무 개. 트레이너: "이제 몸 풀렸죠?"' },
  { act: 'gym', who: 'me', text: '옆 사람이 자꾸 내 라켓 가방을 본다. 헬스장에 왜 라켓을 가져왔냐는 눈이다.' },
  { act: 'gym', who: 'me', text: '어깨 운동을 했더니 다음 날 머리 감기가 어렵다.' },
  { act: 'gym', who: 'me', text: '거울 속 종아리가 조금 달라 보인다. 기분 탓일 수도 있다.' },
  { act: 'gym', withFace: true, who: 'partner', text: '{p}: "한 세트만 더 하고 가자." 세 세트를 더 했다.' },
  { act: 'gym', withFace: true, who: 'partner', text: '{p}가 내 무게를 보더니 말없이 원판을 하나 뺐다.' },

  // ── 홈트 ──
  { act: 'home', who: 'me', text: '영상 속 선생님이 "쉬워요"라고 한다. 거짓말이다.' },
  { act: 'home', who: 'me', text: '매트 까는 데 10분, 운동 10분, 눕는 데 한 시간.' },
  { act: 'home', who: 'me', text: '자기 전 스트레칭. 어제보다 손끝이 조금 더 내려갔다.' },
  { act: 'home', who: 'me', text: '아랫집이 걱정돼 점프 대신 제자리걸음을 했다.' },

  // ── 클럽 게임 ──
  { act: 'club', tier: 0, who: 'me', text: '내가 친 공이 전부 상대 전위에게 갔다. 파트너가 웃었다.' },
  { act: 'club', tier: 0, who: 'me', text: '점수를 못 세서 세 번 물어봤다.' },
  { act: 'club', tier: 0, who: 'me', text: '게임 끝나고 공을 제일 열심히 주웠다. 초보의 미덕이다.' },
  { act: 'club', tier: 1, who: 'me', text: '"나이스!" 소리를 처음 들었다. 별것 아닌데 좋다.' },
  { act: 'club', tier: 1, who: 'me', text: '고수 언니의 로브에 농락당했다. 다음엔 안 당한다.' },
  { act: 'club', tier: 2, who: 'me', text: '초보 회원이 그립을 물어봤다. 내가 그걸 설명하고 있다니.' },
  { act: 'club', tier: 2, who: 'me', text: '정모 끝나고 뒤풀이. 오늘 내 경기가 안주가 되었다.' },
  { act: 'club', withFace: true, who: 'partner', text: '{p}: "방금 그 로브 뭐야?" 둘이 한참 웃었다.' },
  { act: 'club', withFace: true, who: 'partner', text: '{p}: "오늘 우리 좀 맞는 것 같지 않아?"' },

  // ── 쉬는 주. sleep은 휴식 결과(REST_RESULTS)의 id ──
  { act: 'rest', sleep: 'poor', who: 'me', text: '누웠는데 오늘 네트에 꽂은 서브가 자꾸 떠오른다. 세 시가 넘었다.' },
  { act: 'rest', sleep: 'poor', who: 'me', text: '내일 회의 생각에 잠이 안 왔다. 결국 라켓 줄 텐션을 검색했다.' },
  { act: 'rest', sleep: 'poor', who: 'me', text: '경기 영상 하나만 더 보고 자려다 해가 떴다.' },
  { act: 'rest', sleep: 'fine', who: 'me', text: '소파와 한 몸이 되었다. 손목이 쉬는 게 느껴진다.' },
  { act: 'rest', sleep: 'fine', who: 'me', text: '테니스 영상을 보다 잠들었다. 깨 보니 세 시간이 지났다.' },
  { act: 'rest', sleep: 'fine', who: 'me', text: '늦잠을 자고 밥을 먹었다. 오늘 한 일은 그게 전부다.' },
  { act: 'rest', sleep: 'deep', who: 'me', text: '하루 종일 잤다. 꿈에서도 공을 쳤다.' },
  { act: 'rest', sleep: 'deep', who: 'me', text: '알람 없이 눈을 떴다. 어깨가 새것 같다.' },
  { act: 'rest', sleep: 'deep', who: 'me', text: '열두 시간을 잤다. 오늘은 서브도 들어갈 것 같다.' },
  { act: 'family', outing: 'home', who: 'me', text: '엄마: "너 요즘 왜 이렇게 탔니?"' },
  { act: 'family', outing: 'play', who: 'me', text: '친구들: "너 요즘 테니스 얘기만 해." 맞는 말이다.' },
  { act: 'family', outing: 'play', who: 'me', text: '오랜만에 친구를 만났다. 세 시간 중 두 시간을 테니스 얘기를 했다.' },
  { act: 'family', outing: 'home', who: 'me', text: '조카가 라켓을 보고 "배드민턴?"이라고 했다. 참았다.' },
  { act: 'family', outing: 'trip', who: 'me', text: '바다를 봤다. 어제 놓친 공이 아무 일도 아닌 것 같았다.' },
  { act: 'family', outing: 'trip', who: 'me', text: '기차 창밖만 봤다. 머릿속이 조금씩 비워진다.' },
  { act: 'family', outing: 'trip', who: 'me', text: '숙소에서 늦잠을 잤다. 서브도 포핸드도 상관없는 곳이다.' },
  { act: 'family', outing: 'play', who: 'me', text: '노래방에서 목이 나갔다. 오늘 실수한 공은 벌써 생각이 안 난다.' },
  { act: 'clinic', who: 'me', text: '의사: "쉬라고 했잖아요." 세 번째 듣는 말이다.' },
  { act: 'clinic', who: 'me', text: '물리치료 기계가 지잉 돌아간다. 옆 침대 아저씨도 테니스 엘보란다.' },
  { act: 'clinic', who: 'me', text: '의사: "운동 언제까지 하실 거예요?" 대답을 못 했다.' },
  { act: 'overtime', who: 'boss', text: '팀장: "오늘 좀 남지?" 라켓 가방이 책상 밑에서 울고 있다.' },
  { act: 'overtime', who: 'me', text: '야근 중에 손목 스냅을 연습했다. 옆자리에서 쳐다봤다.' },
];

// 결과 화면의 첫 단계: 무슨 상황인지 알려 주는 설명. {topic}은 오늘 배우는 것.
export const DESC_LINES = {
  first: ['레슨 첫날이다. 코치가 라켓을 쥐여 주었다.'],
  lesson: [
    '퇴근하고 바로 코트로 갔다. 오늘 레슨은 {topic}.',
    '코치가 벌써 공 바구니를 꺼내 놓았다. 오늘은 {topic}.',
    '점심시간부터 손목을 풀었다. 저녁에 {topic} 레슨이 있다.',
    '회사에서 나오는 발걸음이 빠르다. 오늘 배울 건 {topic}.',
  ],
  practice: [
    '아무도 없는 연습벽 앞에 섰다.',
    '지난번에 배운 걸 잊기 전에 쳐 두기로 했다.',
    '퇴근길에 라켓을 챙겨 연습장으로 돌아갔다.',
  ],
  gym: [
    '퇴근하고 회사 앞 헬스장으로 갔다.',
    '오늘은 코트 대신 헬스장이다.',
    '운동화 끈을 묶었다. 오늘은 하체 날이다.',
  ],
  home: [
    '집에 오자마자 매트를 깔았다.',
    '코트 갈 시간은 없어도 매트 깔 시간은 있다.',
    '영상 하나를 틀어 놓고 따라 해 보기로 했다.',
  ],
  club: [
    '클럽 코트에 사람이 많다. 오늘은 복식 세 게임.',
    '정모 날이다. 명단에 내 이름도 있다.',
    '조명이 켜진 코트에 공 소리가 울린다.',
  ],
  rest: [
    '오늘은 아무것도 안 하기로 했다.',
    '라켓 가방을 현관에 두고 들어왔다.',
    '이번 주말은 쉰다. 정말 쉰다.',
  ],
  family: [
    '오랜만에 본가에 갔다.',
    '친구들과 저녁 약속이 있다.',
    '단체방이 시끄럽다. 오늘 다 같이 보자고 한다.',
  ],
  clinic: [
    '점심시간에 정형외과에 들렀다.',
    '접수를 하고 앉았다. 대기실에 나 같은 사람이 많다.',
  ],
  overtime: [
    '퇴근 시간이 지났는데 아무도 일어나지 않는다.',
    '마감이 내일이다. 라켓 가방은 사물함에 있다.',
  ],
};
// 쉬는 날 행선지별 설명
export const DESC_OUTING = {
  trip: ['갑자기 표를 끊었다. 라켓은 집에 두고 왔다.', '이번 주말은 멀리 간다. 코트가 없는 곳으로.'],
  play: ['친구들과 저녁 약속이 있다.', '단체방이 시끄럽다. 오늘 다 같이 보자고 한다.'],
  home: ['오랜만에 본가에 갔다.', '엄마가 밥 먹으러 오라고 했다.'],
};
// 코트에서 연습한 대로 나왔는지. 기분이 여기서 오르내린다.
export const FEEL_LINES = {
  lesson: {
    good: ['지난번에 연습한 대로 공이 갔다. 코치가 고개를 끄덕였다.', '오늘은 되는 날이다. 어? 나 이제 좀 되나?'],
    bad: ['지난주엔 됐던 게 오늘은 왜 안 될까. 코치가 같은 말을 또 했다.', '연습한 게 하나도 안 나온다. 왜 이렇게 어려울까.'],
  },
  practice: {
    good: ['어제 연습한 스윙이 오늘도 나온다. 벽이 오늘은 내 편이다.', '공이 연달아 같은 자리에 맞았다. 나 이제 좀 되는지도?'],
    bad: ['어제는 되던 스윙이 오늘은 어디로 갔을까.', '벽한테도 지는 날이 있다. 왜 이렇게 어렵지.'],
  },
  club: {
    good: ['연습한 대로 나왔다! 파트너: "언제 이렇게 늘었어요?"', '레슨 때 배운 공이 게임에서 나왔다. 손끝이 짜릿하다.'],
    bad: ['연습 땐 됐는데 게임만 하면 안 나온다. 왜 이렇게 어려울까.', '배운 걸 써 보려다 공이 전부 네트에 걸렸다.'],
  },
};
// 무리해서 실패했을 때. 큰 글자와 글.
export const FAIL_WORD = { flop: '제대로 안 됐다', doubt: '멘탈이 흔들린다', yips: '입스가 왔다', injury: '다쳤다' };
export const FAIL_LINES = {
  flop: ['몸이 무거워 공을 쫓아가지도 못했다. 오늘 운동은 운동이 아니었다.', '발이 안 움직인다. 왔다 갔다만 하다 끝났다.'],
  doubt: ['쉬운 공을 연달아 놓쳤다. 머릿속이 복잡해졌다.', '몸이 지치니 마음까지 흔들린다. 라켓을 쥔 손에 힘이 안 들어간다.'],
  yips: ['토스가 갑자기 손에서 안 떨어진다. 어떻게 쳤는지 기억이 안 난다.', '세컨 서브 앞에서 팔이 굳었다. 머리가 하얘졌다.'],
  injury: ['"억" 소리가 먼저 나왔다. 오늘은 여기까지다.', '무리하지 말걸. 몸이 먼저 신호를 보냈다.'],
};
// 계절 설명. 테니스 행동일 때 같은 자리에 섞여 나온다.
export const DESC_SEASON = {
  봄: ['벚꽃이 코트 위로 날아든다. 공이 꽃잎에 묻힌다.'],
  여름: ['해가 졌는데도 코트가 뜨겁다. 물병이 금방 비었다.'],
  가을: ['바람이 시원해졌다. 공이 잘 보이는 계절이다.'],
  겨울: ['손이 시려 그립이 잘 안 잡힌다. 입김이 먼저 네트를 넘는다.'],
};

// 가끔 끼어드는 선택. 고를 때는 효과를 보여 주지 않는다. 결과 단계에서 드러난다.
// fx: fatigue·stress·confidence·coach·club·work 증감, grow(이번 행동 성장에 더하는 비율), aff·combo(같이 한 파트너).
export const CHOICE_SCENES = [
  // ── 레슨 ──
  { id: 'more_basket', act: 'lesson', who: 'coach', prompt: '코치: "오늘 컨디션 괜찮네요. 한 바구니 더 할까요?"', options: [
    { label: '네, 더 할게요', who: 'coach', reply: '코치: "좋아요." 손바닥이 먼저 항복했다.', fx: { grow: 0.3, fatigue: 5 } },
    { label: '오늘은 여기까지요', who: 'coach', reply: '코치: "쉬는 것도 실력이에요." 마음이 좀 놓였다.', fx: { stress: -4, fatigue: -3 } },
  ] },
  { id: 'why_wrong', act: 'lesson', who: 'coach', prompt: '코치: "방금 왜 실수한 것 같아요?"', options: [
    { label: '공을 늦게 봤어요', who: 'coach', reply: '코치: "오, 봤어요? 그럼 반은 고친 거예요."', fx: { grow: 0.15, coach: 2 } },
    { label: '모르겠어요', who: 'coach', reply: '코치가 영상을 찍어 줬다. 내 자세가 낯설다.', fx: { coach: 1, stress: -2 } },
  ] },
  { id: 'copy_pro', act: 'lesson', who: 'me', prompt: '옆 코트 고수의 스윙이 자꾸 눈에 들어온다.', options: [
    { label: '조금 따라 해 본다', who: 'me', reply: '따라 했더니 공이 옆 코트로 갔다. 고수가 주워 줬다.', fx: { grow: 0.1, stress: 2 } },
    { label: '내 공에 집중한다', who: 'coach', reply: '코치: "그래요, 지금은 내 공만 봐요."', fx: { coach: 2, confidence: 2 } },
  ] },
  { id: 'new_grip', act: 'lesson', who: 'coach', prompt: '코치: "그립 바꿔 볼래요? 처음엔 더 안 맞을 거예요."', options: [
    { label: '바꿔 볼게요', who: 'me', reply: '정말 더 안 맞았다. 그런데 소리가 조금 달라졌다.', fx: { grow: 0.25, stress: 3 } },
    { label: '아직은 이대로요', who: 'coach', reply: '코치: "알겠어요. 나중에 다시 얘기해요."', fx: { stress: -3 } },
  ] },
  { id: 'late', act: 'lesson', who: 'coach', prompt: '회사 일로 10분 늦었다. 코치가 시계를 본다.', options: [
    { label: '죄송해요, 끝까지 할게요', who: 'coach', reply: '코치: "그럼 10분 더 하죠." 괜히 말했다.', fx: { fatigue: 4, coach: 2 } },
    { label: '오늘 좀 피곤해요', who: 'coach', reply: '코치: "그럼 오늘은 가볍게 해요."', fx: { fatigue: -3, coach: -1 } },
  ] },
  // ── 벽치기 ──
  { id: 'one_more', act: 'practice', who: 'me', prompt: '어두워지기 시작했다. 공은 아직 남았다.', options: [
    { label: '한 바구니만 더', who: 'me', reply: '마지막 공이 제일 잘 맞았다. 꼭 그렇다.', fx: { grow: 0.3, fatigue: 4 } },
    { label: '오늘은 끝', who: 'me', reply: '공을 줍다 보니 별이 떴다. 오늘은 여기까지.', fx: { stress: -3 } },
  ] },
  { id: 'guard', act: 'practice', who: 'me', prompt: '경비 아저씨: "매일 오네. 대회 나가?"', options: [
    { label: '네, 곧 나가요', who: 'me', reply: '말하고 나니 진짜 나가야 할 것 같다.', fx: { confidence: 3, stress: 2 } },
    { label: '그냥 취미예요', who: 'me', reply: '경비 아저씨: "취미가 제일 무서워." 웃으며 가셨다.', fx: { stress: -3 } },
  ] },
  { id: 'kid', act: 'practice', who: 'me', prompt: '꼬마: "이모, 왜 벽이랑 쳐요?"', options: [
    { label: '벽이 제일 잘 받아 줘', who: 'me', reply: '꼬마가 고개를 끄덕였다. 이해한 것 같지는 않다.', fx: { stress: -3 } },
    { label: '이모 아니고 언니야', who: 'me', reply: '꼬마: "네, 이모." 공이 더 세게 나갔다.', fx: { grow: 0.15, stress: 1 } },
  ] },
  { id: 'rally_count', act: 'practice', withFace: true, who: 'partner', prompt: '{p}: "오늘 랠리 몇 번까지 갈까?"', options: [
    { label: '스무 번', who: 'partner', reply: '열두 번에서 끊겼다. {p}가 먼저 웃었다.', fx: { aff: 3 } },
    { label: '일단 열 번', who: 'partner', reply: '딱 열 번에서 끊겼다. 왜 딱 거기서.', fx: { aff: 2, stress: -1 } },
  ] },
  // ── 헬스 ──
  { id: 'last_set', act: 'gym', who: 'me', prompt: '마지막 세트가 남았다. 팔이 벌써 떨린다.', options: [
    { label: '끝까지 한다', who: 'me', reply: '다음 날 라켓이 무거웠다. 그래도 뿌듯하다.', fx: { grow: 0.25, fatigue: 4 } },
    { label: '오늘은 여기까지', who: 'me', reply: '샤워하고 나오니 몸이 가볍다.', fx: { stress: -3 } },
  ] },
  // ── 홈트 ──
  { id: 'sofa', act: 'home', who: 'me', prompt: '매트 바로 옆에 소파가 있다. 소파가 부른다.', options: [
    { label: '영상 끝까지 따라 한다', who: 'me', reply: '끝까지 했다. 혼자 박수를 쳤다.', fx: { grow: 0.3, fatigue: 2 } },
    { label: '잠깐만 눕는다', who: 'me', reply: '눈을 떠 보니 영상이 세 개 더 지나가 있었다.', fx: { stress: -3, fatigue: -2 } },
  ] },
  // ── 클럽 게임 ──
  { id: 'after_party', act: 'club', who: 'club', prompt: '회장님: "끝나고 뒤풀이 가지?"', options: [
    { label: '갈게요', who: 'me', reply: '오늘 경기가 안주가 되었다. 다음 정모 명단에 내 이름이 먼저 올랐다.', fx: { club: 2, stress: -4, fatigue: 3 } },
    { label: '내일 출근이라서요', who: 'club', reply: '회장님: "그래, 직장인이 먼저지." 집에 일찍 왔다.', fx: { fatigue: -4 } },
  ] },
  { id: 'line_call', act: 'club', who: 'me', prompt: '상대 공이 라인 근처에 떨어졌다. 아무도 제대로 못 봤다.', options: [
    { label: '아웃이요', who: 'me', reply: '상대가 고개를 갸웃했지만 넘어갔다. 마음이 조금 불편하다.', fx: { stress: 3, confidence: 1 } },
    { label: '인으로 할게요', who: 'me', reply: '상대: "매너 좋으시네요." 점수는 내줬지만 기분은 괜찮다.', fx: { club: 2, stress: -2 } },
  ] },
  { id: 'double_fault', act: 'club', who: 'me', prompt: '파트너가 더블폴트를 했다. 내 눈치를 본다.', options: [
    { label: '괜찮아요! 다음 거요', who: 'me', reply: '다음 게임을 잡았다. 복식은 이런 거구나.', fx: { club: 1, grow: 0.1 } },
    { label: '말없이 공을 건넨다', who: 'me', reply: '어색하게 다음 서브가 시작됐다. 말 한마디가 어렵다.', fx: { stress: 2 } },
  ] },
  { id: 'drink_bet', act: 'club', who: 'club', prompt: '회원: "진 팀이 음료수 사는 거 어때요?"', options: [
    { label: '좋아요', who: 'me', reply: '졌다. 음료수 네 캔. 그래도 오늘 제일 열심히 뛰었다.', fx: { grow: 0.2, fatigue: 3 } },
    { label: '오늘은 편하게 해요', who: 'me', reply: '웃으면서 쳤다. 공이 더 잘 들어갔다.', fx: { stress: -3 } },
  ] },
  { id: 'poach_call', act: 'club', withFace: true, who: 'partner', prompt: '{p}: "다음 포인트, 내가 포치 들어갈게."', options: [
    { label: '믿을게요', who: 'partner', reply: '{p}가 정말 끊어 냈다. 손바닥을 마주쳤다.', fx: { aff: 4, combo: 2 } },
    { label: '제가 커버할게요', who: 'partner', reply: '둘이 같은 공으로 달렸다. 라켓이 부딪혔다. 둘 다 웃었다.', fx: { aff: 3 } },
  ] },
  // ── 휴식 ──
  { id: 'remote', act: 'rest', who: 'me', prompt: '리모컨을 들었다. 뭘 볼까.', options: [
    { label: '테니스 중계', who: 'me', reply: '프로는 저렇게 치는구나. 어차피 내 몸은 안 따라간다.', fx: { confidence: 2, stress: 1 } },
    { label: '아무 생각 없는 예능', who: 'me', reply: '세 시간이 사라졌다. 아무 후회도 없다.', fx: { stress: -4 } },
  ] },
  { id: 'early_wake', act: 'rest', who: 'me', prompt: '아침에 저절로 눈이 떠졌다.', options: [
    { label: '더 잔다', who: 'me', reply: '다시 눈을 떠 보니 점심이었다.', fx: { fatigue: -4 } },
    { label: '일어나서 스트레칭', who: 'me', reply: '어깨에서 소리가 났다. 좋은 소리인지는 모르겠다.', fx: { stress: -2, fatigue: -1 } },
  ] },
  { id: 'club_chat', act: 'rest', who: 'club', prompt: '클럽 단체방이 울린다. "오늘 번개 치실 분?"', options: [
    { label: '못 본 척한다', who: 'me', reply: '알림을 껐다. 평화롭다.', fx: { stress: -3 } },
    { label: '다음엔 꼭 갈게요', who: 'club', reply: '회장님이 엄지를 보냈다. 쉬는 날에도 테니스는 따라온다.', fx: { club: 1 } },
  ] },
  // ── 가족·친구 ──
  { id: 'side_dish', act: 'family', outing: 'home', who: 'me', prompt: '엄마: "반찬 좀 싸 갈래? 요즘 얼굴이 왜 그래."', options: [
    { label: '네, 주세요', who: 'me', reply: '가방이 라켓 가방보다 무거워졌다.', fx: { stress: -3, fatigue: -2 } },
    { label: '테니스 쳐서 그래요', who: 'me', reply: '엄마: "그놈의 테니스." 결국 반찬을 받았다.', fx: { stress: -1, confidence: 1 } },
  ] },
  { id: 'friend_try', act: 'family', outing: 'play', who: 'me', prompt: '친구: "나도 테니스 해 볼까?"', options: [
    { label: '당장 시작해', who: 'me', reply: '내가 코치처럼 말하고 있었다. 친구 눈이 흔들린다.', fx: { confidence: 2 } },
    { label: '손목 나갈 수도 있어', who: 'me', reply: '친구: "그럼 너는 왜 해?" 대답을 못 했다.', fx: { stress: -2 } },
  ] },
  { id: 'nephew', act: 'family', outing: 'home', who: 'me', prompt: '조카가 라켓을 만지작거린다. 쳐 보고 싶은 눈치다.', options: [
    { label: '살살 쳐 볼래?', who: 'me', reply: '조카가 천장을 맞혔다. 엄마 표정이 굳었다.', fx: { stress: -2 } },
    { label: '이건 내 거야', who: 'me', reply: '조카가 울 것 같다. 결국 쥐여 줬다.', fx: { stress: -1 } },
  ] },
  { id: 'work_talk', act: 'family', outing: 'play', who: 'me', prompt: '친구: "회사는 어때?"', options: [
    { label: '그냥 그래', who: 'me', reply: '친구들이 회사 욕을 시작했다. 위로가 됐다.', fx: { stress: -4 } },
    { label: '그보다 내 서브 좀 봐 봐', who: 'me', reply: '식당에서 서브 폼을 보여 줬다. 친구들이 못 본 척했다.', fx: { confidence: 1, stress: -1 } },
  ] },
  // ── 야근 ──
  { id: 'ot_dinner', act: 'overtime', who: 'boss', prompt: '팀장: "저녁 먹고 마저 하지?"', options: [
    { label: '네…', who: 'me', reply: '저녁은 김밥이었다. 일은 끝났다.', fx: { work: 2, stress: 2 } },
    { label: '오늘은 먼저 들어가 볼게요', who: 'boss', reply: '팀장이 한 번 쳐다봤다. 심장이 테니스 칠 때보다 더 뛴다.', fx: { work: -2, stress: -2 } },
  ] },
  { id: 'ot_mate', act: 'overtime', who: 'me', prompt: '옆자리: "요즘 테니스 친다며? 손목 괜찮아?"', options: [
    { label: '손목 스냅을 보여 준다', who: 'me', reply: '옆자리가 조용히 모니터로 돌아갔다.', fx: { stress: -1 } },
    { label: '덕분에 아파요', who: 'me', reply: '둘이 파스 얘기를 십 분 했다. 좋은 동료다.', fx: { stress: -2, work: 1 } },
  ] },
];

// 이정표: 조건을 처음 채운 주의 결과 화면에 한 번 나온다. b는 큰 능력치, s는 게임 상태.
export const MILESTONES = [
  { id: 'rally3', topic: 'stroke', title: '첫 랠리 3번', text: '처음으로 랠리가 3번 이어졌다! 코치: "오, 감 있는데요?"', when: (s) => s.lessonCount >= 2 },
  { id: 'rally10', topic: 'stroke', title: '랠리 10번', text: '랠리가 10번 이어졌다! 팔이 떨어질 것 같은데 웃음이 난다.', when: (s, b) => b.stroke >= 42 },
  { id: 'serve_in', topic: 'serve', title: '서브 성공률 70%', text: '서브 열 개 중 일곱 개가 들어갔다. 지난달의 나는 누구였나.', when: (s, b) => b.serve >= 38 },
  { id: 'volley_pt', topic: 'net', title: '첫 발리 득점', text: '발리로 포인트를 땄다! 손에 아직 감각이 남아 있다.', when: (s, b) => b.net >= 36 },
  { id: 'stamina', topic: 'physical', title: '정모 네 게임', text: '정모 네 게임을 연달아 뛰었다. 아직 괜찮다.', when: (s, b) => b.physical >= 40 },
  { id: 'deep', topic: 'stroke', title: '베이스라인 위로', text: '코치: "방금 공, 라인 물었어요." 깊은 공이 처음으로 의도대로 갔다.', when: (s, b) => b.stroke >= 55 },
  { id: 'smash', topic: 'net', title: '첫 스매시 위너', text: '스매시가 꽂혔다! 소리를 질렀더니 옆 코트도 쳐다봤다.', when: (s, b) => b.net >= 55 },
  { id: 'comeback', topic: 'mental', title: '0-40 역전', text: '0-40에서 게임을 뒤집었다. 손이 떨렸는데 들어갔다.', when: (s, b) => b.mental >= 50 },
  { id: 'ace', topic: 'serve', title: '서브 에이스', text: '에이스! 상대가 라켓도 못 댔다. 코치가 박수를 쳤다.', when: (s, b) => b.serve >= 60 },
];

// 이어지는 이야기: 조건을 채우면 다음 주 시작에 뜬다. 사람들이 달라지는 과정을 보여 준다.
// when(s, b, o): o는 종합 능력. unlock: 행동 해금. aff: 친밀도, club: 클럽 명성.
export const STORIES = [
  { id: 'club_visit', who: 'sunhee', title: '정모 구경', text: '클럽 정모를 구경하러 갔다. 박선희: "초보는 저쪽에서 벽치기부터 해." 게임에 끼지 못했다.', ok: '벽치기라도 해 보자', unlock: 'practice', note: '벽치기를 할 수 있게 됐다', when: (s) => s.week >= 5 },
  { id: 'join_club', who: 'coach', title: '코치의 제안', text: '코치: "대회도 나갔으니 이제 정모에도 껴 봐요. 제가 말해 둘게요."', ok: '해 볼게요', unlock: 'club', note: '클럽 게임을 할 수 있게 됐다', when: (s) => s.results.length > 0 || s.week >= 15 },
  { id: 'first_ache', who: 'coach', title: '코치의 숙제', text: '코치: "대회 다음 날 많이 쑤시죠? 코트에 못 오는 날은 집에서 스트레칭이라도 해요."', ok: '해 볼게요', unlock: 'home', note: '홈트를 할 수 있게 됐다', when: (s) => s.results.length > 0 || s.week >= 13 },
  { id: 'sumin_gym', who: 'sumin', title: '이수민의 제안', text: '이수민: "회사 앞 헬스장 3개월 끊으면 싸대. 같이 끊자. 공에 힘이 하나도 없다며."', ok: '그래, 끊자', unlock: 'gym', aff: { sumin: 3 }, note: '헬스를 할 수 있게 됐다', when: (s) => s.week >= 17 },
  { id: 'hana_serve', who: 'hana', title: '김하나의 메시지', text: '김하나: "나 오늘 서브 처음 들어갔어!! 세 번이나!!"', ok: '축하해!', aff: { hana: 2 }, when: (s) => s.week >= 13 },
  { id: 'boss_tan', who: 'boss', title: '탕비실에서', text: '팀장: "자네 요즘 왜 이렇게 탔어? 주말에 어디 다녀?"', ok: '테니스요', when: (s) => s.week >= 19 },
  { id: 'sumin_roof', who: 'sumin', title: '이수민의 메시지', text: '이수민: "점심시간에 옥상에서 스윙 연습하는 거 다 봤어. 나도 끼워 줘."', ok: '같이 하자', aff: { sumin: 5 }, when: (s) => s.week >= 25 },
  { id: 'sunhee_nod', who: 'sunhee', title: '선배의 한마디', text: '박선희: "어제 보니까 공 좀 치던데? 벽치기 효과 있네."', ok: '감사합니다!', aff: { sunhee: 6 }, when: (s, b, o) => o >= 30 },
  { id: 'sunhee_call', who: 'sunhee', title: '먼저 온 연락', text: '박선희: "이번 주 정모 올 거지? 한 자리 비는데." 선배가 먼저 연락한 건 처음이다.', ok: '갈게요!', aff: { sunhee: 10 }, club: 5, when: (s, b, o) => o >= 40 },
  { id: 'rookie_asks', who: 'club', title: '신입 회원', text: '신입 회원: "저 혹시 포핸드 좀 봐주실 수 있어요?" 뒤를 돌아봤다. 나한테 한 말이었다.', ok: '제가요…?', club: 3, when: (s, b, o) => o >= 47 },
  { id: 'hana_gap', who: 'hana', title: '김하나의 고민', text: '김하나: "언니 요즘 너무 잘 쳐. 나랑 나가면 민폐 아니야?"', ok: '무슨 소리야, 같이 가는 거지', aff: { hana: 8 }, when: (s, b, o) => o >= 45 && s.partners.hana.level < o - 8 },
  { id: 'coach_memory', who: 'coach', title: '코치의 회상', text: '코치: "처음 왔을 때 기억나요? 포핸드 100개. 공이 펜스를 넘어갔죠." 둘이 한참 웃었다.', ok: '그랬죠', when: (s) => s.division === '국화' },
];

// 사람별 이어지는 이야기. 친밀도가 at을 넘으면 다음 턴 시작에 나온다. 마지막은 호흡이 맞기 시작하는 순간이다.
export const PERSON_STORIES = {
  hana: [
    { at: 50, text: '김하나: "오늘 끝나고 서브 좀 더 치고 갈래?" 이제 약속을 안 잡아도 같이 남는다.', ok: '그래' },
    { at: 80, text: '김하나: "나 지금 포치 들어갈 거 어떻게 알았어?" 눈을 안 마주쳐도 어디로 갈지 보인다. 같이 칠 때는 실수해도 마음이 편하다.', ok: '이제 편해' },
  ],
  sunhee: [
    { at: 50, text: '박선희: "오늘은 나랑 한 게임 하자." 선배가 먼저 짝을 하자고 했다.', ok: '네!' },
    { at: 80, text: '선배가 로브를 올릴 타이밍이 보이기 시작했다. 박선희: "이제 내가 뭐 할지 아네?" 선배 옆에서 더는 어깨에 힘이 안 들어간다.', ok: '이제 편해요' },
  ],
  sumin: [
    { at: 50, text: '이수민: "오늘 몇 시에 끝나? 나 헬스장 먼저 가 있을게." 회사 메신저가 운동 약속으로 찼다.', ok: '금방 갈게' },
    { at: 80, text: '이수민: "너 오늘 왜 이렇게 편하게 쳐?" 동기 앞에서는 잘 보일 필요가 없다. 어디로 움직일지도 이제 안다.', ok: '너니까' },
  ],
  daeun: [
    { at: 50, text: '정다은: "제가 앞에 있을 때 로브 올리면, 뒤로 안 빠져도 돼요?" 둘이서 움직임을 맞춰 보기 시작했다.', ok: '맞춰 봐요' },
    { at: 80, text: '정다은이 움직이기 전에 내 발이 먼저 돌았다. 정다은: "앞은 제가, 뒤는 언니가." 이제 포치가 나와도 당황하지 않는다.', ok: '믿을게' },
  ],
  jiwoo: [
    { at: 50, text: '한지우: "언니, 저 시험 끝나면 벽치기 같이 해요!" 어느새 시험 기간을 외우고 있다.', ok: '시험 잘 봐' },
    { at: 80, text: '한지우: "언니, 제가 뛸 거 아셨죠?" 공이 어디로 가든 지우가 뛸 쪽이 먼저 보인다. 덕분에 나는 내 공만 치면 된다.', ok: '알지' },
  ],
  arah: [
    { at: 50, text: '서아라: "아까 그 공, 왜 거기로 줬어?" 말투는 그대로인데 같이 남아서 복기를 한다.', ok: '다시 해 보자' },
    { at: 80, text: '서아라: "…이제 좀 맞네." 강타 뒤에 뭐가 올지 안다. 저 사람 옆에서도 이제 숨이 안 막힌다.', ok: '그러게' },
  ],
  mikyung: [
    { at: 50, text: '오미경: "오늘 급했어요. 왜 급했는지 알아요?" 베테랑이 내 경기를 보고 있었다.', ok: '알려 주세요' },
    { at: 80, text: '오미경: "이제 서두르지 않네요." 한 박자 늦게 움직여도 어디로 올지 안다. 승부처에서 손이 떨리지 않았다.', ok: '덕분이에요' },
  ],
  yujin: [
    { at: 50, text: '최유진: "서브 토스 한 번만 더 보여 줘 봐요." 선수 출신이 내 서브를 봐 주기 시작했다.', ok: '네!' },
    { at: 80, text: '최유진: "그래요, 그 자리." 선수 출신 옆에 서도 더는 작아지지 않는다. 내 공을 치면 된다는 걸 알았다.', ok: '네' },
  ],
};
// 호흡 훈련 순간의 글. {p}에 이름이 들어간다.
export const BOND_TRAIN_LINES = [
  '{p}가 어디로 갈지 알았다. 생각하기 전에 몸이 먼저 움직였다.',
  '{p} 옆에서는 실수해도 괜찮다. 어깨에 힘이 빠지니 공이 편하게 나갔다.',
  '말을 안 해도 맞는다. {p}도 웃고 있었다.',
];

// 깨달음: 경기에서 드러난 약점이 레슨 선택지가 된다
export const REALIZE_LINES = {
  stroke: '코치: "랠리에서 먼저 실수하더라고요. 스트로크를 잡아 봅시다."',
  net: '코치: "네트 앞에서 발리가 자꾸 뜨더라고요. 그거 해 볼래요?"',
  serve: '코치: "더블폴트로 준 포인트가 많았어요. 서브부터 잡아요."',
  physical: '코치: "마지막 경기에서 발이 안 움직이던데요? 체력 키워 봐요."',
  mental: '코치: "실수 하나에 표정이 무너지더라고요. 그것도 연습이에요."',
  c_moon: '코치: "문발리에 계속 당하던데요? 높은 공 처리하는 법 배워 봐요."',
  c_slice: '코치: "슬라이스가 낮게 오니까 못 받더라고요? 그거 배워 볼래요?"',
  c_lob: '코치: "로브 올라가면 멈춰 서더라고요. 뒤로 도는 법 알려 줄게요."',
  c_drop: '코치: "드롭샷에 첫발이 늦어요. 앞으로 뛰는 연습 해요."',
  c_angle: '코치: "앵글로 빠지는 공을 놓치더라고요. 그쪽 잡아 봐요."',
  c_power: '코치: "강한 서브에 라켓이 늦어요. 리턴 자세 다시 봐요."',
  c_poach: '코치: "상대 전위한테 자꾸 잘려요. 포치 피하는 법 해 봐요."',
  c_body: '코치: "몸쪽 공에 움찔하더라고요. 그것도 연습이에요."',
};

// 대회가 끝난 뒤 한 장면. {p}에 파트너 이름이 들어간다.
export const TOUR_LINES = {
  G: ['{p}: "우리 15분 만에 끝났어 ㅋㅋ" 둘이서 떡볶이를 먹었다.', '{p}: "다음엔 1승만 하자." 집에 오는 길이 길었다.', '예선 탈락. {p}: "그래도 저 상대 서브 진짜 세더라."'],
  R128: ['본선에 올랐다! {p}: "우리 본선 갔어, 본선!" 다음 경기는 금방 끝났지만.'],
  R64: ['본선에서 한 번 이겼다. {p}: "이 맛에 대회 나오는구나."'],
  R32: ['본선에 올랐다! {p}: "우리 본선 갔어, 본선!" 다음 상대는 달랐다.', '본선 첫 경기에서 졌다. 그래도 예선은 넘었다.'],
  R16: ['16강. 대진표에 이름이 꽤 위에 있다. {p}가 사진을 찍었다.'],
  QF: ['8강. 어느새 코트 주변에 사람들이 모여 있었다.'],
  SF: ['4강. 시상식까지 남아 있어 본 건 처음이다. {p}: "다음엔 저기 서자."'],
  F: ['결승에서 졌다. {p}: "준우승도 트로피 줘?" 줬다. 생각보다 무거웠다.'],
  W: ['우승! {p}: "우리가 진짜 해냈어!" 둘 다 울었다.'],
};

// 경기 뒤 축하 자리. {p}에 파트너 이름이 들어간다.
export const PARTY_LINES = {
  W: ['시상대 맨 위에 올랐다. 트로피가 생각보다 무겁다. {p}가 먼저 울었다.', '이름이 불렸다. 사진을 찍는데 표정 관리가 안 된다. 뒤풀이 자리에서 오늘 경기가 벌써 전설이 됐다.'],
  F: ['시상대 두 번째 칸에 섰다. {p}: "다음엔 저기 맨 위야." 분해서 좋았다.', '준우승 트로피를 들고 사진을 찍었다. 뒤풀이 내내 마지막 포인트 얘기만 했다.'],
  SF: ['입상자 사진을 찍었다. {p}가 브이를 했다. 나도 했다.', '4강까지 남아 있으니 다른 팀들이 말을 걸어 온다. 뒤풀이 자리에 처음 끼었다.'],
  QF: ['8강에 든 팀끼리 사진을 찍었다. 대진표에 내 이름이 꽤 위에 있다.', '{p}와 음료수로 건배했다. 오늘은 이걸로 충분하다.'],
};
export const PARTY_WORD = { W: '우승 축하!', F: '준우승 축하!', SF: '4강 축하!', QF: '8강 축하!' };

// 주간 화면 말풍선. 상태가 있으면 STATE_LINES가 먼저 나온다.
export const STATE_LINES = {
  tutorial: '코치: "앞으로는 2주에 한 번씩 뭘 할지 골라 봐요. 훈련을 누르면 레슨이 있어요."',
  injury: '{name}… 당분간은 쉬어야겠다.',
  doubt: '어제는 됐는데 오늘은 왜 안 되지. 왜 이렇게 어려울까.',
  yips: '서브 토스가 자꾸 신경 쓰인다.',
  sure: '나 이제 실력이 좀 되는지도?',
  sore: '온몸이 쑤신다. 계단이 무섭다.',
  entered: '이번 주는 {name}! 벌써 긴장된다.',
  overtime: '이번 주는 코트 근처에도 못 가겠네.',
  stressed: '머리가 복잡하다. 뭔가 좀 풀어야겠다.',
  slump: '요즘 공이 안 맞아. 뭔가 잘못됐나.',
  open: '이번에 {name} 열린대. 나가 볼까?',
  tired: '몸이 천근만근이다.',
  good: '오늘은 몸이 가볍다!',
};
// 아직 못 고르는 버튼을 눌렀을 때의 혼잣말
export const LOCK_LINES = {
  practice: '벽치기는 어디서 하는 거지. 아직 모르겠다.',
  gym: '헬스는 무슨. 아직 레슨만으로도 벅차다.',
  home: '집에 오면 일단 눕고 본다. 아직은.',
  skill: '아직 내세울 만한 기술이 없다.',
  clinic: '지금은 아픈 데가 없다. 병원 갈 일은 없다.',
  club: '클럽 게임은 아직 좀 무섭다. 조금 더 배우고 나서.',
  injured: '지금은 몸부터 챙겨야 한다.',
  noTour: '다음 대회는 {weeks}주 뒤 {name}.',
  noMoreTour: '올해 남은 대회는 없다.',
};
export const HOME_LINES = [
  '이번엔 뭐 하지?',
  '퇴근하고 코트 갈까, 그냥 집에 갈까.',
  '점심시간에 또 테니스 영상을 봤다.',
  '손바닥 굳은살이 제법 단단해졌다.',
  '라켓 가방을 메고 출근했더니 다들 쳐다본다.',
  '자기 전에 스윙 연습을 했다. 이불이 날아갔다.',
  '요즘 날씨 보는 습관이 생겼다.',
  '다음엔 뭘 배워 볼까.',
];
