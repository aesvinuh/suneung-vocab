import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWord } from '../src/lib/word.js';
import { koForm, inflectionKind, inflectTo, meaningOptions, wordOptions } from '../src/lib/distractors.js';
import { buildQuestion, availableTypes } from '../src/lib/questions.js';
import { mergePool, pickExample, markExampleUsed, poolNeeds, POOL_CONFIG } from '../src/lib/pools.js';
import { applyAnswer } from '../src/lib/grading.js';
import { weightParts } from '../src/lib/weights.js';
import { buildExplanation } from '../src/lib/explain.js';
import { planCleanup } from '../src/lib/migrate.js';
import { feelSimilarity, isConfirmed } from '../src/lib/profile.js';

// localStorage 흉내 (usage.js·apiKeys.js용)
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  store.clear();
});

const W = (word, pos, meanings, extra = {}) => normalizeWord({ word, pos, meanings, ...extra });
const confirmed = (direction, role, intensity, keywords = [], extra = {}) => ({ direction, role, intensity, keywords, diff: '', confirmed: true, ...extra });

// 동사 단어장: curtail(예문 -ed)과 같은 품사·형태 후보들
const verbs = [
  W('curtail', 'v', '줄이다, 축소하다', { example: 'The government curtailed public spending.', exampleKo: '정부는 공공 지출을 줄였다.' }),
  W('abandon', 'v', '버리다, 포기하다'),
  W('postpone', 'v', '연기하다, 미루다'),
  W('expand', 'v', '확장하다, 넓히다'),
  W('happy', 'adj', '행복한'), // 품사 다름 → 절대 보기로 안 나옴
  W('decrease', 'n', '감소'), // 품사 다름
];

test('한국어 뜻 형태 판별', () => {
  assert.equal(koForm('줄이다'), 'da');
  assert.equal(koForm('꺼리는'), 'mod');
  assert.equal(koForm('통합적인'), 'mod');
  assert.equal(koForm('행복한'), 'mod');
  assert.equal(koForm('조용히'), 'adv');
  assert.equal(koForm('빠르게'), 'adv');
  assert.equal(koForm('갈등'), 'noun');
  assert.equal(koForm('(책임·역할을) 맡다'), 'da');
});

test('활용형: 정답 형태를 알아내 오답도 같은 형태로', () => {
  assert.equal(inflectionKind('curtail', 'curtailed'), 'ed');
  assert.equal(inflectionKind('vary', 'varies'), 's');
  assert.equal(inflectionKind('arrange', 'arranging'), 'ing');
  assert.equal(inflectionKind('compel', 'compelled'), 'ed');
  assert.equal(inflectionKind('fight', 'fought', { s: 'fights', ed: 'fought', en: 'fought', ing: 'fighting' }), 'ed');
  assert.equal(inflectionKind('fight', 'fought'), null); // 불규칙인데 정보 없음 → 빈칸 문제 안 냄
  assert.equal(inflectTo('postpone', 'ed', { pos: 'v' }), 'postponed');
  assert.equal(inflectTo('stop', 'ing', { pos: 'v' }), 'stopping');
  assert.equal(inflectTo('carry', 's', { pos: 'v' }), 'carries');
  assert.equal(inflectTo('give up', 'ed', { pos: 'phr', forms: { ed: 'gave' } }), 'gave up');
  assert.equal(inflectTo('happy', 'ed', { pos: 'adj' }), null);
});

test('빈칸 보기: 같은 품사만, 정답과 같은 활용형, 3개 미만이면 null', () => {
  const r = wordOptions(verbs[0], verbs, 'curtailed', () => 0.5);
  assert.equal(r.correct.label, 'curtailed');
  assert.deepEqual(r.distractors.map((o) => o.label).sort(), ['abandoned', 'expanded', 'postponed']);
  assert.equal(wordOptions(verbs[0], verbs.slice(0, 3), 'curtailed'), null); // 동사 후보 2개뿐
  assert.equal(wordOptions(verbs[0], verbs, 'Curtailed').correct.label, 'Curtailed');
  assert.ok(wordOptions(verbs[0], verbs, 'Curtailed').distractors.every((o) => /^[A-Z]/.test(o.label))); // 문장 첫머리면 대문자
});

test('뜻 보기: 품사·한국어 형태 일치, 같은 뜻 제외, 내 단어 우선 → AI 헷갈리는 단어로 보충', () => {
  const mo = meaningOptions(verbs[0], verbs, () => 0.5);
  assert.equal(mo.correct.label, '줄이다, 축소하다');
  assert.ok(mo.distractors.every((o) => /다$/.test(o.label)));
  assert.ok(!mo.distractors.some((o) => o.label === '행복한' || o.label === '감소'));
  // 내 동사가 부족하면 AI 풀(같은 품사)로 채움
  const withPool = { ...verbs[0], ai: { ...verbs[0].ai, confusables: [
    { word: 'curtsy', pos: 'v', meanings: ['절하다'], forms: {}, type: 'spelling', why: '철자가 비슷', level: 3 },
    { word: 'curb', pos: 'v', meanings: ['억제하다'], forms: {}, type: 'meaning', why: '뜻이 비슷', level: 3 },
    { word: 'trim', pos: 'v', meanings: ['다듬은'], forms: {}, type: 'range', why: '형태가 다름', level: 3 }, // 형태 안 맞음
  ] } };
  const few = [withPool, verbs[1]];
  const mo2 = meaningOptions(withPool, few, () => 0.5);
  assert.deepEqual(mo2.distractors.map((o) => o.label).sort(), ['버리다, 포기하다', '억제하다', '절하다']);
  assert.ok(mo2.distractors.some((o) => o.confusable?.word === 'curb'));
  assert.equal(mo2.distractors[0].label, '버리다, 포기하다'); // 내 단어가 먼저
  // 고난도 정답에 기초 단어는 안 섞음
  const hard = { ...withPool, ai: { ...withPool.ai, grammar: { level: 4 } } };
  const easy = { ...verbs[1], ai: { ...verbs[1].ai, grammar: { level: 1 } } };
  assert.ok(!meaningOptions(hard, [hard, easy], () => 0.5)?.distractors.some((o) => o.label.startsWith('버리다')));
});

test('유형 대체: 만들 수 없는 유형은 건너뛰고, 단어가 적으면 자기평가만', () => {
  const two = verbs.slice(0, 2);
  assert.deepEqual(availableTypes(two[0], two), ['self']);
  const q = buildQuestion(verbs[0], verbs, Math.random, { types: ['nuance'] });
  assert.equal(q, null); // 프로필 미확정 → 뉘앙스 없음 → 후속 문제는 fallback으로
  assert.ok(buildQuestion(verbs[0], verbs, Math.random, { types: ['meaning', 'underline'] }));
});

test('뉘앙스 문제 4종: 확정 프로필 기반', () => {
  const ex = { example: 'Despite his talent, he was reluctant to perform in public.', exampleKo: '재능이 있음에도 그는 사람들 앞에서 공연하기를 꺼렸다.' };
  const base = [
    W('reluctant', 'adj', '꺼리는', { ...ex, synonyms: ['hesitant'], profile: confirmed('negative', 'evaluative', 'medium', ['소극적'], { diff: 'hesitant는 망설임, reluctant는 싫어서 꺼림' }) }),
    W('hesitant', 'adj', '망설이는', { profile: confirmed('negative', 'evaluative', 'weak', ['소극적']) }),
    W('eager', 'adj', '열망하는', { profile: confirmed('positive', 'evaluative', 'strong', ['적극적']) }),
    W('however', 'adv', '그러나', { profile: confirmed('neutral', 'signal', 'medium', [], { signal: 'contrast' }) }),
    W('enthusiastic', 'adj', '열정적인', { profile: confirmed('positive', 'evaluative', 'strong', ['적극적']) }),
    W('table', 'n', '탁자', { profile: confirmed('neutral', 'content', 'weak') }),
  ];
  assert.ok(base.every(isConfirmed));
  const subs = new Set();
  for (let i = 0; i < 300; i++) {
    const q = buildQuestion(base[0], base, Math.random, { types: ['nuance'] });
    subs.add(q.sub);
    const right = q.options.filter((o) => o.correct);
    assert.equal(right.length, 1);
    if (q.sub === 'stance') assert.equal(right[0].label, '앞 내용을 부정적으로 평가한다');
    if (q.sub === 'role') assert.equal(right[0].label, '평가어 — 필자의 태도를 드러냄');
    if (q.sub === 'feel') assert.equal(right[0].label, 'hesitant'); // 같은 부정·소극적
    if (q.sub === 'pair') assert.deepEqual(q.options.map((o) => o.label).sort(), ['hesitant', 'reluctant']);
    assert.ok([4, 2].includes(q.options.length));
  }
  assert.deepEqual([...subs].sort(), ['feel', 'pair', 'role', 'stance']);
  assert.ok(feelSimilarity(base[0].profile, base[1].profile) > feelSimilarity(base[0].profile, base[2].profile));
});

test('AI 풀 합치기: 단어 없는 예문·다른 품사·내 단어장 단어는 버림', () => {
  const w = verbs[0];
  const merged = mergePool(
    w,
    {
      examples: [
        { en: 'Budget cuts curtailed the program.', ko: '예산 삭감이 그 프로그램을 축소시켰다.', why: '예산 삭감 → 축소' },
        { en: 'This sentence lacks the word.', ko: 'x', why: 'x' },
      ],
      userWhy: '공공 지출을 줄였다는 문맥',
      grammar: { transitivity: 'vt', pattern: '', level: 4, forms: { s: 'curtails', ed: 'curtailed', en: 'curtailed', ing: 'curtailing' } },
      confusables: [
        { word: 'curb', pos: 'v', meanings: ['억제하다'], type: 'meaning', why: '비슷' },
        { word: 'curtain', pos: 'n', meanings: ['커튼'], type: 'spelling', why: '철자' },
        { word: 'abandon', pos: 'v', meanings: ['버리다'], type: 'meaning', why: '내 단어장에 있음' },
      ],
      profile: { direction: 'negative', role: 'content', signal: '', intensity: 'medium', keywords: ['제한'], diff: '' },
    },
    verbs.map((x) => x.word),
  );
  assert.equal(merged.ai.examples.length, 1);
  assert.equal(merged.ai.userExample.why, '공공 지출을 줄였다는 문맥');
  assert.deepEqual(merged.ai.confusables.map((c) => c.word), ['curb']);
  assert.equal(merged.ai.grammar.level, 4);
  assert.equal(merged.profile.suggested.direction, 'negative');
  assert.equal(merged.profile.confirmed, false);
});

test('예문 순환: 적게 쓴 예문 우선, 방금 쓴 예문 피함, 다 쓰면 새로 만들 대상', () => {
  let w = mergePool(verbs[0], {
    examples: [
      { en: 'Funding was curtailed last year.', ko: 'a', why: 'a' },
      { en: 'They curtailed the meeting early.', ko: 'b', why: 'b' },
    ],
    userWhy: '',
    grammar: null,
    confusables: [],
    profile: null,
  }, []);
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const ex = pickExample(w, () => 0);
    if (seen.length) assert.notEqual(ex.id, seen.at(-1)); // 연속으로 같은 예문 안 씀
    seen.push(ex.id);
    w = markExampleUsed(w, ex.id, 1000 + i);
  }
  assert.deepEqual([...new Set(seen)].sort(), ['user', w.ai.examples[0].id, w.ai.examples[1].id].sort()); // 내 예문 포함 3개 고르게
  for (let i = 0; i < POOL_CONFIG.exampleMaxUses * 3; i++) w = markExampleUsed(w, pickExample(w).id, 2000 + i);
  assert.ok(poolNeeds(w).examples > 0);
  assert.equal(w.example, 'The government curtailed public spending.'); // 내 예문은 그대로
});

test('자기평가 착각 단어: 뉘앙스 문제 틀리면 기록 + 가중치 크게', () => {
  const now = Date.now();
  const w = W('reluctant', 'adj', '꺼리는', { createdAt: now - 90 * 864e5, stats: { shown: 20, correct: 20, wrong: 0, lastShownAt: now } });
  const r = applyAnswer(w, { correct: false, illusion: true }, now);
  assert.equal(r.illusion, true);
  assert.equal(r.word.illusion.count, 1);
  assert.equal(applyAnswer(w, { correct: true, illusion: true }, now).word.illusion.count, 0);
  assert.equal(applyAnswer(w, { correct: false }, now).word.illusion.count, 0); // 일반 오답은 착각 아님
  const before = weightParts(w, { now }).total;
  const after = weightParts(r.word, { now }).total;
  assert.ok(after - before >= 5, `${before} → ${after}`);
});

test('해설: 모든 선지 뜻, 정답 이유, 고른 오답이 안 맞는 이유 (내 단어·AI 단어)', async () => {
  const target = mergePool(verbs[0], {
    examples: [],
    userWhy: '지출을 "줄였다"는 문맥',
    grammar: null,
    confusables: [{ word: 'curb', pos: 'v', meanings: ['억제하다'], forms: {}, type: 'meaning', why: 'curb는 억누르는 것, curtail은 양·기간을 줄이는 것' }],
    profile: null,
  }, []);
  const all = [target, ...verbs.slice(1)];
  const q = buildQuestion(target, all, () => 0.5, { types: ['blank'] });
  const wrongMine = q.options.find((o) => !o.correct && o.wordId);
  const e1 = await buildExplanation({ question: q, correctWord: target, chosen: wrongMine, allWords: all });
  assert.equal(e1.isCorrect, false);
  assert.equal(e1.why, '지출을 "줄였다"는 문맥');
  assert.match(e1.whyNot, /뜻이라/);
  assert.equal(e1.options.length, 4);
  assert.ok(e1.options.every((o) => o.meanings));
  const e2 = await buildExplanation({ question: q, correctWord: target, chosen: q.options.find((o) => o.correct), allWords: all });
  assert.equal(e2.isCorrect, true);
  assert.equal(e2.whyNot, null);
  // AI 헷갈리는 단어를 골랐을 때
  const q3 = { ...q, options: [q.options.find((o) => o.correct), { key: 'ai', label: 'curbed', confusable: target.ai.confusables[0], correct: false }] };
  const e3 = await buildExplanation({ question: q3, correctWord: target, chosen: q3.options[1], allWords: all });
  assert.match(e3.whyNot, /curb는 '억제하다'/);
  assert.equal(e3.options[1].kind, 'confusable');
});

test('데이터 정리: 예전 단어 → 프로필 구조 (느낌 메모 보존, 감정 톤 → 평가 방향, 미확정)', () => {
  const old = normalizeWord({ word: 'meticulous', meanings: '꼼꼼한', tone: 'positive', nuance: '긍정. careful보다 강함' });
  assert.equal(old.profile, null);
  const m = planCleanup(old);
  assert.equal(m.nuance, '긍정. careful보다 강함');
  assert.equal(m.profile.direction, 'positive');
  assert.equal(m.profile.confirmed, false);
  assert.equal(planCleanup(normalizeWord(m)), null); // 두 번 하지 않음
});

test('AI 풀 생성 요청: 여러 단어를 한 번에, 사용량 기록, 하루 한도', async () => {
  const { generatePools } = await import('../src/lib/aiFill.js');
  const { todayRequests, monthUsage, setDailyLimit } = await import('../src/lib/usage.js');
  let calls = 0;
  let sent;
  globalThis.fetch = async (url, init) => {
    calls++;
    sent = JSON.parse(init.body);
    const words = ['curtail', 'abandon'].map((word) => ({
      word, examples: [], userWhy: '', grammar: { transitivity: 'vt', pattern: '', level: 3, forms: { s: '', ed: '', en: '', ing: '' } },
      confusables: [], profile: { direction: 'neutral', role: 'content', signal: 'none', intensity: 'weak', keywords: [], diff: '' },
    }));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: sent.model, content: [{ type: 'text', text: JSON.stringify({ words }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 2000, output_tokens: 5000 } }), { headers: { 'content-type': 'application/json', 'request-id': 'r' } });
  };
  const items = verbs.slice(0, 2).map((w) => ({ ...w, needs: { examples: 5, userWhy: false, grammar: true, confusables: true, profile: true } }));
  const out = await generatePools(items, ['curtail', 'abandon'], 'sk-ant-test');
  assert.equal(calls, 1); // 두 단어를 요청 한 번에
  assert.match(sent.messages[0].content, /### curtail[\s\S]*### abandon/);
  assert.equal(out.length, 2);
  assert.equal(todayRequests(), 1);
  assert.equal(Math.round(monthUsage().usd * 1000), Math.round((2000 * 4 + 5000 * 20) / 1e6 * 1000));
  setDailyLimit(1);
  await assert.rejects(generatePools(items, [], 'sk-ant-test'), /한도/);
  assert.equal(calls, 1); // 한도에 걸리면 요청 자체를 안 보냄
});
