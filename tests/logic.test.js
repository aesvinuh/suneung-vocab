import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTarget, maskWord } from '../src/lib/inflect.js';
import { pickNextWord, computeWeight, GRADUATION } from '../src/lib/weights.js';
import { availableTypes, buildQuestion } from '../src/lib/questions.js';
import { applyAnswer } from '../src/lib/grading.js';
import { normalizeWord } from '../src/lib/word.js';
import { SAMPLE_WORDS } from '../src/data/sampleWords.js';

const words = SAMPLE_WORDS.map((w, i) => normalizeWord({ ...w, createdAt: Date.now() - i * 1000 }));

test('활용형 인식', () => {
  assert.equal(findTarget('The pain gradually diminished.', 'diminish').target, 'diminished');
  assert.equal(findTarget('The snow compelled them.', 'compel').target, 'compelled');
  assert.equal(findTarget('She studies hard.', 'study').target, 'studies');
  assert.equal(findTarget('He is declining.', 'decline').target, 'declining');
  assert.equal(findTarget('He spoke humbly.', 'humble').target, 'humbly');
  assert.equal(findTarget('They *fought* bravely.', 'fight').target, 'fought');
  assert.equal(findTarget('She gave up early.', 'give up'), null);
  assert.equal(findTarget('She gives up early.', 'give up').target, 'gives up');
  assert.equal(findTarget('Undiminished hope.', 'diminish'), null);
  assert.equal(maskWord('reluctant는 싫어서 꺼림', 'reluctant'), '○○는 싫어서 꺼림');
});

test('모든 샘플 예문에서 단어를 찾음', () => {
  for (const w of words) assert.ok(findTarget(w.example, w.word), w.word);
});

test('쿨다운: 방금 나온 단어 제외', () => {
  const recent = words.slice(0, 5).map((w) => w.id);
  for (let i = 0; i < 200; i++) {
    const w = pickNextWord(words, { recentIds: recent });
    assert.ok(!recent.includes(w.id));
  }
  // 단어가 2개면 직전 1개만 제외
  const two = words.slice(0, 2);
  assert.equal(pickNextWord(two, { recentIds: [two[0].id, two[1].id] }).id, two[1].id);
});

test('가중치: 새 단어/오답 많은 단어 > 잘 아는 단어, 최소값 유지', () => {
  const now = Date.now();
  const old = now - 60 * 86400000;
  const known = { ...words[0], createdAt: old, stats: { shown: 30, correct: 30, wrong: 0, lastShownAt: now - 1000 } };
  const hard = { ...words[1], createdAt: old, stats: { shown: 10, correct: 3, wrong: 7, lastShownAt: now - 1000 } };
  const fresh = { ...words[2], createdAt: now };
  assert.ok(computeWeight(fresh, { now }) > computeWeight(hard, { now }));
  assert.ok(computeWeight(hard, { now }) > computeWeight(known, { now }));
  assert.ok(computeWeight(known, { now }) >= 0.5);
  assert.ok(computeWeight(hard, { now, mode: 'note' }) > computeWeight(hard, { now }));
});

test('문제 유형: 샘플(프로필 확정)에서 6가지 모두 출제, 정답은 하나, 보기 중복 없음', async () => {
  const { isConfirmed } = await import('../src/lib/profile.js');
  const prof = { positive: ['positive', 'evaluative'], negative: ['negative', 'evaluative'], neutral: ['neutral', 'content'] };
  const ws = words.map((w, i) => {
    const [direction, role] = prof[w.tone] || ['neutral', 'content'];
    return normalizeWord({ ...w, profile: { direction, role, intensity: ['weak', 'medium', 'strong'][i % 3], keywords: [], diff: '차이 설명', confirmed: true } });
  });
  assert.ok(ws.every(isConfirmed));
  const seen = new Set();
  for (const w of ws) availableTypes(w, ws).forEach((t) => seen.add(t));
  assert.deepEqual([...seen].sort(), ['blank', 'meaning', 'nuance', 'self', 'synonym', 'underline']);
  for (let i = 0; i < 500; i++) {
    const w = ws[i % ws.length];
    const q = buildQuestion(w, ws);
    if (q.type !== 'self') assert.equal(q.options.filter((o) => o.correct).length, 1, q.type);
    assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length, `no duplicate labels: ${q.type}`);
  }
  // 프로필이 확정되지 않으면 뉘앙스 문제는 안 나옴
  for (const w of words) assert.ok(!availableTypes(w, words).includes('nuance'));
});

test('오답 노트 등록과 졸업', () => {
  let w = words[0];
  let r = applyAnswer(w, { correct: false, chosenWordId: words[1].id, mode: 'normal' });
  assert.ok(r.entered && r.word.note.inNote);
  assert.equal(r.word.note.confusedWith[words[1].id], 1);
  w = r.word;
  for (let i = 0; i < GRADUATION.streak - 1; i++) w = applyAnswer(w, { correct: true, mode: 'note' }).word;
  assert.ok(w.note.inNote);
  r = applyAnswer(w, { correct: true, mode: 'note' });
  assert.ok(r.graduated && !r.word.note.inNote && r.word.stats.wrong === 1);
  r = applyAnswer(r.word, { correct: false, mode: 'note' });
  assert.ok(r.word.note.inNote && r.entered);
});

test('이미 있는 단어를 다시 넣으면 가중치가 조금 오르고 시간이 지나면 줄어듦', async () => {
  const { reinforce } = await import('../src/lib/autofill.js');
  const { weightParts } = await import('../src/lib/weights.js');
  const now = Date.now();
  const base = normalizeWord({ word: 'assume', meanings: '', createdAt: now - 60 * 86400000, stats: { shown: 10, correct: 10, wrong: 0, lastShownAt: now } });
  const once = reinforce(base, { meanings: ['가정하다'], example: 'They assume it.', pos: 'v' }, now);
  assert.deepEqual(once.word.meanings, ['가정하다']); // 비어 있던 칸 채움
  assert.deepEqual(once.filled.sort(), ['example', 'meanings', 'pos']);
  assert.equal(once.word.readd.count, 1);
  const twice = reinforce(once.word, { meanings: ['다른 뜻'] }, now).word;
  assert.deepEqual(twice.meanings, ['가정하다']); // 이미 있는 뜻은 그대로
  const w0 = weightParts(base, { now }).total;
  const w1 = weightParts(once.word, { now }).total;
  const w2 = weightParts(twice, { now }).total;
  assert.ok(w1 > w0 && w2 > w1, `${w0} < ${w1} < ${w2}`);
  assert.equal(weightParts(twice, { now }).readd, 3); // 1.5 × 2회
  assert.equal(weightParts(twice, { now: now + 7 * 86400000 }).readd, 1.5); // 7일 뒤 절반
});

test('데이터 정리: 예전 파서가 뉘앙스 칸에 넣은 정보를 알맞은 칸으로', async () => {
  const { migrateWord, needsMigration } = await import('../src/lib/notes.js');
  // 예전 버전이 실제로 만든 데이터 (14개 중 7개가 뉘앙스 칸에 다른 정보)
  const old = {
    settlement: '본문 형태: settlements',
    vary: '본문 형태: varies',
    arrange: '본문 형태: arranging',
    constraint: '본문 형태: constraints',
    integrative: '반의: distributive 분배적인',
    mutually: 'mutually exclusive: 상호 배타적인',
    conflict: '명사는 앞, 동사는 뒤에 강세',
  };
  const ws = Object.entries(old).map(([w, nuance]) => normalizeWord({ word: w, meanings: w + '뜻', nuance }));
  assert.equal(ws.filter(needsMigration).length, 7);
  const m = Object.fromEntries(ws.map((w) => [w.word, migrateWord(w)]));
  assert.deepEqual([m.settlement.nuance, m.settlement.form], ['', 'settlements']);
  assert.equal(m.arrange.form, 'arranging');
  assert.deepEqual(m.integrative.antonyms, ['distributive']);
  assert.equal(m.integrative.memo, '반의: distributive 분배적인');
  assert.equal(m.mutually.related, 'mutually exclusive: 상호 배타적인');
  assert.equal(m.conflict.memo, '명사는 앞, 동사는 뒤에 강세');
  // 진짜 뉘앙스는 그대로, 섞인 부분만 분리
  const mixed = migrateWord(normalizeWord({ word: 'reluctant', meanings: 'x', nuance: '부정적. 하기 싫어서 꺼림\n본문 형태: reluctantly\n유의: hesitant 망설이는' }));
  assert.equal(mixed.nuance, '부정적. 하기 싫어서 꺼림');
  assert.equal(mixed.form, 'reluctantly');
  assert.deepEqual(mixed.synonyms, ['hesitant']);
  assert.equal(migrateWord(words[0]), null); // 샘플 단어는 손댈 것 없음
});
