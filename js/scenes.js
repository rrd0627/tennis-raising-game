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

  // ── 혼자 연습 ──
  { act: 'practice', who: 'me', text: '벽은 실수해도 아무 말이 없다. 그래서 좋다.' },
  { act: 'practice', who: 'me', text: '벽치기를 하는데 경비 아저씨가 "오늘도 왔네" 하신다.' },
  { act: 'practice', who: 'me', text: '퇴근하고 혼자 공 200개. 손에 물집이 잡혔다.' },
  { act: 'practice', who: 'me', text: '지난 레슨을 떠올리며 스윙했다. 거울 속 자세가 코치와 다르다.' },
  { act: 'practice', withFace: true, who: 'partner', text: '{p}: "벽이랑 싸우는 거야?" 같이 랠리를 했다.' },
  { act: 'practice', withFace: true, who: 'partner', text: '{p}도 와 있었다. 같이 공을 치다 보니 어두워졌다.' },

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
  { act: 'family', who: 'me', text: '엄마: "너 요즘 왜 이렇게 탔니?"' },
  { act: 'family', who: 'me', text: '친구들: "너 요즘 테니스 얘기만 해." 맞는 말이다.' },
  { act: 'family', who: 'me', text: '오랜만에 친구를 만났다. 세 시간 중 두 시간을 테니스 얘기를 했다.' },
  { act: 'family', who: 'me', text: '조카가 라켓을 보고 "배드민턴?"이라고 했다. 참았다.' },
  { act: 'overtime', who: 'boss', text: '팀장: "오늘 좀 남지?" 라켓 가방이 책상 밑에서 울고 있다.' },
  { act: 'overtime', who: 'me', text: '야근 중에 손목 스냅을 연습했다. 옆자리에서 쳐다봤다.' },
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
  { id: 'club_visit', who: 'sunhee', title: '정모 구경', text: '클럽 정모를 구경하러 갔다. 박선희: "초보는 저쪽에서 벽치기부터 해." 게임에 끼지 못했다.', ok: '벽치기라도 해 보자', unlock: 'practice', note: '혼자 연습을 할 수 있게 됐다', when: (s) => s.week >= 5 },
  { id: 'join_club', who: 'coach', title: '코치의 제안', text: '코치: "대회도 나갔으니 이제 정모에도 껴 봐요. 제가 말해 둘게요."', ok: '해 볼게요', unlock: 'club', note: '클럽 게임을 할 수 있게 됐다', when: (s) => s.results.length > 0 || s.week >= 15 },
  { id: 'hana_serve', who: 'hana', title: '김하나의 메시지', text: '김하나: "나 오늘 서브 처음 들어갔어!! 세 번이나!!"', ok: '축하해!', aff: { hana: 2 }, when: (s) => s.week >= 13 },
  { id: 'boss_tan', who: 'boss', title: '탕비실에서', text: '팀장: "자네 요즘 왜 이렇게 탔어? 주말에 어디 다녀?"', ok: '테니스요', when: (s) => s.week >= 19 },
  { id: 'sumin_roof', who: 'sumin', title: '이수민의 메시지', text: '이수민: "점심시간에 옥상에서 스윙 연습하는 거 다 봤어. 나도 끼워 줘."', ok: '같이 하자', aff: { sumin: 5 }, when: (s) => s.week >= 25 },
  { id: 'sunhee_nod', who: 'sunhee', title: '선배의 한마디', text: '박선희: "어제 보니까 공 좀 치던데? 벽치기 효과 있네."', ok: '감사합니다!', aff: { sunhee: 6 }, when: (s, b, o) => o >= 30 },
  { id: 'sunhee_call', who: 'sunhee', title: '먼저 온 연락', text: '박선희: "이번 주 정모 올 거지? 한 자리 비는데." 선배가 먼저 연락한 건 처음이다.', ok: '갈게요!', aff: { sunhee: 10 }, club: 5, when: (s, b, o) => o >= 40 },
  { id: 'rookie_asks', who: 'club', title: '신입 회원', text: '신입 회원: "저 혹시 포핸드 좀 봐주실 수 있어요?" 뒤를 돌아봤다. 나한테 한 말이었다.', ok: '제가요…?', club: 3, when: (s, b, o) => o >= 47 },
  { id: 'hana_gap', who: 'hana', title: '김하나의 고민', text: '김하나: "언니 요즘 너무 잘 쳐. 나랑 나가면 민폐 아니야?"', ok: '무슨 소리야, 같이 가는 거지', aff: { hana: 8 }, when: (s, b, o) => o >= 45 && s.partners.hana.level < o - 8 },
  { id: 'coach_memory', who: 'coach', title: '코치의 회상', text: '코치: "처음 왔을 때 기억나요? 포핸드 100개. 공이 펜스를 넘어갔죠." 둘이 한참 웃었다.', ok: '그랬죠', when: (s) => s.division === '국화' },
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

// 주간 화면 말풍선. 상태가 있으면 STATE_LINES가 먼저 나온다.
export const STATE_LINES = {
  tutorial: '코치: "앞으로는 2주에 한 번씩 뭘 할지 골라 봐요. 레슨 오실 거죠?"',
  injury: '{name}… 당분간은 쉬어야겠다.',
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
  practice: '혼자 뭘 연습해야 할지 아직 모르겠다.',
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
