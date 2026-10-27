// 단어 데이터 구조와 생성/정규화
import { normalizeProfile } from './profile.js';

export const POS_OPTIONS = [
  { value: 'n', label: '명사' },
  { value: 'v', label: '동사' },
  { value: 'adj', label: '형용사' },
  { value: 'adv', label: '부사' },
  { value: 'prep', label: '전치사' },
  { value: 'conj', label: '접속사' },
  { value: 'phr', label: '숙어' },
];
export const POS_LABEL = Object.fromEntries(POS_OPTIONS.map((p) => [p.value, p.label]));

export const TONE_OPTIONS = [
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
  { value: 'neutral', label: '중립' },
];
export const TONE_LABEL = Object.fromEntries(TONE_OPTIONS.map((t) => [t.value, t.label]));

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // http(비보안) 환경 대비
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function splitList(text) {
  if (Array.isArray(text)) return text.map((s) => String(s).trim()).filter(Boolean);
  return String(text || '')
    .split(/[,;/\n]|、/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function emptyStats() {
  return { shown: 0, correct: 0, wrong: 0, lastShownAt: null, lastWrongAt: null };
}

export function emptyNote() {
  return { inNote: false, streak: 0, enteredAt: null, graduatedAt: null, graduations: 0, confusedWith: {} };
}

// 입력값(부분 필드)을 완전한 단어 객체로 만든다. 기존 기록(stats/note)은 유지.
export function normalizeWord(input, now = Date.now()) {
  return {
    id: input.id || uid(),
    word: String(input.word || '').trim(),
    meanings: splitList(input.meanings),
    pos: input.pos || '',
    tone: input.tone || '',
    nuance: (input.nuance || '').trim(),
    form: (input.form || '').trim(), // 본문 형태 (지문에 나온 형태, 예: settlements)
    related: (input.related || '').trim(), // 관련 표현·숙어 (예: mutually exclusive: 상호 배타적인)
    memo: (input.memo || '').trim(), // 기타 메모 (강세 등). 문제에는 쓰지 않음
    definition: (input.definition || '').trim(), // 영영 뜻풀이 (자동 채우기)
    example: (input.example || '').trim(),
    exampleKo: (input.exampleKo || '').trim(),
    synonyms: splitList(input.synonyms),
    antonyms: splitList(input.antonyms),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    sources: { ...(input.sources || {}) }, // 칸별 출처: mw | fd | ai | user
    stats: { ...emptyStats(), ...(input.stats || {}) },
    readd: { count: 0, lastAt: null, ...(input.readd || {}) }, // 이미 있는 단어를 다시 넣은 횟수 (가중치 ↑)
    note: { ...emptyNote(), ...(input.note || {}), confusedWith: { ...(input.note?.confusedWith || {}) } },
    // 뉘앙스 프로필 (profile.js). null = 예전 데이터라 아직 변환 안 됨 → 설정의 데이터 정리에서 변환
    profile: normalizeProfile(input.profile),
    // '뉘앙스까지 떠오름'이라고 했는데 뉘앙스 문제를 틀린 '착각 단어' 기록
    illusion: { count: 0, lastAt: null, ...(input.illusion || {}) },
    // AI가 미리 만들어 둔 풀 (pools.js): 예문 풀, 헷갈리는 단어, 문법 정보
    ai: normalizeAi(input.ai),
  };
}

// AI 생성 콘텐츠 풀
//  examples: [{ id, en, ko, why, uses, lastUsedAt }]  — why: 이 문장에서 이 단어가 맞는 이유
//  userExample: { why, uses, lastUsedAt }              — 내가 입력한 원래 예문(word.example)의 사용 기록
//  confusables: [{ word, pos, meanings[], forms{}, type, why, transitivity, pattern, level }]
//  grammar: { transitivity, pattern, level, forms: { s, ed, en, ing } }
export function normalizeAi(a) {
  const x = a || {};
  return {
    examples: Array.isArray(x.examples) ? x.examples : [],
    userExample: { why: '', uses: 0, lastUsedAt: null, ...(x.userExample || {}) },
    confusables: Array.isArray(x.confusables) ? x.confusables : [],
    grammar: x.grammar || null,
    generatedAt: x.generatedAt || null,
    examplesAt: x.examplesAt || null,
    lastAttemptAt: x.lastAttemptAt || null,
  };
}

// tone이 비어 있으면 뉘앙스 메모에서 '긍정/부정/중립' 중 하나만 등장할 때 그 값을 사용
export function effectiveTone(word) {
  if (word.tone) return word.tone;
  const t = word.nuance || '';
  const hits = [
    ['positive', /긍정/],
    ['negative', /부정/],
    ['neutral', /중립/],
  ].filter(([, re]) => re.test(t));
  return hits.length === 1 ? hits[0][0] : '';
}

// 뜻이 없는 단어는 출제·오답 보기에서 제외
export const hasMeaning = (w) => w.meanings.length > 0;
// '미완성' = 뜻·뉘앙스·예문 중 하나라도 비어 있음 → 일괄 자동 채우기 대상
export const isIncomplete = (w) => !w.meanings.length || !w.nuance || !w.example;

export function errorRate(word) {
  return word.stats.shown ? word.stats.wrong / word.stats.shown : 0;
}

export const sameWord = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// 서로 유의어로 등록된 단어(한쪽만 적어도 인정)
export function registeredSynonyms(word, all) {
  const mine = new Set(word.synonyms.map((s) => s.toLowerCase()));
  const me = word.word.toLowerCase();
  return all.filter(
    (w) => w.id !== word.id && (mine.has(w.word.toLowerCase()) || w.synonyms.some((s) => s.toLowerCase() === me)),
  );
}

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
