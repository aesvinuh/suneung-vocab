// 문제 생성: 단어 하나를 받아 가능한 유형 중 하나를 골라 문제 객체를 만든다.
// 오답 선지 규칙은 distractors.js, 예문 고르기는 pools.js. 만들 수 없는 유형은 null을 돌려주고 다른 유형으로 대체한다.
import { findTarget } from './inflect.js';
import { TYPE_WEIGHTS, pickWeighted } from './weights.js';
import { registeredSynonyms, uid } from './word.js';
import { meaningOptions, wordOptions, inflectionKind, inflectTo } from './distractors.js';
import { pickExample } from './pools.js';
import { feelSimilarity, isConfirmed, ROLE_CHOICES, roleKey, STANCES, stanceKey } from './profile.js';

export const TYPE_LABEL = {
  meaning: '뜻 고르기',
  blank: '빈칸 채우기',
  underline: '문맥상 의미',
  synonym: '유의어 구분',
  nuance: '뉘앙스',
  self: '자기평가',
};
export const NUANCE_LABEL = {
  stance: '필자의 태도',
  role: '글 속 역할',
  feel: '비슷한 느낌',
  pair: '더 자연스러운 단어',
};

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sentence = (word, ex, mode, extra = {}) => ({ kind: 'sentence', mode, ...findTarget(ex.en, word.word), ...extra });
const exampleInfo = (ex) => (ex ? { id: ex.id, en: ex.en, ko: ex.ko, why: ex.why || '', source: ex.source } : null);

const BUILDERS = {
  meaning(word, all, rng) {
    const mo = meaningOptions(word, all, rng);
    if (!mo) return null;
    return {
      title: '알맞은 뜻은?',
      prompt: { kind: 'word', word: word.word, pos: word.pos },
      options: shuffle([mo.correct, ...mo.distractors], rng),
    };
  },

  underline(word, all, rng) {
    const ex = pickExample(word, rng);
    const mo = ex && meaningOptions(word, all, rng);
    if (!mo) return null;
    return {
      title: '밑줄 친 단어의 문맥상 의미는?',
      prompt: sentence(word, ex, 'underline'),
      example: exampleInfo(ex),
      options: shuffle([mo.correct, ...mo.distractors], rng),
    };
  },

  blank(word, all, rng) {
    const ex = pickExample(word, rng);
    if (!ex) return null;
    const t = findTarget(ex.en, word.word);
    const wo = wordOptions(word, all, t.target, rng);
    if (!wo) return null;
    return {
      title: '빈칸에 들어갈 단어는?',
      prompt: sentence(word, ex, 'blank'),
      example: exampleInfo(ex),
      options: shuffle([wo.correct, ...wo.distractors], rng),
    };
  },

  synonym(word, all, rng) {
    const syns = shuffle(registeredSynonyms(word, all), rng).slice(0, 3);
    const ex = syns.length && pickExample(word, rng);
    if (!ex) return null;
    const t = findTarget(ex.en, word.word);
    const wo = wordOptions(word, all, t.target, rng, { include: syns, allowSynonyms: true });
    if (!wo) return null;
    return {
      title: '문맥과 뉘앙스에 가장 맞는 단어는?',
      prompt: sentence(word, ex, 'blank', { hint: ex.ko }), // 유의어끼리는 문법상 다 들어갈 수 있어 해석을 힌트로
      example: exampleInfo(ex),
      options: shuffle([wo.correct, ...wo.distractors], rng),
    };
  },

  // 뉘앙스: 확정된 프로필로만 출제. 4가지 중 가능한 것을 랜덤으로
  nuance(word, all, rng) {
    if (!isConfirmed(word)) return null;
    for (const sub of shuffle(Object.keys(NUANCE), rng)) {
      const q = NUANCE[sub](word, all, rng);
      if (q) return { sub, ...q };
    }
    return null;
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

const choiceOptions = (table, correctKey, rng) => {
  if (!correctKey || !table[correctKey]) return null;
  const others = shuffle(Object.keys(table).filter((k) => k !== correctKey), rng).slice(0, 3);
  if (others.length < 3) return null;
  return shuffle(
    [{ key: correctKey, label: table[correctKey], correct: true }, ...others.map((k) => ({ key: k, label: table[k], correct: false }))],
    rng,
  );
};

const NUANCE = {
  // 예문 제시 후 "이 단어로 볼 때 필자는 앞 내용을 어떻게 보고 있나?" (평가 방향 + 글 속 역할)
  stance(word, all, rng) {
    const ex = pickExample(word, rng);
    const options = ex && choiceOptions(STANCES, stanceKey(word.profile), rng);
    if (!options) return null;
    return {
      title: '밑줄 친 단어로 볼 때, 필자는 앞 내용을 어떻게 보고 있나?',
      prompt: sentence(word, ex, 'underline', { hint: ex.ko }),
      example: exampleInfo(ex),
      small: true,
      options,
    };
  },

  // "이 단어가 글에서 하는 역할은?"
  role(word, all, rng) {
    const options = choiceOptions(ROLE_CHOICES, roleKey(word.profile), rng);
    if (!options) return null;
    const ex = pickExample(word, rng);
    return {
      title: '이 단어가 글에서 하는 역할은?',
      prompt: ex ? sentence(word, ex, 'underline') : { kind: 'word', word: word.word, pos: word.pos },
      example: exampleInfo(ex),
      small: true,
      options,
    };
  },

  // "이 단어와 느낌이 가장 가까운 것은?" — 확정된 내 단어 중 프로필이 가장 비슷한 것
  feel(word, all, rng) {
    const others = all.filter((w) => w.id !== word.id && isConfirmed(w));
    if (others.length < 4) return null;
    const ranked = others.map((w) => ({ w, s: feelSimilarity(word.profile, w.profile) })).sort((a, b) => b.s - a.s);
    const best = ranked[0];
    if (ranked[1] && ranked[1].s >= best.s - 1) {
      // 1등이 분명하지 않으면 공동 1등끼리는 보기에 함께 넣지 않음
      if (ranked[1].s === best.s) return null;
    }
    const far = shuffle(ranked.filter((x) => x.s <= best.s - 2), rng).slice(0, 3);
    if (far.length < 3) return null;
    const opt = (x, correct) => ({ key: x.w.id, label: x.w.word, wordId: x.w.id, correct });
    return {
      title: '이 단어와 느낌이 가장 가까운 것은?',
      prompt: { kind: 'word', word: word.word, pos: word.pos },
      options: shuffle([opt(best, true), ...far.map((x) => opt(x, false))], rng),
    };
  },

  // 유사어 두 개를 주고 "이 문맥에 더 자연스러운 것은?" — 프로필의 '유사어와의 차이'가 있어야 함
  pair(word, all, rng) {
    if (!word.profile.diff) return null;
    const ex = pickExample(word, rng);
    if (!ex) return null;
    const t = findTarget(ex.en, word.word);
    const kind = inflectionKind(word.word, t.target, word.ai?.grammar?.forms);
    if (!kind) return null;
    const mine = registeredSynonyms(word, all).filter((w) => !w.pos || w.pos === word.pos);
    const aiSyn = (word.ai?.confusables || []).filter((c) => c.type !== 'spelling');
    const rival = mine.length
      ? { word: mine[0].word, pos: mine[0].pos, forms: mine[0].ai?.grammar?.forms, wordId: mine[0].id, confusable: null }
      : aiSyn[0] && { word: aiSyn[0].word, pos: aiSyn[0].pos, forms: aiSyn[0].forms, wordId: null, confusable: aiSyn[0] };
    if (!rival) return null;
    const label = inflectTo(rival.word, kind, { forms: rival.forms, pos: rival.pos });
    if (!label || label.toLowerCase() === t.target.toLowerCase()) return null;
    const cased = /^[A-Z]/.test(t.target) ? label[0].toUpperCase() + label.slice(1) : label;
    return {
      title: '이 문맥에 더 자연스러운 단어는?',
      prompt: sentence(word, ex, 'blank', { hint: ex.ko }),
      example: exampleInfo(ex),
      options: shuffle(
        [
          { key: word.id, label: t.target, wordId: word.id, correct: true },
          { key: 'rival', label: cased, wordId: rival.wordId, confusable: rival.confusable, correct: false },
        ],
        rng,
      ),
    };
  },
};

// ── 문제 만들기 ──
// types: 이 중에서만 고름 (자기평가 후속 문제용). 하나도 안 되면 null
export function buildQuestion(word, all, rng = Math.random, { types } = {}) {
  let pool = (types || Object.keys(BUILDERS)).filter((t) => BUILDERS[t]);
  while (pool.length) {
    const type = pickWeighted(pool.map((t) => [t, TYPE_WEIGHTS[t] ?? 1]), rng);
    const q = BUILDERS[type](word, all, rng);
    if (q) return { key: uid(), type, wordId: word.id, example: null, ...q };
    pool = pool.filter((t) => t !== type); // 만들 수 없는 유형 → 다른 유형으로 대체
  }
  return null;
}

// 지금 만들 수 있는 유형 (자기평가 포함)
export function availableTypes(word, all, rng = Math.random) {
  return Object.keys(BUILDERS).filter((t) => BUILDERS[t](word, all, rng));
}
