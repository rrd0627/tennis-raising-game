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
];
