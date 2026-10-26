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
    [{ id: 'r1', word: 'Reluctant' }],
  );
  const by = Object.fromEntries(rows.map((r) => [r.data.word, r]));
  assert.deepEqual(by.vivid.data.meanings, ['생생한', '선명한']);
  assert.deepEqual(by.lucid.data.meanings, ['명쾌한']);
  assert.deepEqual(by.obscure.data.meanings, ['모호한', '잘 알려지지 않은']);
  assert.equal(by.inevitable.data.pos, 'adj');
  assert.deepEqual(by.inevitable.data.synonyms, ['unavoidable']);
  assert.equal(by.frugal.data.nuance, '긍정');
  assert.equal(by.reluctant.duplicate, true);
  assert.equal(by.reluctant.repeat, false);
  assert.equal(by.reluctant.existingId, 'r1');
  assert.deepEqual(by.diminish.data.meanings, []);
  assert.ok(by.diminish.warnings[0].includes('미완성'));
});

test('단어 없이 시작하면 오류로 알려 줌', () => {
  const { rows, errors } = parseBulk('꺼리는\nreluctant\n꺼리는');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 1);
  assert.equal(rows.length, 1);
});

test('Claude식 마크다운: 제목·굵게·목록·머리말', () => {
  const { rows, errors } = parseBulk(`## 수능 영단어 정리

### 1. reluctant (형용사)
- **뜻**: 꺼리는, 마지못해 하는
- **뉘앙스**: 부정적. 하기 싫은 마음이 드러남
- **예문**: She was reluctant to admit her mistake.
- **해석**: 그녀는 자신의 실수를 인정하기를 꺼렸다.
- **유의어**: hesitant, unwilling

### 2. curtail (동사)
- **뜻**: 줄이다, 축소하다
- **예문**: The company curtailed its spending. (그 회사는 지출을 줄였다.)`);
  assert.equal(errors.length, 1); // 첫 제목 줄 '수능 영단어 정리'는 단어가 아니라서 알려 줌
  assert.equal(rows.length, 2);
  assert.deepEqual(fields(rows[0]), {
    word: 'reluctant', meanings: ['꺼리는', '마지못해 하는'], pos: 'adj', nuance: '부정적. 하기 싫은 마음이 드러남',
    example: 'She was reluctant to admit her mistake.', exampleKo: '그녀는 자신의 실수를 인정하기를 꺼렸다.',
    synonyms: ['hesitant', 'unwilling'], antonyms: [],
  });
  assert.equal(rows[1].data.example, 'The company curtailed its spending.');
  assert.equal(rows[1].data.exampleKo, '그 회사는 지출을 줄였다.');
  assert.equal(rows[1].data.pos, 'v');
});

test('Claude식 한 줄 + 화살표 예문, 영어 머리말', () => {
  const { rows } = parseBulk(`**1. abate** [동사] 줄어들다, 약해지다
→ The storm finally abated. (폭풍이 마침내 잦아들었다.)
**2. frugal** — 검소한, 절약하는
   ex) She lives a frugal life.
   그녀는 검소하게 산다.

meticulous
Meaning: 꼼꼼한, 세심한
Part of speech: adjective
Example sentence: He kept meticulous records.
Translation: 그는 꼼꼼하게 기록했다.`);
  const by = Object.fromEntries(rows.map((r) => [r.data.word, r.data]));
  assert.deepEqual(Object.keys(by), ['abate', 'frugal', 'meticulous']);
  assert.deepEqual(by.abate.meanings, ['줄어들다', '약해지다']);
  assert.equal(by.abate.pos, 'v');
  assert.equal(by.abate.example, 'The storm finally abated.');
  assert.equal(by.abate.exampleKo, '폭풍이 마침내 잦아들었다.');
  assert.equal(by.frugal.example, 'She lives a frugal life.');
  assert.equal(by.frugal.exampleKo, '그녀는 검소하게 산다.');
  assert.deepEqual(by.meticulous.meanings, ['꼼꼼한', '세심한']);
  assert.equal(by.meticulous.pos, 'adj');
  assert.equal(by.meticulous.exampleKo, '그는 꼼꼼하게 기록했다.');
});

test('표: 마크다운 표·복사한 표의 제목 줄 순서를 따름', () => {
  const md = parseBulk(`| 번호 | 단어 | 품사 | 뜻 | 예문 | 해석 |
|---|---|---|---|---|---|
| 1 | **frugal** | 형용사 | 검소한, 절약하는 | She lives a frugal life. | 그녀는 검소하게 산다. |
| 2 | curtail | 동사 | 줄이다 | They curtailed the trip. | 그들은 여행을 줄였다. |`);
  assert.equal(md.errors.length, 0);
  assert.equal(md.rows.length, 2);
  assert.deepEqual(fields(md.rows[0]), {
    word: 'frugal', meanings: ['검소한', '절약하는'], pos: 'adj', nuance: '',
    example: 'She lives a frugal life.', exampleKo: '그녀는 검소하게 산다.', synonyms: [], antonyms: [],
  });
  // 채팅 화면의 표를 복사하면 탭으로 구분됨
  const tab = parseBulk('단어\t뜻\t예문\t예문 해석\nabate\t줄어들다\tThe storm abated.\t폭풍이 잦아들었다.');
  assert.deepEqual([tab.rows[0].data.meanings, tab.rows[0].data.example, tab.rows[0].data.exampleKo], [['줄어들다'], 'The storm abated.', '폭풍이 잦아들었다.']);
});

// 사용자가 실제로 Claude에게 받아 붙여 넣은 형식 (단어 | 품사 | 뜻 / 예문 / 해석)
const USER_PASTE = `assume | 동사 | 가정하다, 추정하다; (책임·역할을) 맡다; (태도·성질을) 띠다
Many negotiators assume that one side's gain must be the other side's loss.
많은 협상가들은 한쪽의 이득이 반드시 다른 쪽의 손실이라고 가정한다.

integrative | 형용사 | 통합적인, 통합하는 (반의: distributive 분배적인)
An integrative approach looks for solutions that satisfy everyone's interests.
통합적인 접근법은 모두의 이익을 충족하는 해결책을 찾는다.

settlement (← settlements) | 명사 | 합의, 해결; 정착(지); 정산
The two companies finally reached a settlement after months of talks.
두 회사는 몇 달간의 협의 끝에 마침내 합의에 이르렀다.

mutually | 부사 | 서로, 상호간에 (mutually exclusive: 상호 배타적인)
They worked out a mutually beneficial agreement.
그들은 서로에게 이로운 합의를 도출했다.

conflict | 명사 | 갈등, 충돌 / 동사 | 상충하다, 충돌하다 (명사는 앞, 동사는 뒤에 강세)
Conflict is not always harmful; it can lead to better decisions.
갈등이 항상 해로운 것은 아니며, 더 나은 결정으로 이어질 수도 있다.

contribute | 동사 | 기여하다, 공헌하다; 기부하다; (to) ~의 한 원인이 되다
Poor communication often contributes to misunderstandings.
부족한 의사소통은 흔히 오해의 한 원인이 된다.`;

test('표 줄 + 아래 예문·해석 (실제 붙여 넣은 형식)', () => {
  const { rows, errors } = parseBulk(USER_PASTE);
  assert.equal(errors.length, 0);
  const by = Object.fromEntries(rows.map((r) => [r.data.word, r.data]));
  assert.deepEqual(Object.keys(by), ['assume', 'integrative', 'settlement', 'mutually', 'conflict', 'contribute']);
  for (const d of Object.values(by)) {
    assert.ok(d.meanings.length && d.example && d.exampleKo, d.word);
  }
  assert.equal(by.assume.pos, 'v');
  assert.deepEqual(by.assume.meanings, ['가정하다', '추정하다', '(책임·역할을) 맡다', '(태도·성질을) 띠다']);
  assert.equal(by.assume.example, "Many negotiators assume that one side's gain must be the other side's loss.");
  assert.equal(by.assume.exampleKo, '많은 협상가들은 한쪽의 이득이 반드시 다른 쪽의 손실이라고 가정한다.');
  assert.deepEqual(by.integrative.meanings, ['통합적인', '통합하는']);
  assert.deepEqual(by.integrative.antonyms, ['distributive']);
  assert.equal(by.integrative.nuance, '반의: distributive 분배적인');
  assert.equal(by.settlement.nuance, '본문 형태: settlements');
  assert.deepEqual(by.settlement.meanings, ['합의', '해결', '정착(지)', '정산']);
  assert.deepEqual(by.mutually.meanings, ['서로', '상호간에']);
  assert.equal(by.mutually.nuance, 'mutually exclusive: 상호 배타적인');
  assert.equal(by.conflict.pos, 'n');
  assert.deepEqual(by.conflict.meanings, ['갈등', '충돌', '상충하다', '충돌하다']);
  assert.equal(by.conflict.nuance, '명사는 앞, 동사는 뒤에 강세');
  assert.deepEqual(by.contribute.meanings, ['기여하다', '공헌하다', '기부하다', '(to) ~의 한 원인이 되다']);
});
