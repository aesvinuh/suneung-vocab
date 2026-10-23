import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTarget, maskWord } from '../src/lib/inflect.js';
import { pickNextWord, computeWeight, GRADUATION } from '../src/lib/weights.js';
import { availableTypes, buildQuestion } from '../src/lib/questions.js';
import { applyAnswer } from '../src/lib/grading.js';
import { parseBulk } from '../src/lib/parse.js';
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

test('문제 유형: 샘플에서 6가지 모두 출제 가능', () => {
  const seen = new Set();
  for (const w of words) availableTypes(w, words).forEach((t) => seen.add(t));
  assert.deepEqual([...seen].sort(), ['blank', 'meaning', 'nuance', 'self', 'synonym', 'underline']);
  for (let i = 0; i < 500; i++) {
    const w = words[i % words.length];
    const q = buildQuestion(w, words);
    const correct = q.options.filter((o) => o.correct);
    if (q.type !== 'self') assert.equal(correct.length, 1, q.type);
    assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length, 'no duplicate labels');
  }
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

test('일괄 추가 파싱', () => {
  const { rows, errors } = parseBulk('a | 뜻1, 뜻2 | 긍정 | ex | 해석\n# 주석\nreluctant | 꺼리는\nbad line\n', words);
  assert.equal(rows.length, 3); // 'bad line'은 단어만 있는 미완성 줄로 인식
  assert.equal(rows[1].duplicate, true);
  assert.equal(errors.length, 0);
  assert.deepEqual(normalizeWord(rows[2].data).meanings, []);
  assert.deepEqual(normalizeWord(rows[0].data).meanings, ['뜻1', '뜻2']);
});
