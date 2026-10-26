import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMw, parseFd, parseWiktionary, cleanMw, mapPos, lookupAll } from '../src/lib/dictionary.js';
import { synthesizeMeanings } from '../src/lib/aiFill.js';
import { buildDraft, choicesOf, mergeMissing } from '../src/lib/autofill.js';
import { normalizeWord } from '../src/lib/word.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

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

// fetch 가짜 응답 (URL 일부 → 응답 본문 또는 함수)
const realFetch = globalThis.fetch;
function mockFetch(routes) {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    for (const [part, body] of routes) {
      if (url.includes(part)) {
        const b = typeof body === 'function' ? body(url, init) : body;
        if (b instanceof Error) throw b;
        const [status, payload] = Array.isArray(b) && b[0] === 'status' ? [b[1], b[2]] : [200, b];
        return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
        });
      }
    }
    throw new Error('unexpected fetch ' + url);
  };
}
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('MW 파싱: 뜻·예문·유의어, 마크업 제거', () => {
  const r = parseMw('decline', MW);
  assert.equal(r.senses[0].definition, 'to say no to something to refuse to accept something');
  assert.deepEqual(r.senses[0].examples, ['She politely declined the invitation.']);
  assert.deepEqual(r.senses[2].examples, ['Her health declined rapidly.']);
  assert.ok(r.senses.some((s) => s.pos === 'noun' && s.definition === 'a change to a lower amount'));
  assert.ok(!r.senses.some((s) => s.definition === 'something unrelated'));
  assert.deepEqual(r.synonyms, ['refuse', 'reject']);
  assert.throws(() => parseMw('declne', ['decline', 'recline']), (e) => e.notFound);
  assert.equal(cleanMw('{ldquo}hi{rdquo} [=hello]'), '“hi” (= hello)');
  assert.equal(mapPos('adjective'), 'adj');
});

test('FD·Wiktionary 파싱 (Wiktionary는 실제 응답 저장본)', () => {
  const fd = parseFd('vivid', [{ word: 'vivid', meanings: [{ partOfSpeech: 'adjective', synonyms: ['bright'], antonyms: ['dull'], definitions: [{ definition: 'Clear, detailed.', example: 'a vivid memory', synonyms: ['graphic'] }] }] }]);
  assert.deepEqual(fd.synonyms, ['bright', 'graphic']);
  const wk = parseWiktionary(fixture('wikt-reluctant.json'));
  assert.equal(wk.senses[0].pos, 'adjective');
  assert.equal(wk.senses[0].definition, 'Not wanting to take some action; unwilling to do something.');
  assert.equal(wk.senses[0].examples[0], 'She was reluctant to lend him the money');
  assert.ok(!wk.senses.some((s) => /</.test(s.definition)), 'HTML 제거');
});

test('종합 조회: 사전 여러 개를 모으고 하나가 장애여도 진행', async () => {
  mockFetch([
    ['dictionaryapi.com', MW],
    ['wiktionary.org', fixture('wikt-reluctant.json')],
    ['dictionaryapi.dev', ['status', 502, 'error code: 502']],
    ['rel_syn', [{ word: 'refuse' }, { word: 'deteriorate' }]],
    ['rel_ant', [{ word: 'accept' }]],
  ]);
  const all = await lookupAll('decline', { mwKey: 'k' });
  assert.deepEqual(all.found, ['mw', 'wikt']);
  assert.deepEqual(all.failed, ['fd']);
  assert.ok(all.senses.some((s) => s.id === 'mw0' && s.source === 'mw'));
  assert.ok(all.senses.some((s) => s.id === 'wk0' && s.source === 'wikt'));
  assert.deepEqual(all.synonyms.map((x) => x.word), ['refuse', 'reject', 'deteriorate']); // MW 먼저, Datamuse 'refuse'는 중복 제거
  assert.deepEqual(all.antonyms, [{ word: 'accept', source: 'dm' }]);

  mockFetch([['dictionaryapi.com', ['vividly']], ['wiktionary.org', ['status', 404, '{}']], ['dictionaryapi.dev', ['status', 404, '{}']], ['datamuse', []]]);
  await assert.rejects(lookupAll('zzqx', { mwKey: 'k' }), (e) => e.notFound);
});

test('AI 종합: 근거 번호 검증, 지어낸 예문은 버림', async () => {
  const senses = [
    { id: 'mw0', source: 'mw', pos: 'verb', definition: 'to refuse', examples: ['She politely declined the invitation.'] },
    { id: 'wk0', source: 'wikt', pos: 'verb', definition: 'To refuse.', examples: [] },
    { id: 'mw1', source: 'mw', pos: 'verb', definition: 'to become lower', examples: ['Sales declined.'] },
  ];
  let sent;
  mockFetch([
    ['api.anthropic.com', (url, init) => {
      sent = JSON.parse(init.body);
      const meanings = [
        { ko: '거절하다', pos: 'verb', en: 'refuse politely', refs: ['mw0', 'wk0', 'zz9'], example: 'She politely  declined the invitation.' },
        { ko: '감소하다', pos: 'verb', en: 'go down', refs: ['mw1'], example: 'Profits declined sharply last year.' },
        { ko: '근거 없음', pos: 'verb', en: '?', refs: ['nope'], example: '' },
      ];
      return { id: 'm', type: 'message', role: 'assistant', model: sent.model, content: [{ type: 'text', text: JSON.stringify({ meanings }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    }],
  ]);
  const out = await synthesizeMeanings('decline', senses, 'sk-ant-test');
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.match(sent.messages[0].content, /mw0 \[MW\] \(verb\) to refuse/);
  assert.match(sent.messages[0].content, /wk0 \[WK\]/);
  assert.equal(out.length, 2); // 근거 없는 항목 제외
  assert.deepEqual(out[0].refs, ['mw0', 'wk0']); // 없는 번호 제거
  assert.equal(out[0].example, 'She politely declined the invitation.'); // 공백만 다른 건 사전 원문으로
  assert.equal(out[1].example, ''); // 사전에 없는 예문은 버림
});

test('뜻 고르기·초안: 종합 뜻 → 한국어 뜻, 근거 사전 원문 뜻풀이·예문, 유의어 출처', async () => {
  const all = {
    senses: [
      { id: 'mw0', source: 'mw', pos: 'verb', definition: 'to say no to something', examples: ['She politely declined the invitation.'] },
      { id: 'mw1', source: 'mw', pos: 'verb', definition: 'to become lower in amount', examples: ['The number of students has declined.'] },
      { id: 'wk0', source: 'wikt', pos: 'verb', definition: 'To refuse.', examples: [] },
    ],
    synonyms: [{ word: 'refuse', source: 'mw' }, { word: 'deteriorate', source: 'dm' }],
    antonyms: [],
    found: ['mw', 'wikt'],
    failed: ['fd'],
  };
  const merged = [
    { id: 'm0', ko: '감소하다, 줄어들다', pos: 'verb', en: 'go down', refs: ['mw1'], example: 'The number of students has declined.' },
    { id: 'm1', ko: '거절하다', pos: 'verb', en: 'refuse politely', refs: ['wk0', 'mw0'], example: '' },
  ];
  const res = { all, merged, mergeError: null };
  const ch = choicesOf(res);
  assert.equal(ch.items[1].text, '거절하다');
  assert.deepEqual(ch.items[1].refs, ['Wiktionary', 'MW']);
  assert.equal(ch.items[0].pos, '동사');

  const d = await buildDraft('decline', res, ['m1']);
  assert.deepEqual(d.data.meanings, ['거절하다']);
  assert.equal(d.data.definition, 'to say no to something'); // MW 원문 우선
  assert.equal(d.sources.definition, 'mw');
  assert.equal(d.data.example, 'She politely declined the invitation.');
  assert.equal(d.sources.example, 'mw');
  assert.deepEqual(d.data.synonyms, ['refuse', 'deteriorate']);
  assert.equal(d.sources.synonyms, 'mix');
  assert.ok(d.warnings.some((w) => w.includes('Free Dictionary')));

  // AI 종합 없이 (키 없음): 대표 사전(MW) 영어 뜻풀이로 고르기
  const plain = choicesOf({ all, merged: null });
  assert.equal(plain.source, 'mw');
  assert.equal(plain.items.length, 2);
  const d2 = await buildDraft('decline', { all, merged: null }, ['mw1']);
  assert.equal(d2.data.meanings, undefined);
  assert.equal(d2.data.example, 'The number of students has declined.');
});

test('비어 있는 칸만 병합', () => {
  const existing = normalizeWord({ word: 'decline', meanings: '감소하다', example: '내 예문 declined' });
  const { word, filled } = mergeMissing(existing, { data: { meanings: ['x'], example: 'y', definition: 'def' }, sources: { definition: 'mw' } });
  assert.deepEqual(word.meanings, ['감소하다']);
  assert.equal(word.example, '내 예문 declined');
  assert.deepEqual(filled, ['definition']);
  assert.equal(word.sources.definition, 'mw');
});

test('AI 해설: 유의어·반의어는 후보 중에서만', async () => {
  const { generateKorean } = await import('../src/lib/aiFill.js');
  mockFetch([
    ['api.anthropic.com', (url, init) => {
      const b = JSON.parse(init.body);
      const out = { meanings: ['꼼꼼한'], tone: 'positive', synonyms: ['careful', 'Painstaking', 'thorough'], antonyms: ['careless', 'messy'], nuance: 'n', example: '', exampleKo: 'k' };
      return { id: 'm', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    }],
  ]);
  const r = await generateKorean({ word: 'meticulous', senses: [], synonyms: ['careful', 'painstaking', 'bemist'], antonyms: ['careless'], example: 'x' }, 'sk-ant-test');
  assert.deepEqual(r.synonyms, ['careful', 'painstaking']); // 후보에 없는 thorough 제외, 표기는 후보대로
  assert.deepEqual(r.antonyms, ['careless']);
});
