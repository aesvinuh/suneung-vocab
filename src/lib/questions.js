// 문제 생성: 단어 하나를 받아 가능한 유형 중 하나를 골라 문제 객체를 만든다.
import { findTarget, maskWord, stripMarkers } from './inflect.js';
import { splitNuance } from './notes.js';
import { TYPE_WEIGHTS, pickWeighted } from './weights.js';
import { effectiveTone, registeredSynonyms, TONE_OPTIONS, uid } from './word.js';

export const TYPE_LABEL = {
  meaning: '뜻 고르기',
  blank: '빈칸 채우기',
  underline: '문맥상 의미',
  synonym: '유의어 구분',
  nuance: '뉘앙스',
  self: '자기평가',
};

export const meaningLabel = (w) => w.meanings.slice(0, 3).join(', ');

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 오답 보기 고르기: 같은 품사 + 뜻이 비슷한(한글 2글자 조각이 겹치는) 단어 우선 ──
function bigrams(word) {
  const set = new Set();
  for (const m of word.meanings) {
    const t = m.replace(/[\s,.;/()~·…'"-]/g, '');
    if (t.length === 1) set.add(t);
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  }
  return set;
}

function meaningSimilarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function pickDistractors(target, all, n, rng, filter) {
  const confused = target.note?.confusedWith || {};
  return all
    .filter((w) => w.id !== target.id && filter(w))
    .map((w) => ({
      w,
      score:
        (target.pos && w.pos === target.pos ? 3 : 0) +
        meaningSimilarity(target, w) * 4 +
        Math.min(confused[w.id] || 0, 3) * 0.7 +
        rng() * 2.5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.w);
}

// 뜻 보기용: 정답과 같은 뜻을 가진 단어는 보기에서 제외(정답이 두 개가 되지 않게)
const meaningFilter = (target) => (w) =>
  w.meanings.length > 0 && !w.meanings.some((m) => target.meanings.includes(m));

// 단어 보기용: 유의어/같은 뜻 단어는 빈칸에 들어가도 말이 될 수 있으니 제외
const wordFilter = (target, all) => {
  const syn = new Set(registeredSynonyms(target, all).map((w) => w.id));
  const meaningOk = meaningFilter(target);
  return (w) => !syn.has(w.id) && meaningOk(w) && w.word.toLowerCase() !== target.word.toLowerCase();
};

// ── 뉘앙스 문제 보기 규칙 ──
// - 각 단어의 뉘앙스 메모 전체(한 덩어리)를 보기로 쓴다. 줄 단위로 쪼개지 않는다.
// - 정답 단어(활용형 포함)는 ○○로 가린다. 가린 뒤 남는 글자(한글·영문)가 MIN_VISIBLE 미만이면 보기로 쓰지 않는다.
// - 본문 형태·반의어·숙어 같은 정보가 섞인 메모는 쓰지 않는다 (설정 → 데이터 정리로 분리 가능).
// - 같은 문구의 보기는 하나만. 조건에 맞는 오답 보기가 NUANCE_DISTRACTORS개 미만이면 이 문제(메모형)는 내지 않는다.
const MIN_VISIBLE = 10;
const NUANCE_DISTRACTORS = 3;
const memoLabel = (w) => clip(maskWord(w.nuance, w.word));
const visibleChars = (s) => (s.replace(/○/g, '').match(/[가-힣A-Za-z]/g) || []).length;
const hasNuance = (w) => !!w.nuance && visibleChars(memoLabel(w)) >= MIN_VISIBLE && splitNuance(w.nuance, w.word).moved === 0;
const withNuance = (target) => (w) => hasNuance(w) && memoLabel(w) !== memoLabel(target);
// 서로 다른 보기 후보 (같은 문구는 하나만)
function nuancePool(target, all) {
  const seen = new Set([memoLabel(target)]);
  return all.filter((w) => w.id !== target.id && withNuance(target)(w) && !seen.has(memoLabel(w)) && seen.add(memoLabel(w)));
}

// ── 단어별로 가능한 유형 판정 ──
export function availableTypes(word, all) {
  const types = ['self'];
  const others = all.filter((w) => w.id !== word.id);
  const target = findTarget(word.example, word.word);
  const meaningPool = others.filter(meaningFilter(word)).length;

  if (word.meanings.length && meaningPool >= 3) types.push('meaning');
  if (target && others.filter(wordFilter(word, all)).length >= 3) types.push('blank');
  if (target && word.meanings.length && meaningPool >= 3) types.push('underline');
  if (target && registeredSynonyms(word, all).length >= 1) types.push('synonym');
  if (effectiveTone(word) || (hasNuance(word) && nuancePool(word, all).length >= NUANCE_DISTRACTORS)) types.push('nuance');
  return types;
}

// ── 문제 만들기 ──
export function buildQuestion(word, all, rng = Math.random) {
  const types = availableTypes(word, all);
  const type = pickWeighted(types.map((t) => [t, TYPE_WEIGHTS[t] ?? 1]), rng);
  const q = BUILDERS[type](word, all, rng);
  return { key: uid(), type, wordId: word.id, ...q };
}

const wordOption = (w, correct) => ({ key: w.id, label: w.word, wordId: w.id, correct });
const meaningOption = (w, correct) => ({ key: w.id, label: meaningLabel(w), wordId: w.id, correct });

const BUILDERS = {
  meaning(word, all, rng) {
    const ds = pickDistractors(word, all, 3, rng, meaningFilter(word));
    return {
      title: '알맞은 뜻은?',
      prompt: { kind: 'word', word: word.word, pos: word.pos },
      options: shuffle([meaningOption(word, true), ...ds.map((w) => meaningOption(w, false))], rng),
    };
  },

  blank(word, all, rng) {
    const ds = pickDistractors(word, all, 3, rng, wordFilter(word, all));
    return {
      title: '빈칸에 들어갈 단어는?',
      prompt: { kind: 'sentence', mode: 'blank', ...findTarget(word.example, word.word) },
      options: shuffle([wordOption(word, true), ...ds.map((w) => wordOption(w, false))], rng),
    };
  },

  underline(word, all, rng) {
    const ds = pickDistractors(word, all, 3, rng, meaningFilter(word));
    return {
      title: '밑줄 친 단어의 문맥상 의미는?',
      prompt: { kind: 'sentence', mode: 'underline', ...findTarget(word.example, word.word) },
      options: shuffle([meaningOption(word, true), ...ds.map((w) => meaningOption(w, false))], rng),
    };
  },

  synonym(word, all, rng) {
    const syns = shuffle(registeredSynonyms(word, all), rng).slice(0, 3);
    const used = new Set([word.id, ...syns.map((w) => w.id)]);
    const pad = pickDistractors(word, all, 3 - syns.length, rng, (w) => !used.has(w.id) && wordFilter(word, all)(w));
    return {
      title: '문맥과 뉘앙스에 가장 맞는 단어는?',
      prompt: {
        kind: 'sentence',
        mode: 'blank',
        ...findTarget(word.example, word.word),
        hint: word.exampleKo, // 유의어끼리는 문법상 둘 다 들어갈 수 있어 해석을 힌트로 보여줌
      },
      options: shuffle(
        [wordOption(word, true), ...syns.map((w) => wordOption(w, false)), ...pad.map((w) => wordOption(w, false))],
        rng,
      ),
    };
  },

  nuance(word, all, rng) {
    const tone = effectiveTone(word);
    const pool = hasNuance(word) ? nuancePool(word, all) : [];
    const canMemo = pool.length >= NUANCE_DISTRACTORS;
    const useTone = tone && (!canMemo || rng() < 0.5);

    if (useTone) {
      return {
        title: '이 단어의 뉘앙스는?',
        prompt: { kind: 'word', word: word.word, pos: word.pos },
        options: TONE_OPTIONS.map((t) => ({ key: t.value, label: t.label + '적', wordId: null, correct: t.value === tone })),
      };
    }
    const poolIds = new Set(pool.map((w) => w.id));
    const ds = pickDistractors(word, all, 3, rng, (w) => poolIds.has(w.id));
    const memo = memoLabel;
    return {
      title: '이 단어에 맞는 뉘앙스 설명은?',
      prompt: { kind: 'word', word: word.word, pos: word.pos },
      small: true,
      options: shuffle(
        [{ ...meaningOption(word, true), label: memo(word) }, ...ds.map((w) => ({ ...meaningOption(w, false), label: memo(w) }))],
        rng,
      ),
    };
  },

  self(word) {
    return {
      title: '떠오르는 만큼 고르세요',
      prompt: { kind: 'word', word: word.word, pos: word.pos },
      options: [
        { key: 'full', label: '뉘앙스까지 떠오름', grade: 'full' },
        { key: 'meaning', label: '뜻만 떠오름', grade: 'meaning' },
        { key: 'none', label: '모름', grade: 'none' },
      ],
    };
  },
};

function clip(text, max = 160) {
  const t = stripMarkers(text).replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
