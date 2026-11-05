// 테니스 선수 키우기 — 게임 데이터 (기획 문서 4~9장 기준)

export const STAT_GROUPS = [
  { id: 'stroke', name: '그라운드 스트로크', tech: true, stats: [
    ['fh_drive', '포핸드 드라이브'], ['bh_drive', '백핸드 드라이브'], ['fh_slice', '포핸드 슬라이스'], ['bh_slice', '백핸드 슬라이스'],
    ['topspin_lob', '탑스핀 로브'], ['def_lob', '수비 로브'], ['dropshot', '드롭샷'], ['passing', '패싱샷']] },
  { id: 'net', name: '네트 플레이', tech: true, stats: [
    ['fh_volley', '포 발리'], ['bh_volley', '백 발리'], ['low_volley', '로우 발리'], ['half_volley', '하프발리'],
    ['swing_volley', '스윙발리'], ['moon_volley', '문발리'], ['drop_volley', '드롭 발리'], ['smash', '스매시']] },
  { id: 'serve', name: '서브·리턴', tech: true, stats: [
    ['first_serve', '퍼스트 서브'], ['second_serve', '세컨 서브'], ['serve_place', '서브 코스'], ['return', '리턴'], ['chip_return', '칩 리턴']] },
  { id: 'course', name: '코스', tech: true, stats: [
    ['dtl', '다운더라인'], ['cross', '크로스'], ['angle', '크로스 앵글'], ['center', '센터 공략'], ['depth', '깊이 조절']] },
  { id: 'counter', name: '대처', tech: true, stats: [
    ['c_moon', '문발리 대처'], ['c_slice', '슬라이스 대처'], ['c_lob', '로브 대처'], ['c_drop', '드롭샷 대처'],
    ['c_angle', '앵글 대처'], ['c_power', '강서브 대처'], ['c_poach', '포치 대처'], ['c_body', '바디샷 대처']] },
  { id: 'physical', name: '피지컬', stats: [
    ['stamina', '스태미나'], ['first_step', '첫발'], ['speed', '스피드'], ['power', '파워'], ['flex', '유연성']] },
  { id: 'tactics', name: '전술', stats: [
    ['positioning', '포지셔닝'], ['shot_sel', '샷 선택'], ['poach', '포치 판단'], ['cover', '커버'], ['formation', '포메이션 운용'], ['analysis', '상대 분석']] },
  { id: 'mental', name: '멘탈', stats: [
    ['focus', '집중력'], ['clutch', '압박감 내성'], ['resilience', '회복탄력성'], ['composure', '평정심'], ['drive', '승부욕'], ['comm', '파트너 소통']] },
];

export const STAT_NAME = {};
export const STAT_GROUP_OF = {};
export const ALL_STATS = [];
for (const g of STAT_GROUPS) for (const [id, name] of g.stats) { STAT_NAME[id] = name; STAT_GROUP_OF[id] = g.id; ALL_STATS.push(id); }
export const GROUP_BY_ID = Object.fromEntries(STAT_GROUPS.map(g => [g.id, g]));

// 대처 짝: 이 샷을 받는 쪽이 쓰는 능력치
export const COUNTER_OF = {
  fh_slice: 'c_slice', bh_slice: 'c_slice', chip_return: 'c_slice',
  topspin_lob: 'c_lob', def_lob: 'c_lob', moon_volley: 'c_moon',
  dropshot: 'c_drop', drop_volley: 'c_drop', first_serve: 'c_power',
};

export function grade(v) {
  if (v >= 85) return 'S'; if (v >= 70) return 'A'; if (v >= 55) return 'B';
  if (v >= 40) return 'C'; if (v >= 30) return 'D'; if (v >= 20) return 'E'; return 'F';
}

// 화면에 보여 주는 큰 능력치 6개. 세부 능력치는 능력치 화면에서 본다.
export const BIG_STATS = [
  { id: 'stroke', name: '스트로크', groups: ['stroke', 'course'] },
  { id: 'net', name: '네트', groups: ['net'] },
  { id: 'serve', name: '서브·리턴', groups: ['serve'] },
  { id: 'physical', name: '피지컬', groups: ['physical'] },
  { id: 'tactics', name: '전술·대처', groups: ['tactics', 'counter'] },
  { id: 'mental', name: '멘탈', groups: ['mental'] },
];

export const STAT_BIG = {};
for (const b of BIG_STATS) for (const gid of b.groups) for (const [sid] of GROUP_BY_ID[gid].stats) STAT_BIG[sid] = b.id;

// ── 이번 턴에 할 일 (1턴 = 2주) ───────────────────────────
// train: 훈련 칸. tennis: 코트에서 하는 일(폭염 영향). risk: 부상 위험이 있다. unlock: 이야기가 진행되어야 열린다.
// mile: 이 칸에서 나올 수 있는 이정표 주제. 대회 출전은 화면에서 따로 처리한다.
export const ACTIONS = [
  { id: 'lesson', name: '레슨', icon: '🎾', train: true, tennis: true, risk: true, fatigue: 18, stress: 1 },
  { id: 'gym', name: '헬스', icon: '🏋️', train: true, risk: true, unlock: 'gym', mile: 'physical', groups: { physical: 0.9 }, stats: { power: 1, stamina: 0.4 }, fatigue: 16, stress: -2 },
  { id: 'practice', name: '벽치기', icon: '🧱', train: true, tennis: true, risk: true, unlock: 'practice', mile: 'stroke', groups: { stroke: 0.8, course: 0.6 }, stats: { focus: 0.4 }, fatigue: 10, stress: 0 },
  { id: 'club', name: '클럽 게임', icon: '👥', train: true, tennis: true, risk: true, unlock: 'club', groups: { tactics: 0.7, counter: 0.7, mental: 0.45, course: 0.25 }, fatigue: 16, stress: -2 },
  { id: 'home', name: '홈트', icon: '🧘', train: true, unlock: 'home', mile: 'physical', groups: { physical: 0.35 }, stats: { flex: 1.2, stamina: 0.3 }, fatigue: 2, stress: -2 },
  { id: 'rest', name: '휴식', icon: '😴', fatigue: -45, stress: -8 },
  { id: 'family', name: '가족·친구', icon: '🏠', fatigue: -10, stress: -30 },
  { id: 'clinic', name: '병원', icon: '🏥', fatigue: -20, stress: -3 },
  { id: 'overtime', name: '야근', icon: '💼', fatigue: 10, stress: 10, work: 4 },
];
export const TRAIN_SPOTS = ACTIONS.filter(a => a.train).map(a => a.id);
// 칸 레벨: 같은 칸을 4번 쓰면 오른다. 레벨이 오르면 더 늘고 더 힘들다.
export const SPOT_USES_PER_LV = 4, SPOT_MAX_LV = 5;
// 친밀도가 이 값을 넘으면 호흡이 맞는다: 그 사람의 특기 칸에서 훈련이 크게 곱해지고, 같이 대회에 나가면 편하게 친다.
export const BOND_AT = 80;
export const ACT = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
// 휴식은 결과가 세 가지로 갈린다. fatigue·stress는 위 rest 값을 대신하고, 평균은 전과 거의 같다. mood는 지금과 다음 턴 기분에 더해진다.
export const REST_RESULTS = [
  { id: 'poor', name: '잠을 설쳤다', rate: 0.2, fatigue: -25, stress: -4, mood: -1 },
  { id: 'fine', name: '개운하다', rate: 0.55, fatigue: -45, stress: -8, mood: 0 },
  { id: 'deep', name: '푹 잤다!', rate: 0.25, fatigue: -65, stress: -12, mood: 1 },
];

// 쉬는 날 어디로 가는지. 마음을 비워 내는 효과가 있다. 평균은 가족·친구의 기본값과 거의 같다.
export const OUTINGS = [
  { id: 'trip', name: '훌쩍 여행을 다녀왔다', rate: 0.3, fatigue: -5, stress: -40, mood: 2 },
  { id: 'play', name: '친구들과 신나게 놀았다', rate: 0.5, fatigue: -10, stress: -30, mood: 1 },
  { id: 'home', name: '본가에서 쉬다 왔다', rate: 0.2, fatigue: -18, stress: -20, mood: 1 },
];

// 기술. 힌트를 얻으면 경험으로 배운다. 턴을 쓰지 않는다. 0: 못함, 1: 할 줄 안다, 2: 자신 있다.
export const SKILLS = {
  drop: { name: '드롭', desc: '네트 앞에 짧게 떨어뜨린다.' },
  smash: { name: '스매시', desc: '높은 공을 놓치지 않고 때린다.' },
  swing: { name: '스윙발리', desc: '떠 있는 공에 달려들며 세게 친다.' },
  read: { name: '예측 수비', desc: '상대가 어디로 칠지 미리 움직인다.' },
};
export const SKILL_PRICE = [80, 150]; // 배우는 데 드는 경험. 힌트가 늘면 줄어든다.
export const SKILL_LV_NAME = ['알게 됐다', '할 줄 안다 ○', '자신 있다 ◎'];
export const EXP_OF = { lesson: 4, club: 8 }; // 대회 > 클럽 게임 > 레슨

// 몸과 마음의 상태. turns: 지속 턴, k: 훈련 효과 배수.
export const CONDS = {
  sure: { name: '이제 좀 되는지도?', kind: 'good', turns: 3, k: 1.1 },
  light: { name: '몸이 가볍다', kind: 'good', turns: 2 },
  doubt: { name: '왜 이렇게 어렵지?', kind: 'bad', turns: 4, k: 0.9 },
  yips: { name: '입스', kind: 'bad', turns: 6 },
  sore: { name: '온몸이 쑤신다', kind: 'bad', turns: 3 },
};

// 레슨 내용. 처음엔 코치가 정하고, 경기에서 약점을 깨달으면 직접 고를 수 있게 된다.
export const LESSONS = {
  stroke: { name: '스트로크', groups: { stroke: 1, course: 0.7 } },
  net: { name: '네트 플레이', groups: { net: 1, counter: 0.4 } },
  serve: { name: '서브·리턴', groups: { serve: 1, counter: 0.2, course: 0.2 } },
  physical: { name: '체력', groups: { physical: 1 }, fatigue: 4 },
  mental: { name: '멘탈·전술', groups: { mental: 0.8, tactics: 0.7, counter: 0.2 }, fatigue: -6, stress: -3 },
  c_moon: { name: '문발리 대처', counter: true, groups: { counter: 0.3 }, stats: { c_moon: 2.2 } },
  c_slice: { name: '슬라이스 대처', counter: true, groups: { counter: 0.3 }, stats: { c_slice: 2.2 } },
  c_lob: { name: '로브 대처', counter: true, groups: { counter: 0.3 }, stats: { c_lob: 2.2 } },
  c_drop: { name: '드롭샷 대처', counter: true, groups: { counter: 0.3 }, stats: { c_drop: 2.2 } },
  c_angle: { name: '앵글 대처', counter: true, groups: { counter: 0.3 }, stats: { c_angle: 2.2 } },
  c_power: { name: '강서브 대처', counter: true, groups: { counter: 0.3 }, stats: { c_power: 2.2 } },
  c_poach: { name: '포치 대처', counter: true, groups: { counter: 0.3 }, stats: { c_poach: 2.2 } },
  c_body: { name: '바디샷 대처', counter: true, groups: { counter: 0.3 }, stats: { c_body: 2.2 } },
};
export const BASIC_LESSONS = ['stroke', 'net', 'serve', 'physical', 'mental'];

export const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

// 시나리오 목표. by 주까지 달성한다.
export const GOALS = [
  { id: 'first', by: 13, text: '1년차 봄까지 첫 대회 나가 보기' },
  { id: 'local_qf', by: 51, text: '1년차 안에 비전국대회 8강' },
  { id: 'promote', by: 104, text: '2년차 말까지 개나리부 전국대회 우승' },
  { id: 'promote_late', by: 156, text: '3년차 말까지 개나리부 전국대회 우승' },
  { id: 'champion', by: 156, text: '3년차 말까지 국화부 대회 우승' },
];

// 레슨 첫날 코치와의 대화. 고른 답에 따라 시작 능력치와 관계가 달라진다.
// grow: 잘 늘어나는 큰 능력치(+10%). fam: 처음부터 어느 정도 겪어 본 상대의 공.
// stats: 능력치 보정, aff: 파트너 친밀도, reply: 코치의 반응. job은 야근 장면과 마감 이벤트 글도 바꾼다.
export const PROFILE = [
  {
    key: 'job', ask: '회사 다니신다고요? 무슨 일 하세요?', options: [
      { id: 'sales', grow: 'mental', name: '영업팀', stats: { comm: 8, drive: 6, stamina: 3 }, work: 5, stress: 5, reply: '영업이면 파트너 구하는 건 걱정 없겠네요.', overtime: '거래처 미팅이 늦게 끝났다. 라켓 가방을 멘 채 명함을 건넸다.', deadline: '팀장: "이번 주 실적 마감이야. 다들 남아."' },
      { id: 'dev', grow: 'tactics', name: '개발팀', stats: { analysis: 8, shot_sel: 6, focus: 5, stamina: -3 }, reply: '개발자시구나. 머리는 잘 쓰시겠는데 체력이 걱정이네요.', overtime: '배포가 밀렸다. 새벽 코트 대신 새벽 서버를 본다.', deadline: '팀장: "이번 주 배포야. 다들 남아 줘."' },
      { id: 'design', grow: 'stroke', name: '디자인팀', stats: { dropshot: 7, drop_volley: 6, depth: 5, angle: 4 }, reply: '디자인 하시는 분들이 코스 감각이 좋더라고요.', overtime: '"로고 조금만 더 크게요." 수정이 열두 번째다.', deadline: '팀장: "시안 내일 아침까지래. 미안."' },
      { id: 'finance', grow: 'mental', name: '재무팀', stats: { composure: 8, positioning: 5, focus: 4, clutch: 3 }, reply: '숫자 다루는 분들은 실수를 싫어하죠. 테니스는 실수의 스포츠예요.', overtime: '결산 숫자가 안 맞는다. 3원이 어디로 갔을까.', deadline: '팀장: "이번 주 결산이야. 다들 남아."' },
      { id: 'field', grow: 'physical', name: '현장·물류팀', stats: { stamina: 8, power: 7, speed: 3 }, reply: '현장에서 일하시면 체력은 제가 걱정 안 해도 되겠네요.', overtime: '물량이 터졌다. 오늘 운동은 이걸로 됐다.', deadline: '팀장: "이번 주 물량 터졌어. 다들 남아."' },
      { id: 'hr', grow: 'tactics', name: '인사팀', stats: { comm: 6, resilience: 6, cover: 4, composure: 3 }, reply: '사람 상대하는 일이면 복식 잘하시겠는데요?', overtime: '채용 면접이 줄줄이 이어졌다. 웃는 얼굴이 굳었다.', deadline: '팀장: "이번 주 채용 마감이야. 다들 남아."' },
    ],
  },
  {
    key: 'past', ask: '운동은 좀 해 보셨어요?', options: [
      { id: 'none', name: '숨쉬기 운동뿐이에요', stats: { resilience: 5, focus: 3 }, confidence: -5, reply: '괜찮아요. 오히려 나쁜 버릇이 없어서 좋아요.' },
      { id: 'sport', grow: 'physical', fam: { power: 20 }, name: '학창 시절 운동부요', stats: { stamina: 7, speed: 6, first_step: 5, power: 4 }, reply: '오, 몸은 기억하고 있을 거예요.' },
      { id: 'badminton', grow: 'net', fam: { net: 25 }, name: '배드민턴 동호회요', stats: { smash: 8, fh_volley: 5, first_step: 5, speed: 4 }, reply: '손목 쓰는 버릇만 고치면 되겠네요.' },
      { id: 'tabletennis', grow: 'stroke', fam: { slice: 25 }, name: '탁구장 단골이에요', stats: { fh_slice: 6, bh_slice: 6, first_step: 5, c_slice: 5 }, reply: '회전은 이미 아시겠네요. 공이 좀 커졌다고 생각하세요.' },
      { id: 'yoga', grow: 'mental', fam: { moon: 10 }, name: '요가·필라테스요', stats: { flex: 12, composure: 5, focus: 5 }, reply: '유연하면 잘 안 다쳐요. 큰 장점이에요.' },
      { id: 'running', grow: 'physical', fam: { wall: 15 }, name: '주말마다 달려요', stats: { stamina: 12, resilience: 6, speed: 3 }, reply: '테니스는 뛰는 게 반이에요. 자신 있으시겠네요.' },
    ],
  },
  {
    key: 'why', ask: '그런데 테니스는 왜 시작하셨어요?', options: [
      { id: 'friend', name: '친구가 같이 하자고 해서요', aff: { hana: 15 }, reply: '아, 김하나 씨 친구분이시구나! 같이 크면 좋죠.' },
      { id: 'rival', name: '회사 동기한테 지기 싫어서요', aff: { sumin: 15 }, stats: { drive: 8 }, reply: '이수민 씨요? 그 마음이면 금방 늘어요.' },
      { id: 'stress', name: '스트레스 풀고 싶어서요', stats: { composure: 3 }, stress: -10, reply: '공 세게 치면 확실히 풀려요. 약속해요.' },
      { id: 'health', name: '건강검진 결과가 좀…', stats: { stamina: 4, flex: 4 }, reply: '…오늘은 무리하지 말죠.' },
      { id: 'drama', name: '드라마 보고 멋있어서요', stats: { fh_drive: 4, smash: 3 }, confidence: 12, reply: '다들 그렇게 시작해요. 괜찮아요.' },
      { id: 'clothes', name: '테니스복이 예뻐서요', confidence: 5, club: 5, reply: '솔직해서 좋네요. 그런 분들이 제일 오래 쳐요.' },
    ],
  },
];

// 인트로 컷 (임시 그림. 컷 그림만 나중에 바꾼다). 마지막 컷에서 코치와의 대화로 이어진다.
export const INTRO_SCENES = [
  { icon: '⏰', bg: '#2c3550', text: '오전 6시 50분. 오늘도 알람이 울린다.' },
  { icon: '🚇', bg: '#46536b', text: '출근 지하철. 어제랑 같은 칸, 같은 자리.' },
  { icon: '💻', bg: '#1b2130', text: '밤 9시. 사무실엔 모니터 불빛만 남았다.' },
  { icon: '🌃', bg: '#22384f', text: '퇴근길. 어디선가 톡, 톡, 공 소리가 들린다.' },
  { icon: '🎾', bg: '#2f8a5b', text: '조명 켜진 코트. 나도… 저거 해 보고 싶다.' },
  { icon: '📱', bg: '#c9772e', text: '다음 날 점심시간. 테니스 레슨을 등록했다.' },
  { icon: '🌤️', bg: '#3a9a6a', text: '토요일 아침. 빌린 라켓을 들고 코트에 처음 섰다.' },
];

// ── 파트너 (여자 복식) ─────────────────────────────────────
// spec: 특기 칸. spots: 칸마다 나타나는 가중치(없으면 안 나타남). gives: 같이 훈련하면 더 느는 능력치. 홈트는 집에서 혼자 한다.
// teaches: 알려 줄 수 있는 기술.
export const PARTNERS = [
  { id: 'hana', spec: 'practice', spots: { practice: 5, lesson: 3, club: 1, gym: 1 }, gives: { comm: 0.5, resilience: 0.5 }, name: '김하나', arch: '테니스 입문 동기', style: '올라운드', div: '개나리', level: 17, growth: 0.32, aff: 25, known: true,
    bias: {}, color: { hair: '#5a3a2a', outfit: '#ffb3c7' }, line: '우리 같이 크는 거야!' },
  { id: 'sunhee', teaches: ['drop', 'read'], spec: 'club', spots: { club: 5, practice: 2 }, gives: { def_lob: 0.5, topspin_lob: 0.4, bh_slice: 0.4, c_lob: 0.3 }, name: '박선희', arch: '클럽 고인물 선배', style: '로브·슬라이스 수비형', div: '개나리', level: 40, growth: 0.04, aff: 12, known: true,
    bias: { def_lob: 18, topspin_lob: 14, fh_slice: 14, bh_slice: 16, c_lob: 10, power: -12, first_serve: -10 }, color: { hair: '#2b2b2b', outfit: '#9ad0a8' }, line: '공은 넘기기만 하면 돼~' },
  { id: 'sumin', spec: 'gym', spots: { gym: 5, lesson: 2, practice: 2, club: 1 }, gives: { drive: 0.6, stamina: 0.3 }, name: '이수민', arch: '같은 회사 동기', style: '올라운드', div: '개나리', level: 22, growth: 0.16, aff: 30, known: true,
    bias: {}, color: { hair: '#7a4b2a', outfit: '#a8c8ff' }, line: '팀장님 몰래 연습 가자.' },
  { id: 'daeun', teaches: ['swing', 'smash'], spec: 'club', spots: { club: 5, practice: 2, lesson: 1 }, gives: { fh_volley: 0.5, bh_volley: 0.4, poach: 0.5 }, name: '정다은', arch: '전위 장인', style: '포치·발리형 전위', div: '개나리', level: 37, growth: 0.07, aff: 0, known: false, meet: 'club',
    bias: { fh_volley: 16, bh_volley: 14, poach: 20, smash: 10, drive: 10, def_lob: -10 }, color: { hair: '#c0473a', outfit: '#ffd166' }, line: '앞은 내가 다 먹을게.' },
  { id: 'jiwoo', teaches: ['read'], spec: 'practice', spots: { practice: 5, gym: 2, club: 2 }, gives: { speed: 0.6, first_step: 0.5 }, name: '한지우', arch: '대학생 유망주', style: '스피드형', div: '개나리', level: 26, growth: 0.27, aff: 0, known: false, meet: 'bungae',
    bias: { speed: 18, first_step: 14, stamina: 10, composure: -12 }, color: { hair: '#3a2a5a', outfit: '#b5f0e0' }, line: '언니 저 시험 끝나면 다 나가요!', exams: [15, 16, 41, 42] },
  { id: 'arah', teaches: ['swing', 'smash'], spec: 'gym', spots: { gym: 5, club: 3, practice: 1 }, gives: { fh_drive: 0.5, power: 0.5, swing_volley: 0.3 }, name: '서아라', arch: '라이벌 팀 이적생', style: '공격형', div: '개나리', level: 44, growth: 0.08, aff: 0, known: false, meet: 'rival',
    bias: { fh_drive: 16, power: 14, swing_volley: 14, composure: -10, comm: -8 }, color: { hair: '#1e1e2a', outfit: '#ff8a5c' }, line: '이길 거면 같이 해.' },
  { id: 'mikyung', teaches: ['read', 'drop'], spec: 'lesson', spots: { lesson: 5, club: 3 }, gives: { shot_sel: 0.5, positioning: 0.5, composure: 0.4 }, name: '오미경', arch: '은퇴 후 복귀한 베테랑', style: '노련한 전술형', div: '국화', level: 58, growth: 0, aff: 0, known: false, meet: 'club2',
    bias: { shot_sel: 16, positioning: 16, composure: 18, clutch: 14, speed: -14, stamina: -10 }, color: { hair: '#8a8a8a', outfit: '#c9b6ff' }, line: '급할수록 한 박자 늦게.' },
  { id: 'yujin', teaches: ['smash', 'swing'], spec: 'lesson', spots: { lesson: 5, gym: 2, club: 2 }, gives: { first_serve: 0.6, power: 0.4, smash: 0.3 }, name: '최유진', arch: '선수 출신 에이스', style: '파워·서브형', div: '국화', level: 70, growth: 0.02, aff: 0, known: false, meet: 'national',
    bias: { first_serve: 16, power: 16, fh_drive: 12, smash: 12, composure: -6 }, color: { hair: '#2a2a2a', outfit: '#ffffff' }, line: '국화 오면 연락해.' },
];
export const PARTNER = Object.fromEntries(PARTNERS.map(p => [p.id, p]));

// 상대 팀 성향 (경기 엔진과 '약점 공략'에 사용)
export const OPP_ARCH = [
  { id: 'moon', name: '문발리형', bias: { moon_volley: 18, topspin_lob: 12, def_lob: 10, c_moon: 8, power: -10, c_power: -12 }, pref: 'moon' },
  { id: 'slice', name: '슬라이스형', bias: { fh_slice: 16, bh_slice: 18, chip_return: 14, c_slice: 10, c_lob: -12 }, pref: 'slice' },
  { id: 'power', name: '강타형', bias: { fh_drive: 16, first_serve: 14, power: 16, smash: 10, c_drop: -14, c_slice: -10 }, pref: 'power' },
  { id: 'net', name: '전위형', bias: { fh_volley: 14, bh_volley: 14, poach: 18, swing_volley: 10, c_lob: -14, c_moon: -10 }, pref: 'dash' },
  { id: 'wall', name: '수비형', bias: { def_lob: 14, c_power: 10, c_angle: 12, c_body: 12, first_step: 10, fh_drive: -8, smash: -10 }, pref: 'none' },
];

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const GIVEN = ['지은', '미영', '수진', '현주', '은정', '소영', '혜진', '민지', '유나', '선영', '정아', '보람', '세라', '다희', '나연', '예린', '희정', '경아', '주희', '수빈', '하린', '아름', '진아', '서연'];
export function randomName(rng) { return SURNAMES[Math.floor(rng() * SURNAMES.length)] + GIVEN[Math.floor(rng() * GIVEN.length)]; }
export const CLUB_NAMES = ['해솔클럽', '은빛클럽', '푸른숲TC', '달빛클럽', '바람개비', '노을테니스', '새벽이슬', '한빛클럽', '라온TC', '청솔회', '산들클럽', '다온TC'];

// ── 대회 달력 (가상 대회명) ────────────────────────────────
const LOCAL_NAMES = ['해솔구청장배', '은빛시장배', '푸른숲 클럽연합배', '달빛구 친선대회', '한강 새봄배', '산들 단풍배', '라온 시민배', '청솔배', '다온 우정배', '노을 생활체육대회', '은하 구민배', '바람개비 친선배'];
const NATIONAL_NAMES = ['전국 은하수배', '전국 바람개비배', '전국 한빛배', '전국 노을배', '연맹회장배 전국대회', '전국 매화배', '전국 단풍배', '전국 해오름배', '전국 미리내배'];
export const NATIONAL_WEEKS = [9, 19, 29, 37, 45];
// 코트 재질. 내가 치던 코트(하드)와 다르면 낯설다.
export const SURFACES = { hard: '하드', clay: '클레이', turf: '인조잔디' };
export const HOME_SURFACE = 'hard';
function pickSurface(rng, type) {
  const x = rng();
  return type === 'national' ? (x < 0.5 ? 'hard' : x < 0.8 ? 'turf' : 'clay') : (x < 0.35 ? 'hard' : x < 0.75 ? 'turf' : 'clay');
}

export function buildCalendar(rng, seasons = 3) {
  const list = [];
  for (let s = 0; s < seasons; s++) {
    let ln = 0, nn = 0;
    for (let w = 1; w <= 51; w += 2) { // 1턴 = 2주
      const abs = s * 52 + w;
      const winter = w >= 47 || w <= 2;
      if (NATIONAL_WEEKS.includes(w)) {
        list.push({ id: `t${abs}n`, week: abs, day: rng() < 0.5 ? 5 : 6, type: 'national', surface: pickSurface(rng, 'national'), draw: rng() < 0.35 ? 128 : 64, name: NATIONAL_NAMES[(nn++ + s * 3) % NATIONAL_NAMES.length] });
      } else if (!winter && abs >= 7 && (rng() < 0.3 || abs === 7)) { // 첫 대회는 4턴째(7주)의 비전국대회
        list.push({ id: `t${abs}l`, week: abs, day: rng() < 0.5 ? 5 : 6, type: 'local', surface: abs === 7 ? HOME_SURFACE : pickSurface(rng, 'local'), draw: 32, name: LOCAL_NAMES[(ln++ + s * 5) % LOCAL_NAMES.length] });
      }
    }
  }
  return list;
}

export const POINTS = {
  local: { W: 100, F: 60, SF: 35, QF: 20, R16: 12, R32: 8, G: 5 },
  national: { W: 300, F: 180, SF: 105, QF: 60, R16: 35, R32: 24, R64: 18, R128: 14, G: 10 },
};
// 대회에서 남는 것: 경험, 인맥, 상품 (우마무스메의 SP, 팬, 신발·꽃장식 자리)
export const TOUR_EXP = {
  local: { W: 60, F: 44, SF: 34, QF: 26, R16: 20, R32: 16, G: 12 },
  national: { W: 110, F: 85, SF: 65, QF: 50, R16: 40, R32: 32, R64: 26, R128: 22, G: 16 },
};
export const TOUR_FAME = {
  local: { W: 12, F: 8, SF: 5, QF: 3, R16: 1, R32: 1, G: 0 },
  national: { W: 30, F: 18, SF: 12, QF: 8, R16: 4, R32: 2, R64: 1, R128: 1, G: 0 },
};
export const PRIZES = {
  W: ['새 라켓', '테니스 가방'], F: ['테니스화 교환권', '스트링 세트'], SF: ['스트링 세트', '공 한 박스'], QF: ['공 한 박스', '오버그립 묶음'],
  rest: ['대회 수건', '공 한 캔', '양말'],
};
export const STAGE_NAME = { W: '우승', F: '준우승', SF: '4강', QF: '8강', R16: '16강', R32: '32강', R64: '64강', R128: '128강', G: '예선 탈락' };

export const SEASON_NAMES = ['봄', '여름', '가을', '겨울'];
export function weekInfo(week) {
  const season = Math.ceil(week / 52);
  const w = ((week - 1) % 52) + 1;
  const q = Math.min(3, Math.floor((w - 1) / 13));
  const month = Math.ceil(w / 4);
  return { season, w, quarter: SEASON_NAMES[q], month, label: `${season}년차 ${SEASON_NAMES[q]} · ${w}주` };
}

export const COACH_SECRETS = [
  { at: 30, id: 'sv', name: '서브 앤 발리', text: '서브 넣고 첫 발리까지 한 호흡이야. 해 봐.', stats: { first_serve: 3, fh_volley: 3, half_volley: 3 }, unlock: 'serve_volley' },
  { at: 60, id: 'lobnet', name: '로브 후 네트 점령', text: '로브 띄우고 둘이 같이 올라가. 그게 복식이야.', stats: { topspin_lob: 4, positioning: 3, smash: 2 }, unlock: 'lob_net' },
  { at: 90, id: 'slice', name: '낮고 깊은 슬라이스', text: '네트 위 한 뼘. 그 높이를 몸에 새겨.', stats: { bh_slice: 5, fh_slice: 4, depth: 3 }, unlock: 'deep_slice' },
];

export const ENDINGS = [
  { id: 'queen', name: '국화부의 여왕', text: '국화부 전국대회 우승, 그리고 랭킹 1위. 이제 다들 당신을 보고 테니스를 시작한다.' },
  { id: 'gukwha_champ', name: '국화부 우승자', text: '국화부 시상대 맨 위. 개나리 시절 첫 레슨이 아득하다.' },
  { id: 'gukwha', name: '국화가 된 사람', text: '개나리를 졸업하고 국화가 되었다. 우승은 아직이지만, 다음 시즌이 기다려진다.' },
  { id: 'local_hero', name: '비전국의 강자', text: '동네 대회는 다 휩쓸었다. 전국대회만 나가면… 왜일까?' },
  { id: 'partner', name: '평생 파트너', text: '코트 위에서 눈빛만 봐도 아는 사이. 우리 둘이면 어디든 간다.' },
  { id: 'coach', name: '코치의 길', text: '코치님의 뒤를 이어 레슨을 시작했다. 첫 수강생은 회사 후배.' },
  { id: 'club_head', name: '클럽 회장', text: '어느새 클럽의 중심. 정모 공지는 이제 내가 쓴다.' },
  { id: 'exec', name: '임원 승진, 테니스는 취미로', text: '회사에서는 승승장구. 주말 테니스는 여전히 즐겁다.' },
  { id: 'warrior', name: '주말의 전사', text: '평일엔 일, 주말엔 코트. 둘 다 놓치지 않았다.' },
  { id: 'injury', name: '부상 은퇴', text: '몸이 먼저 신호를 보냈다. 라켓은 잠시 벽에 걸어 둔다.' },
  { id: 'burnout', name: '번아웃', text: '너무 달렸다. 지금은 쉬는 게 먼저다.' },
  { id: 'love', name: '그냥 테니스가 좋아', text: '성적이 뭐 어때. 오늘도 코트에 나간다.' },
];
