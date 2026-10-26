import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMw, parseFd, cleanMw, mapPos } from '../src/lib/dictionary.js';
import { buildDraft, choicesOf, mergeMissing } from '../src/lib/autofill.js';
import { normalizeWord } from '../src/lib/word.js';

// Learner's API 응답 구조를 축약한 예시
const MW = [
  {
    meta: { id: 'decline:1', stems: ['decline', 'declined', 'declines'] },
    fl: 'verb',
    def: [{ sseq: [
      [['sense', { sn: '1', dt: [['text', '{bc}to say no to something {bc}to refuse to {d_link|accept|accept} something'], ['vis', [{ t: 'She politely {it}declined{/it} the invitation.' }]]] }]],
      [['sense', { sn: '2', dt: [['text', '{bc}to become lower in amount or less in number'], ['vis', [{ t: 'The number of students has {it}declined{/it}.' }]]] }]],
      [['pseq', [['bs', { sense: { dt: [['text', '{bc}to become worse in condition'], ['uns', [[['text', 'often used with'], ['vis', [{ t: 'Her health {it}declined{/it} rapidly.' }]]]]]] } }]]]],
    ] }],
    syns: [{ pl: 'decline, refuse', pt: [['text', '{sc}refuse{/sc} is more direct than {sc}decline{/sc}; see also {sx|reject||}']] }],
  },
  { meta: { id: 'decline:2', stems: ['decline'] }, fl: 'noun', shortdef: ['a change to a lower amount'] },
  { meta: { id: 'declination', stems: ['declination'] }, fl: 'noun', shortdef: ['something unrelated'] },
];

test('MW 파싱: 뜻·예문·유의어, 마크업 제거', () => {
  const r = parseMw('decline', MW);
  assert.equal(r.source, 'mw');
  assert.equal(r.senses[0].definition, 'to say no to something to refuse to accept something');
  assert.deepEqual(r.senses[0].examples, ['She politely declined the invitation.']);
  assert.equal(r.senses[2].definition, 'to become worse in condition');
  assert.deepEqual(r.senses[2].examples, ['Her health declined rapidly.']);
  assert.ok(r.senses.some((s) => s.pos === 'noun' && s.definition === 'a change to a lower amount'), 'shortdef 대체 안 됨: 두 번째 항목에 def 없음');
  assert.ok(!r.senses.some((s) => s.definition === 'something unrelated'));
  assert.deepEqual(r.synonyms, ['refuse', 'reject']);
  assert.throws(() => parseMw('declne', ['decline', 'recline']), (e) => e.notFound);
  assert.equal(cleanMw('{ldquo}hi{rdquo} [=hello]'), '“hi” (= hello)');
  assert.equal(mapPos('adjective'), 'adj');
});

test('FD 파싱', () => {
  const r = parseFd('vivid', [{ word: 'vivid', meanings: [{ partOfSpeech: 'adjective', synonyms: ['bright'], antonyms: ['dull'], definitions: [{ definition: 'Clear, detailed.', example: 'a vivid memory', synonyms: ['graphic'] }] }] }]);
  assert.equal(r.source, 'fd');
  assert.deepEqual(r.senses[0].examples, ['a vivid memory']);
  assert.deepEqual(r.synonyms, ['bright', 'graphic']);
  assert.deepEqual(r.antonyms, ['dull']);
  assert.equal(r.relSource, 'fd');
});

test('초안(키 없음) → 사전 내용만, 비어 있는 칸만 병합', async () => {
  const dict = parseMw('decline', MW);
  const draft = await buildDraft('decline', { dict, glosses: {}, glossError: null }, ['mw1']);
  assert.equal(draft.data.pos, 'v');
  assert.equal(draft.data.example, 'The number of students has declined.');
  assert.equal(draft.sources.example, 'mw');
  assert.equal(draft.data.meanings, undefined);
  assert.equal(draft.warnings.length, 1); // 키 없음 안내

  const existing = normalizeWord({ word: 'decline', meanings: '감소하다', example: '내 예문 declined' });
  const { word, filled } = mergeMissing(existing, draft);
  assert.deepEqual(word.meanings, ['감소하다']); // 직접 쓴 뜻 유지
  assert.equal(word.example, '내 예문 declined'); // 덮어쓰지 않음
  assert.ok(filled.includes('definition') && filled.includes('synonyms') && !filled.includes('example'));
  assert.equal(word.sources.definition, 'mw');
});

test('뜻 고르기: AI 한국어 뜻을 크게, 고른 한국어 뜻이 그대로 meanings로', async () => {
  const dict = parseMw('decline', MW);
  const res = { dict, glosses: { mw0: '거절하다', mw1: '줄어들다, 감소하다' }, glossError: null };
  const ch = choicesOf(res);
  assert.equal(ch.items[0].text, '거절하다');
  assert.equal(ch.items[0].sub, 'to say no to something to refuse to accept something');
  assert.equal(ch.items[0].pos, '동사');
  assert.equal(ch.items[2].text, 'to become worse in condition'); // 번역 없는 뜻은 영어 그대로
  const d = await buildDraft('decline', res, ['mw1', 'mw0']);
  assert.deepEqual(d.data.meanings, ['거절하다', '줄어들다', '감소하다']);
  assert.equal(d.sources.meanings, 'ai');
  assert.equal(d.data.definition, 'to say no to something to refuse to accept something / to become lower in amount or less in number');
});
