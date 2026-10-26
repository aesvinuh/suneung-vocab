import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBulk } from '../src/lib/parse.js';

const fields = (r) => {
  const { word, meanings, pos, nuance, example, exampleKo, synonyms, antonyms } = r.data;
  return { word, meanings, pos, nuance, example, exampleKo, synonyms, antonyms };
};

test('여러 줄 형식: 머리말 없이 내용으로 칸 나누기', () => {
  const { rows, errors } = parseBulk(`reluctant (형)
꺼리는, 마지못해 하는
부정적. 하기 싫어서 꺼리는 느낌, hesitant보다 싫은 감정이 강함
He was reluctant to admit his mistake.
그는 자기 실수를 인정하기를 꺼렸다.
curtail
[동] 줄이다, 축소하다
The government curtailed public spending.
정부는 공공 지출을 줄였다.`);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(fields(rows[0]), {
    word: 'reluctant', meanings: ['꺼리는', '마지못해 하는'], pos: 'adj',
    nuance: '부정적. 하기 싫어서 꺼리는 느낌, hesitant보다 싫은 감정이 강함',
    example: 'He was reluctant to admit his mistake.', exampleKo: '그는 자기 실수를 인정하기를 꺼렸다.',
    synonyms: [], antonyms: [],
  });
  assert.equal(rows[1].data.pos, 'v');
  assert.deepEqual(rows[1].data.meanings, ['줄이다', '축소하다']);
  assert.equal(rows[1].data.exampleKo, '정부는 공공 지출을 줄였다.');
  assert.deepEqual(rows[1].warnings, []);
});

test('머리말 형식 + 번호 + 빈 줄 구분', () => {
  const { rows, errors } = parseBulk(`1. meticulous
뜻: 꼼꼼한, 세심한
품사: 형용사
뉘앙스: 긍정. careful보다 강함
예문: She kept meticulous records.
해석: 그녀는 꼼꼼하게 기록했다.
유의어: careful, thorough
반의어: careless

2. give up
- 포기하다`);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(fields(rows[0]), {
    word: 'meticulous', meanings: ['꼼꼼한', '세심한'], pos: 'adj', nuance: '긍정. careful보다 강함',
    example: 'She kept meticulous records.', exampleKo: '그녀는 꼼꼼하게 기록했다.',
    synonyms: ['careful', 'thorough'], antonyms: ['careless'],
  });
  assert.equal(rows[1].data.word, 'give up');
  assert.deepEqual(rows[1].data.meanings, ['포기하다']);
});

test('한 줄에 단어와 뜻, 파이프·탭 형식, 미완성, 중복', () => {
  const { rows } = parseBulk(
    `vivid - 생생한, 선명한
lucid: 명쾌한
obscure 모호한, 잘 알려지지 않은
inevitable | 불가피한 | 중립·격식 | Change is inevitable. | 변화는 불가피하다. | adj | unavoidable
frugal\t검소한\t긍정
reluctant
diminish`,
    [{ word: 'Reluctant' }],
  );
  const by = Object.fromEntries(rows.map((r) => [r.data.word, r]));
  assert.deepEqual(by.vivid.data.meanings, ['생생한', '선명한']);
  assert.deepEqual(by.lucid.data.meanings, ['명쾌한']);
  assert.deepEqual(by.obscure.data.meanings, ['모호한', '잘 알려지지 않은']);
  assert.equal(by.inevitable.data.pos, 'adj');
  assert.deepEqual(by.inevitable.data.synonyms, ['unavoidable']);
  assert.equal(by.frugal.data.nuance, '긍정');
  assert.equal(by.reluctant.duplicate, true);
  assert.deepEqual(by.diminish.data.meanings, []);
  assert.ok(by.diminish.warnings[0].includes('미완성'));
});

test('단어 없이 시작하면 오류로 알려 줌', () => {
  const { rows, errors } = parseBulk('꺼리는\nreluctant\n꺼리는');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 1);
  assert.equal(rows.length, 1);
});
