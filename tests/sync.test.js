import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, sameData } from '../src/lib/sync.js';
import { normalizeWord } from '../src/lib/word.js';

const w = (id, word, updatedAt, lastShownAt = null, extra = {}) =>
  normalizeWord({ id, word, meanings: '뜻', createdAt: 1, updatedAt, stats: { shown: 1, correct: 1, wrong: 0, lastShownAt }, ...extra });

test('같은 단어는 더 최근에 바뀐 쪽 (수정·출제 모두 반영)', () => {
  const phone = { words: [w('a', 'reluctant', 100, 500, { nuance: '폰에서 푼 기록' })], daily: [], tombstones: {} };
  const pc = { words: [w('a', 'reluctant', 300, null, { nuance: '컴퓨터에서 수정' })], daily: [], tombstones: {} };
  assert.equal(mergeData(phone, pc).words[0].nuance, '폰에서 푼 기록'); // 500 > 300
  assert.equal(mergeData(pc, phone).words[0].nuance, '폰에서 푼 기록'); // 순서 무관
});

test('양쪽에서 추가한 단어는 모두 남음', () => {
  const m = mergeData({ words: [w('a', 'vivid', 1)], daily: [] }, { words: [w('b', 'lucid', 1)], daily: [] });
  assert.deepEqual(m.words.map((x) => x.word).sort(), ['lucid', 'vivid']);
});

test('삭제는 다른 기기에서 되살아나지 않음, 삭제 뒤 다시 공부한 단어는 살림', () => {
  const local = { words: [], daily: [], tombstones: { a: 200 } };
  const remote = { words: [w('a', 'vivid', 100), w('b', 'lucid', 100, 300)], daily: [], tombstones: { b: 250 } };
  const m = mergeData(local, remote);
  assert.deepEqual(m.words.map((x) => x.id), ['b']); // a는 삭제(200 ≥ 100), b는 삭제(250) 뒤 300에 출제됨
  assert.ok(m.tombstones.a && !m.tombstones.b);
});

test('같은 철자를 두 기기에서 따로 추가하면 하나만', () => {
  const m = mergeData({ words: [w('a', 'Vivid', 100)], daily: [] }, { words: [w('b', 'vivid', 200)], daily: [] });
  assert.deepEqual(m.words.map((x) => x.id), ['b']);
  assert.ok(m.tombstones.a);
});

test('오늘 푼 문제 수: 기기별 합계, 다시 합쳐도 두 번 더해지지 않음', () => {
  const phone = { words: [], daily: [{ date: 'd', answered: 7, correct: 5, devices: { phone: { answered: 7, correct: 5 } } }] };
  const pc = { words: [], daily: [{ date: 'd', answered: 3, correct: 3, devices: { pc: { answered: 3, correct: 3 } } }] };
  const m1 = mergeData(phone, pc);
  assert.deepEqual([m1.daily[0].answered, m1.daily[0].correct], [10, 8]);
  const m2 = mergeData(m1, m1);
  assert.equal(m2.daily[0].answered, 10);
  assert.ok(sameData(m1, m2));
  // 예전 형식(기기 구분 없음)도 처리
  const legacy = mergeData({ words: [], daily: [{ date: 'd', answered: 4, correct: 2 }] }, pc);
  assert.equal(legacy.daily[0].answered, 7);
});
