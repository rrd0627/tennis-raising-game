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

// ── 1주에 행동 하나 ───────────────────────────────────────
// groups: 능력치 계열별 성장 비율. tennis: 부상 위험이 있는 훈련. 대회 출전은 화면에서 따로 처리한다.
export const ACTIONS = [
  { id: 'stroke', name: '스트로크', icon: '🎾', train: true, tennis: true, groups: { stroke: 1, course: 0.7 }, fatigue: 18, stress: 1 },
  { id: 'net', name: '네트', icon: '🏐', train: true, tennis: true, groups: { net: 1, counter: 0.5 }, fatigue: 18, stress: 1 },
  { id: 'serve', name: '서브·리턴', icon: '💥', train: true, tennis: true, groups: { serve: 1, counter: 0.25, course: 0.25 }, fatigue: 16, stress: 1 },
  { id: 'physical', name: '피지컬', icon: '💪', train: true, tennis: true, groups: { physical: 1 }, fatigue: 22, stress: 1 },
  { id: 'mental', name: '멘탈', icon: '🧘', train: true, groups: { mental: 0.8, tactics: 0.7, counter: 0.2 }, fatigue: 12, stress: -2 },
  { id: 'rest', name: '휴식', icon: '😴', fatigue: -45, stress: -8 },
  { id: 'family', name: '가족·친구', icon: '🏠', fatigue: -10, stress: -30 },
  { id: 'overtime', name: '야근', icon: '💼', fatigue: 10, stress: 10, work: 4 },
];
export const ACT = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
export const TRAIN_IDS = ACTIONS.filter(a => a.train).map(a => a.id);

export const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

// 시나리오 목표. by 주까지 달성한다.
export const GOALS = [
  { id: 'first', by: 13, text: '1년차 봄까지 첫 대회 나가 보기' },
  { id: 'local_sf', by: 39, text: '1년차 가을까지 비전국대회 4강' },
  { id: 'promote', by: 104, text: '2년차 말까지 개나리부 전국대회 우승' },
  { id: 'promote_late', by: 156, text: '3년차 말까지 개나리부 전국대회 우승' },
  { id: 'champion', by: 156, text: '3년차 말까지 국화부 대회 우승' },
];

// 인트로 컷 (임시 그림. 컷 그림만 나중에 바꾼다)
export const INTRO_SCENES = [
  { icon: '⏰', bg: '#2c3550', text: '오전 6시 50분. 오늘도 알람이 울린다.' },
  { icon: '🚇', bg: '#46536b', text: '출근 지하철. 어제랑 같은 칸, 같은 자리.' },
  { icon: '💻', bg: '#1b2130', text: '밤 9시. 사무실엔 모니터 불빛만 남았다.' },
  { icon: '🌃', bg: '#22384f', text: '퇴근길. 어디선가 톡, 톡, 공 소리가 들린다.' },
  { icon: '🎾', bg: '#2f8a5b', text: '조명 켜진 코트. 나도… 저거 해 보고 싶다.' },
  { icon: '📱', bg: '#c9772e', text: '다음 날 점심시간. 테니스 레슨을 등록했다.' },
];

// ── 파트너 (여자 복식) ─────────────────────────────────────
export const PARTNERS = [
  { id: 'hana', name: '김하나', arch: '테니스 입문 동기', style: '올라운드', div: '개나리', level: 17, growth: 0.32, aff: 25, known: true,
    bias: {}, color: { hair: '#5a3a2a', outfit: '#ffb3c7' }, line: '우리 같이 크는 거야!' },
  { id: 'sunhee', name: '박선희', arch: '클럽 고인물 선배', style: '로브·슬라이스 수비형', div: '개나리', level: 40, growth: 0.04, aff: 12, known: true,
    bias: { def_lob: 18, topspin_lob: 14, fh_slice: 14, bh_slice: 16, c_lob: 10, power: -12, first_serve: -10 }, color: { hair: '#2b2b2b', outfit: '#9ad0a8' }, line: '공은 넘기기만 하면 돼~' },
  { id: 'sumin', name: '이수민', arch: '같은 회사 동기', style: '올라운드', div: '개나리', level: 22, growth: 0.16, aff: 30, known: true,
    bias: {}, color: { hair: '#7a4b2a', outfit: '#a8c8ff' }, line: '팀장님 몰래 연습 가자.' },
  { id: 'daeun', name: '정다은', arch: '전위 장인', style: '포치·발리형 전위', div: '개나리', level: 37, growth: 0.07, aff: 0, known: false, meet: 'club',
    bias: { fh_volley: 16, bh_volley: 14, poach: 20, smash: 10, drive: 10, def_lob: -10 }, color: { hair: '#c0473a', outfit: '#ffd166' }, line: '앞은 내가 다 먹을게.' },
  { id: 'jiwoo', name: '한지우', arch: '대학생 유망주', style: '스피드형', div: '개나리', level: 26, growth: 0.27, aff: 0, known: false, meet: 'bungae',
    bias: { speed: 18, first_step: 14, stamina: 10, composure: -12 }, color: { hair: '#3a2a5a', outfit: '#b5f0e0' }, line: '언니 저 시험 끝나면 다 나가요!', exams: [15, 16, 41, 42] },
  { id: 'arah', name: '서아라', arch: '라이벌 팀 이적생', style: '공격형', div: '개나리', level: 44, growth: 0.08, aff: 0, known: false, meet: 'rival',
    bias: { fh_drive: 16, power: 14, swing_volley: 14, composure: -10, comm: -8 }, color: { hair: '#1e1e2a', outfit: '#ff8a5c' }, line: '이길 거면 같이 해.' },
  { id: 'mikyung', name: '오미경', arch: '은퇴 후 복귀한 베테랑', style: '노련한 전술형', div: '국화', level: 58, growth: 0, aff: 0, known: false, meet: 'club2',
    bias: { shot_sel: 16, positioning: 16, composure: 18, clutch: 14, speed: -14, stamina: -10 }, color: { hair: '#8a8a8a', outfit: '#c9b6ff' }, line: '급할수록 한 박자 늦게.' },
  { id: 'yujin', name: '최유진', arch: '선수 출신 에이스', style: '파워·서브형', div: '국화', level: 70, growth: 0.02, aff: 0, known: false, meet: 'national',
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
export const NATIONAL_WEEKS = [6, 11, 16, 21, 29, 33, 37, 41, 45];

export function buildCalendar(rng, seasons = 3) {
  const list = [];
  for (let s = 0; s < seasons; s++) {
    let ln = 0, nn = 0;
    for (let w = 1; w <= 52; w++) {
      const abs = s * 52 + w;
      const winter = w >= 47 || w <= 2;
      if (NATIONAL_WEEKS.includes(w)) {
        list.push({ id: `t${abs}n`, week: abs, day: rng() < 0.5 ? 5 : 6, type: 'national', name: NATIONAL_NAMES[(nn++ + s * 3) % NATIONAL_NAMES.length] });
      } else if (!winter && (rng() < 0.4 || abs === 4)) { // 첫 달에는 반드시 비전국대회가 열린다
        list.push({ id: `t${abs}l`, week: abs, day: rng() < 0.5 ? 5 : 6, type: 'local', name: LOCAL_NAMES[(ln++ + s * 5) % LOCAL_NAMES.length] });
      }
    }
  }
  return list;
}

export const POINTS = { local: { W: 100, F: 60, SF: 35, QF: 20, R16: 12, G: 5 }, national: { W: 300, F: 180, SF: 105, QF: 60, R16: 35, G: 15 } };
export const STAGE_NAME = { W: '우승', F: '준우승', SF: '4강', QF: '8강', R16: '16강', G: '예선 탈락' };

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
