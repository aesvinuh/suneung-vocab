import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMw, parseFd, cleanMw, mapPos, parseKoWiktionary } from '../src/lib/dictionary.js';
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
  const draft = await buildDraft('decline', { en: dict, ko: null }, ['mw1']);
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

const koFixture = (w) => JSON.parse(readFileSync(new URL(`./fixtures/fixtures-ko-${w}.json`, import.meta.url))).parse.wikitext;

test('위키낱말사전 파싱 (실제 응답 저장본)', () => {
  assert.deepEqual(parseKoWiktionary(koFixture('reluctant')).senses, [{ id: 'ko0', pos: 'adj', posLabel: '형용사', meaning: '마음이 내키지 않는, 꺼리는' }]);
  const und = parseKoWiktionary(koFixture('undermine')).senses; // 품사 제목 없이 분류로만 품사 표시
  assert.equal(und.length, 3);
  assert.equal(und[1].meaning, '(특히 자신감・권위 등을) 약화시키다');
  assert.equal(und[1].pos, 'v');
  const obs = parseKoWiktionary(koFixture('obscure')).senses.map((s) => s.pos);
  assert.deepEqual(obs, ['adj', 'v', 'v']);
  assert.throws(() => parseKoWiktionary('== 프랑스어 ==\n# 무엇'), (e) => e.notFound);
  assert.throws(() => parseKoWiktionary('== 영어 ==\n#\n:*'), (e) => e.notFound); // 뜻이 빈 초안
});

test('한국어 뜻 우선: 고른 한국어 뜻 → meanings, 같은 품사의 영영 뜻·예문', async () => {
  const ko = parseKoWiktionary(koFixture('obscure'));
  const en = { source: 'mw', relSource: null, synonyms: [], antonyms: [], senses: [
    { id: 'mw0', pos: 'adjective', definition: 'not well known', examples: ['an obscure poet'] },
    { id: 'mw1', pos: 'verb', definition: 'to hide or cover', examples: ['Clouds obscured the moon.'] },
  ] };
  const ch = choicesOf({ en, ko });
  assert.equal(ch.source, 'kowikt');
  assert.equal(ch.items[1].text, '가리다, 덮다');
  const d = await buildDraft('obscure', { en, ko }, ['ko1', 'ko2']);
  assert.deepEqual(d.data.meanings, ['가리다', '덮다', '어둡게 하다']);
  assert.equal(d.sources.meanings, 'kowikt');
  assert.equal(d.data.pos, 'v');
  assert.equal(d.data.definition, 'to hide or cover');
  assert.equal(d.data.example, 'Clouds obscured the moon.');
  // 영영 사전이 없어도 한국어 뜻만으로 초안
  const onlyKo = await buildDraft('obscure', { en: null, ko }, ['ko0']);
  assert.deepEqual(onlyKo.data.meanings, ['애매한', '명로하지 않은']);
  assert.equal(choicesOf({ en, ko: null }).items[0].pos, '형용사');
});
