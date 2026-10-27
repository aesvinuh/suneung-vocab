// ─────────────────────────────────────────────────────────────
// 오답 선지 만들기: 조건은 전부 이 파일에 있다. 바꾸고 싶으면 DISTRACTOR_RULES와 아래 함수들을 고치면 됨.
//
// 반드시 지키는 조건 (하나라도 어긋나면 후보에서 제외)
//   · 품사 일치 (정답 품사를 모르면 한국어 뜻 형태로 대신 판단)
//   · 뜻 고르기: 한국어 뜻도 같은 형태 (동사 "~다", 형용사 "~한/~적인", 부사 "~게/~히", 명사)
//   · 빈칸: 오답도 정답과 같은 활용형으로 변형 (-s, -ed, -ing …). 변형할 수 없으면 제외
//   · 정답과 같은 뜻·유의어(빈칸에 들어가도 말이 되는 단어)는 제외
//   · 정답이 수능 수준(level ≥ 3)이면 기초 단어(level ≤ 1)는 제외
// 고를 때 우선하는 조건 (점수)
//   · 내 단어장 단어 → 그다음 AI 헷갈리는 단어 풀
//   · 타동사/자동사, 뒤에 오는 구조(전치사·to부정사·that절)가 같은 단어
//   · 난이도가 비슷한 단어, 뜻 범위가 비슷한 단어, 예전에 헷갈렸던 단어
// 조건에 맞는 오답이 3개 미만이면 null → 그 문제 유형은 출제하지 않음
// ─────────────────────────────────────────────────────────────
import { registeredSynonyms } from './word.js';

export const DISTRACTOR_RULES = {
  count: 3, // 필요한 오답 수
  basicLevel: 1, // 이 이하 = 기초 단어
  advancedLevel: 3, // 정답이 이 이상이면 기초 단어 제외
  score: {
    mine: 10, // 내 단어장 우선
    sameTransitivity: 2,
    samePattern: 2,
    levelClose: 1.5, // 난이도 차이 0이면 +1.5, 1이면 +1, 2 이상이면 0
    meaningSimilarity: 3, // 뜻 범위 (한글 2글자 조각 겹침 비율 × 3)
    confusedBefore: 0.7, // 예전에 이 단어와 헷갈린 횟수당 (최대 3회)
    jitter: 2, // 매번 같은 보기만 나오지 않게 섞는 정도
  },
};

// ── 한국어 뜻 형태 ──
// 'da' 동사·형용사 기본형(~다) / 'mod' 꾸밈형(~한, ~적인, ~는) / 'adv' 부사형(~게, ~히) / 'noun'
export function koForm(meaning) {
  const t = String(meaning).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[~.…\s]+$/g, '').trim();
  const last = t.slice(-1);
  if (!last) return '';
  if (last === '다') return 'da';
  const code = last.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) {
    const jong = code % 28;
    if (jong === 4 || last === '는' || last === '의' || last === '던') return 'mod'; // 받침 ㄴ: 한, 적인, 운, 은
    if (last === '게' || last === '히') return 'adv';
  }
  return 'noun';
}

// 정답 뜻에서 대표 형태(첫 뜻의 형태)와 같은 뜻만 골라 보기 문구로
export function meaningLabelIn(meanings, form, max = 3) {
  const same = meanings.filter((m) => koForm(m) === form);
  return same.slice(0, max).join(', ');
}
export const mainForm = (meanings) => (meanings.length ? koForm(meanings[0]) : '');

// ── 영어 활용형 ──
const oneSyllableCVC = (w) => /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w);
function regular(base, kind) {
  const b = base;
  if (kind === 's') return /[^aeiou]y$/.test(b) ? b.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/.test(b) ? b + 'es' : b + 's';
  if (kind === 'ed' || kind === 'en') {
    if (/e$/.test(b)) return b + 'd';
    if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + 'ied';
    if (oneSyllableCVC(b)) return b + b.slice(-1) + 'ed';
    return b + 'ed';
  }
  if (kind === 'ing') {
    if (/ie$/.test(b)) return b.slice(0, -2) + 'ying';
    if (/[^e]e$/.test(b) && b.length > 2) return b.slice(0, -1) + 'ing';
    if (oneSyllableCVC(b)) return b + b.slice(-1) + 'ing';
    return b + 'ing';
  }
  return b;
}

// 문장 속 형태가 기본형의 어떤 활용인지: base | s | ed | en | ing | null(알 수 없음)
export function inflectionKind(base, surface, forms) {
  const b = base.toLowerCase().split(/\s+/)[0];
  const s = surface.toLowerCase().split(/\s+/)[0];
  if (s === b) return 'base';
  if (forms) {
    if (forms.ing && forms.ing.toLowerCase() === s) return 'ing';
    if (forms.ed && forms.ed.toLowerCase() === s) return 'ed';
    if (forms.en && forms.en.toLowerCase() === s) return 'en';
    if (forms.s && forms.s.toLowerCase() === s) return 's';
  }
  for (const k of ['ing', 'ed', 's']) if (regular(b, k) === s) return k;
  // compel → compelled 같은 2음절 강세 중복
  if (s === b + b.slice(-1) + 'ed') return 'ed';
  if (s === b + b.slice(-1) + 'ing') return 'ing';
  return null;
}

// 기본형을 같은 활용으로 바꾸기 (숙어는 첫 단어만). 동사가 아닌데 -s/-ed를 붙여야 하면 null
export function inflectTo(base, kind, { forms, pos } = {}) {
  if (kind === 'base') return base;
  const [head, ...rest] = base.split(/\s+/);
  if (pos && pos !== 'v' && pos !== 'phr' && kind !== 's') return null;
  if (pos === 'adj' || pos === 'adv') return null;
  const known = forms?.[kind] || (kind === 'en' ? forms?.ed : '');
  const w = known || regular(head.toLowerCase(), kind);
  return [w, ...rest].join(' ');
}

const matchCase = (text, like) => (/^[A-Z]/.test(like) ? text[0].toUpperCase() + text.slice(1) : text);

// ── 후보 만들기 (내 단어 + AI 헷갈리는 단어를 같은 모양으로) ──
function grammarOf(w) {
  const g = w.ai?.grammar || {};
  return { transitivity: g.transitivity || '', pattern: g.pattern || '', level: g.level || 0, forms: g.forms || null };
}

function candidatesFor(target, all) {
  const mine = all
    .filter((w) => w.id !== target.id && w.meanings.length)
    .map((w) => ({ key: w.id, word: w.word, pos: w.pos, meanings: w.meanings, ...grammarOf(w), source: 'mine', wordId: w.id }));
  const ai = (target.ai?.confusables || []).map((c, i) => ({
    key: `ai:${target.id}:${i}`,
    word: c.word,
    pos: c.pos || target.pos,
    meanings: c.meanings,
    transitivity: c.transitivity || '',
    pattern: c.pattern || '',
    level: c.level || 0,
    forms: c.forms || null,
    source: 'ai',
    wordId: null,
    confusable: c,
  }));
  const own = new Set(mine.map((c) => c.word.toLowerCase()));
  return [...mine, ...ai.filter((c) => !own.has(c.word.toLowerCase()))];
}

function bigrams(meanings) {
  const set = new Set();
  for (const m of meanings) {
    const t = m.replace(/[\s,.;/()~·…'"-]/g, '');
    if (t.length === 1) set.add(t);
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  }
  return set;
}
function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function baseFilter(target, tg, c) {
  if (c.word.toLowerCase() === target.word.toLowerCase()) return false;
  if (c.meanings.some((m) => target.meanings.includes(m))) return false; // 같은 뜻 → 정답이 둘
  if (target.pos ? c.pos !== target.pos : mainForm(c.meanings) !== mainForm(target.meanings)) return false; // 품사 일치
  const R = DISTRACTOR_RULES;
  if (tg.level >= R.advancedLevel && c.level && c.level <= R.basicLevel) return false; // 기초 단어 제외
  return true;
}

function score(target, tg, c, rng) {
  const S = DISTRACTOR_RULES.score;
  const confused = target.note?.confusedWith || {};
  let s = c.source === 'mine' ? S.mine : 0;
  if (tg.transitivity && c.transitivity === tg.transitivity) s += S.sameTransitivity;
  if (tg.pattern && c.pattern && c.pattern === tg.pattern) s += S.samePattern;
  if (tg.level && c.level) s += Math.max(0, S.levelClose - Math.abs(tg.level - c.level) * 0.5);
  s += similarity(target.meanings, c.meanings) * S.meaningSimilarity;
  if (c.wordId) s += Math.min(confused[c.wordId] || 0, 3) * S.confusedBefore;
  return s + rng() * S.jitter;
}

/**
 * 뜻 고르기·밑줄 문제용: 한국어 뜻 보기
 * @returns {{ correct: option, distractors: option[] } | null}
 */
export function meaningOptions(target, all, rng = Math.random) {
  const form = mainForm(target.meanings);
  const correctLabel = meaningLabelIn(target.meanings, form);
  if (!correctLabel) return null;
  const tg = grammarOf(target);
  const seen = new Set([correctLabel]);
  const picked = candidatesFor(target, all)
    .filter((c) => baseFilter(target, tg, c))
    .map((c) => ({ c, label: meaningLabelIn(c.meanings, form) }))
    .filter((x) => x.label) // 한국어 뜻 형태가 같은 것만
    .map((x) => ({ ...x, s: score(target, tg, x.c, rng) }))
    .sort((a, b) => b.s - a.s)
    .filter((x) => !seen.has(x.label) && seen.add(x.label))
    .slice(0, DISTRACTOR_RULES.count);
  if (picked.length < DISTRACTOR_RULES.count) return null;
  return {
    correct: { key: target.id, label: correctLabel, wordId: target.id, correct: true },
    distractors: picked.map(({ c, label }) => ({ key: c.key, label, wordId: c.wordId, confusable: c.confusable || null, correct: false })),
  };
}

/**
 * 빈칸·유의어 문제용: 영어 단어 보기를 정답과 같은 활용형으로
 * @param surface 문장 속 정답 형태 (예: "curtailed")
 * @param include 반드시 넣을 단어(유의어 문제의 등록 유의어) — 내 단어 객체 배열
 * @returns {{ correct, distractors } | null}
 */
export function wordOptions(target, all, surface, rng = Math.random, { include = [], allowSynonyms = false } = {}) {
  const tg = grammarOf(target);
  const kind = inflectionKind(target.word, surface, tg.forms);
  if (!kind) return null; // 불규칙 등 활용을 알 수 없으면 이 유형은 내지 않음
  const syn = new Set(allowSynonyms ? [] : registeredSynonyms(target, all).map((w) => w.word.toLowerCase()));
  for (const s of target.synonyms) if (!allowSynonyms) syn.add(s.toLowerCase());
  const make = (c) => {
    const form = inflectTo(c.word, kind, { forms: c.forms, pos: c.pos });
    return form ? { key: c.key, label: matchCase(form, surface), wordId: c.wordId, confusable: c.confusable || null, correct: false } : null;
  };
  const forced = include
    .map((w) => make({ key: w.id, word: w.word, pos: w.pos, ...grammarOf(w), wordId: w.id }))
    .filter(Boolean);
  const seen = new Set([surface.toLowerCase(), ...forced.map((o) => o.label.toLowerCase())]);
  const rest = candidatesFor(target, all)
    .filter((c) => !include.some((w) => w.id === c.wordId) && baseFilter(target, tg, c) && !syn.has(c.word.toLowerCase()))
    .map((c) => ({ c, s: score(target, tg, c, rng) }))
    .sort((a, b) => b.s - a.s)
    .map(({ c }) => make(c))
    .filter((o) => o && !seen.has(o.label.toLowerCase()) && seen.add(o.label.toLowerCase()));
  const distractors = [...forced, ...rest].slice(0, DISTRACTOR_RULES.count);
  if (distractors.length < DISTRACTOR_RULES.count) return null;
  return { correct: { key: target.id, label: surface, wordId: target.id, correct: true }, distractors };
}

export const _test = { regular, grammarOf, candidatesFor };
