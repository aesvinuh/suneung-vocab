// ─────────────────────────────────────────────────────────────
// 출제 가중치: 다음에 나올 단어를 고르는 로직은 전부 이 파일에 있음.
// 출제 경향을 바꾸고 싶으면 WEIGHT_CONFIG 숫자만 고치면 됨.
//
//   weight = max(minWeight,
//              recency      최근에 추가된 단어 보너스
//            + error        오답률 보너스
//            + staleness    마지막 출제 후 경과 시간 보너스
//            + readd        이미 있는 단어를 다시 넣은 횟수 보너스
//            + illusion     착각 단어 보너스 ('뉘앙스까지 떠오름'이라고 했는데 뉘앙스 문제를 틀림)
//            + noteBonus)   (오답 노트 모드) 틀린 횟수 보너스
//   단, 최근 cooldown.size 문제 안에 나온 단어는 후보에서 제외.
// ─────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

export const WEIGHT_CONFIG = {
  // 추가 후 holdDays일 동안은 boost 전부, 그 뒤로는 halfLifeDays마다 절반으로 감소
  recency: { boost: 6, holdDays: 2, halfLifeDays: 3 },

  // 오답률은 (오답 + priorWrong) / (출제 + priorShown)로 보정
  // → 한 번도 안 푼 단어는 1/3로 시작, 1번 틀렸다고 오답률 100%가 되지 않음
  error: { factor: 6, priorWrong: 1, priorShown: 3 },

  // 마지막 출제 후 fullDays일이 지나면 factor 전부. 한 번도 안 나온 단어도 factor 전부
  staleness: { factor: 3, fullDays: 10 },

  // 이미 있는 단어를 다시 넣으면 1회당 perTime (최대 maxCount회까지),
  // 마지막으로 다시 넣은 뒤 halfLifeDays마다 절반으로 줄어듦
  readd: { perTime: 1.5, maxCount: 3, halfLifeDays: 7 },

  // 착각 단어: 1회당 perTime (최대 maxCount회), 마지막 착각 뒤 halfLifeDays마다 절반 — 크게 올림
  illusion: { perTime: 5, maxCount: 3, halfLifeDays: 14 },

  // 방금 나온 단어는 최소 size문제 동안 다시 안 나옴 (단어 수가 적으면 자동 축소)
  cooldown: { size: 5 },

  // 아무리 잘 아는 단어라도 이 값 이상 → 가끔은 출제됨
  minWeight: 0.5,

  // 오답 노트 모드 전용: 틀린 횟수 1회당 perWrong 추가 (최대 maxWrong회까지 반영)
  wrongNote: { perWrong: 1.5, maxWrong: 8 },
};

// 오답 노트 졸업 조건
export const GRADUATION = {
  streak: 3, // 노트에 있는 동안 연속 정답 횟수
  // false면 '오답 노트 학습'에서 맞힌 것만 연속 정답으로 셈.
  // true면 일반 학습에서 맞힌 것도 셈.
  countInNormalMode: false,
};

// 문제 유형별 출제 비율 (해당 단어에 가능한 유형 중에서 이 비율로 랜덤)
export const TYPE_WEIGHTS = {
  meaning: 3, // 단어 → 뜻
  blank: 2, // 예문 빈칸 → 단어
  underline: 2, // 예문 밑줄 → 문맥상 의미
  synonym: 2, // 유의어 중 문맥에 맞는 단어
  nuance: 1.5, // 단어 → 뉘앙스
  self: 1.5, // 자기평가 카드
};

export function weightParts(word, { now = Date.now(), mode = 'normal' } = {}) {
  const c = WEIGHT_CONFIG;
  const s = word.stats;

  const ageDays = Math.max(0, (now - word.createdAt) / DAY);
  const decayDays = Math.max(0, ageDays - c.recency.holdDays);
  const recency = c.recency.boost * Math.pow(0.5, decayDays / c.recency.halfLifeDays);

  const errorRate = (s.wrong + c.error.priorWrong) / (s.shown + c.error.priorShown);
  const error = c.error.factor * errorRate;

  const sinceDays = s.lastShownAt ? (now - s.lastShownAt) / DAY : Infinity;
  const staleness = c.staleness.factor * Math.min(1, sinceDays / c.staleness.fullDays);

  const r = word.readd || { count: 0, lastAt: null };
  const readd = r.count && r.lastAt
    ? c.readd.perTime * Math.min(r.count, c.readd.maxCount) * Math.pow(0.5, Math.max(0, now - r.lastAt) / DAY / c.readd.halfLifeDays)
    : 0;

  const il = word.illusion || { count: 0, lastAt: null };
  const illusion = il.count && il.lastAt
    ? c.illusion.perTime * Math.min(il.count, c.illusion.maxCount) * Math.pow(0.5, Math.max(0, now - il.lastAt) / DAY / c.illusion.halfLifeDays)
    : 0;

  const noteBonus =
    mode === 'note' ? c.wrongNote.perWrong * Math.min(s.wrong, c.wrongNote.maxWrong) : 0;

  const raw = recency + error + staleness + readd + illusion + noteBonus;
  return { recency, error, staleness, readd, illusion, noteBonus, total: Math.max(c.minWeight, raw) };
}

export function computeWeight(word, opts) {
  return weightParts(word, opts).total;
}

// recentIds: 최근에 출제된 단어 id (최신이 앞)
export function pickNextWord(pool, { recentIds = [], now = Date.now(), mode = 'normal', rng = Math.random } = {}) {
  if (pool.length === 0) return null;
  const k = Math.min(WEIGHT_CONFIG.cooldown.size, pool.length - 1);
  const blocked = new Set(recentIds.slice(0, k));
  const candidates = pool.filter((w) => !blocked.has(w.id));

  const weights = candidates.map((w) => computeWeight(w, { now, mode }));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export function pickWeighted(entries, rng = Math.random) {
  // entries: [[value, weight], ...]
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * sum;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}
