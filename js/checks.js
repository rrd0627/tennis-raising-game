// 확인 링크(?check)에 나오는 장면들. 플레이어가 만나는 순서대로 적는다.
// make(s): 새 게임 상태를 그 장면으로 맞춘다. force: 다음 행동의 결과를 정해 둔다.
const ready = (s, week = 45) => {
  s.week = week;
  s.unlocked = { practice: true, club: true, home: true, gym: true };
  s.storiesDone = ['club_visit', 'join_club', 'first_ache', 'sumin_gym'];
  s.goalIdx = 1; s.goalsDone = ['first'];
  s.fatigue = 20; s.stress = 20;
  for (const id of ['daeun', 'jiwoo']) { s.partners[id].known = true; s.partners[id].aff = 20; }
  s.faces = { lesson: ['sumin'], gym: [], practice: ['jiwoo'], club: ['sunhee', 'daeun'], home: [] };
};
// 대회 장면은 실력을 맞춰 둔다
const strong = (s, v = 45) => { for (const id of Object.keys(s.stats)) s.stats[id] = v; for (const k of Object.keys(s.partners)) s.partners[k].level = Math.max(s.partners[k].level, v); };
const bonded = (s, id, aff = 85) => { s.partners[id].aff = aff; s.partners[id].storyStep = 2; };

export const CHECKS = [
  { group: '1. 사람과 칸 (3주차부터)', label: '3주차: 첫 선택', hint: '버튼 6개를 보고 훈련을 눌러 보세요. 처음엔 레슨만 열려 있어요.', make: s => { s.week = 3; s.faces.lesson = ['hana']; } },
  { group: '1. 사람과 칸 (3주차부터)', label: '칸 5개가 모두 열린 턴', hint: '훈련을 눌러 칸마다 와 있는 사람, 오를 수치, 힘든 정도를 비교해 보세요.', make: s => ready(s) },
  { group: '1. 사람과 칸 (3주차부터)', label: '호흡이 맞기 시작하는 순간', hint: '친밀도 80을 넘었을 때 나오는 장면이에요.', make: s => { ready(s); s.pendingEvents = [{ id: 'bond', pid: 'hana', step: 1 }]; } },
  { group: '1. 사람과 칸 (3주차부터)', label: '호흡 훈련', hint: '훈련 → 벽치기를 고르세요. 김하나 얼굴이 빛나요.', make: s => { ready(s); bonded(s, 'hana'); s.faces.practice = ['hana', 'jiwoo']; s.lastSpot = 'practice'; } },
  { group: '1. 사람과 칸 (3주차부터)', label: '호흡이 맞는 사람과 대회 나가기', hint: '대회 → 김하나에게 연락하세요. 대회 첫 화면에 표시돼요.', make: s => { ready(s); bonded(s, 'hana', 90); s.week = s.calendar.find(t => t.week >= 9 && t.type === 'local').week; } },

  { group: '2. 몸과 마음 (3주차부터)', label: '많이 지친 턴', hint: '훈련을 눌러 칸마다 실패 위험을 보세요. 위쪽 체력 바도 줄어 있어요.', make: s => { ready(s); s.fatigue = 70; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '몸이 안 좋은데 같이 치자는 연락', hint: '나간다, 못 나간다 중에 골라 보세요.', make: s => { ready(s); s.fatigue = 62; s.pendingEvents = [{ id: 'callout', pid: 'sunhee' }]; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '무리해서 제대로 운동이 안 된 턴', hint: '훈련 → 레슨을 고르세요.', make: s => { ready(s); s.fatigue = 75; s.force = { fail: 'flop' }; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '무리해서 멘탈이 흔들린 턴', hint: '훈련 → 레슨을 고르세요.', make: s => { ready(s); s.fatigue = 75; s.force = { fail: 'doubt' }; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '무리해서 입스가 온 턴', hint: '훈련 → 레슨을 고르세요.', make: s => { ready(s); s.fatigue = 75; s.force = { fail: 'yips' }; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '무리해서 다친 턴, 그 뒤 병원', hint: '훈련 → 레슨을 고르세요. 다음 턴에 병원 버튼이 열려요.', make: s => { ready(s); s.fatigue = 75; s.force = { fail: 'injury' }; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '연습한 대로 잘 나온 턴', hint: '훈련 → 클럽 게임을 고르세요. 기분이 올라가요.', make: s => { ready(s); s.lastSpot = 'club'; s.force = { feel: 'good' }; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '되는 줄 알았는데 안 나온 턴', hint: '훈련 → 클럽 게임을 고르세요. "이제 좀 되는지도?"가 "왜 이렇게 어렵지?"로 바뀌어요.', make: s => { ready(s); s.lastSpot = 'club'; s.conds.sure = 3; s.condition = 1; s.force = { feel: 'bad' }; } },
  { group: '2. 몸과 마음 (3주차부터)', label: '여행으로 마음 비우기', hint: '가족·친구를 고르세요. 위쪽의 나쁜 상태가 풀려요.', make: s => { ready(s); s.conds.doubt = 3; s.conds.yips = 4; s.stress = 60; s.condition = -1; s.force = { outing: 'trip' }; } },

  { group: '3. 첫 대회 (7주차)', label: '낯선 코트와 낯선 상대', hint: '오늘의 환경과 작전 4개를 보세요. 경기를 해 봐도 돼요.', make: (s, G) => { ready(s); strong(s); const tr = G.checkTour(s, 'local', null, 'clay'); const o = tr.group.opps[0]; if (o) { o.arch = 'slice'; o.archName = '슬라이스형'; } return 'tourIntro'; } },
  { group: '3. 첫 대회 (7주차)', label: '강타형을 끈질기게 뒤집기', hint: '로브로 천천히를 고르고 시작하세요. 초반에 밀리다 뒤집으면 큰 글자가 떠요. 결과는 매번 달라요.', make: (s, G) => { ready(s); strong(s, 48); const tr = G.checkTour(s, 'local'); for (const o of [...tr.group.opps, ...tr.ko]) { o.arch = 'power'; o.archName = '강타형'; o.rating = 45; } return 'tourIntro'; } },
  { group: '3. 첫 대회 (7주차)', label: '우승 뒤 축하 자리', hint: '화면을 눌러 넘기세요. 결과, 축하 자리, 대회에서 남은 것 순서예요.', make: (s, G) => { ready(s); G.checkTour(s, 'local', 'W'); return 'tourResult'; } },
  { group: '3. 첫 대회 (7주차)', label: '4강 입상 뒤 축하 자리', hint: '화면을 눌러 넘기세요.', make: (s, G) => { ready(s); G.checkTour(s, 'local', 'SF'); return 'tourResult'; } },
  { group: '3. 첫 대회 (7주차)', label: '예선 탈락 뒤', hint: '축하 자리 없이 지나가요.', make: (s, G) => { ready(s); G.checkTour(s, 'local', 'G'); return 'tourResult'; } },
  { group: '3. 첫 대회 (7주차)', label: '개나리 전국대회 우승, 국화 승급', hint: '화면을 눌러 넘기세요.', make: (s, G) => { ready(s); G.checkTour(s, 'national', 'W'); return 'tourResult'; } },
  { group: '3. 첫 대회 (7주차)', label: '입상 뒤 같이 나가자는 연락', hint: '같이 나간다, 거절한다 중에 골라 보세요.', make: s => { ready(s); const t = s.calendar.find(x => x.week > 45); s.pendingEvents = [{ id: 'invite', tid: t.id, pid: 'sunhee', after: { name: '해솔구청장배', stage: 'SF' } }]; } },

  { group: '4. 첫 대회 뒤 (기술)', label: '누가 뭔가 알려 줄 것 같은 칸', hint: '훈련을 눌러 얼굴 위 ! 표시를 보세요. 그 칸을 고르면 기술 힌트가 나와요.', make: s => { ready(s); s.faces.club = ['sunhee']; s.hintAt = { club: { skill: 'drop', who: 'sunhee' } }; s.lastSpot = 'lesson'; } },
  { group: '4. 첫 대회 뒤 (기술)', label: '코치가 알려 주는 레슨', hint: '훈련 → 레슨을 고르세요. 버튼에 ! 표시가 있어요.', make: s => { ready(s); s.hintAt = { lesson: { skill: 'smash', who: 'coach' } }; } },
  { group: '4. 첫 대회 뒤 (기술)', label: '치다 보니 자연스럽게 알게 된 턴', hint: '훈련 → 벽치기를 고르세요.', make: s => { ready(s); s.lastSpot = 'practice'; s.force = { hint: 'drop' }; } },
  { group: '4. 첫 대회 뒤 (기술)', label: '경험으로 기술 배우기', hint: '기술 버튼을 누르세요. 배워도 턴은 그대로예요.', make: s => { ready(s); s.hints = { drop: 2, smash: 1, read: 1 }; s.exp = 220; } },
  { group: '4. 첫 대회 뒤 (기술)', label: '기술을 모두 배운 뒤 경기', hint: '경기를 시작하고 중계로 보세요. 기술이 통하면 이름이 크게 떠요. 끝나면 쓴 기술 횟수가 나와요.', make: (s, G) => { ready(s); strong(s, 48); s.skills = { drop: 2, smash: 2, swing: 2, read: 2 }; s.hints = { drop: 2, smash: 2, swing: 2, read: 2 }; G.checkTour(s, 'local'); return 'tourIntro'; } },
];
