// Claude API로 여러 사전 자료를 종합해 한국어 뜻 목록, 뉘앙스 메모, 예문 해석을 만든다.
// 사용자가 설정에서 넣은 본인 키로 브라우저에서 직접 호출한다
// (Anthropic API는 anthropic-dangerous-direct-browser-access 헤더로 CORS를 허용 → 중계 서버 불필요).
// SDK는 자동 채우기를 처음 쓸 때만 불러온다(dynamic import) → 첫 화면 로딩에 영향 없음.

export const AI_MODEL = 'claude-opus-5-5';

const SYSTEM = `너는 한국 고등학생의 수능 영어 어휘 학습 앱에 들어갈 단어 해설을 쓴다.
반드시 사용자가 준 [사전 자료]의 영영 뜻풀이와 예문을 근거로 쓰고, 자료에 없는 뜻을 만들지 않는다.
수능 단어장처럼 간결한 한국어로 쓴다.

- meanings: [정한 한국어 뜻]이 있으면 그대로 옮긴다. 없으면 [선택한 뜻풀이]에 해당하는 한국어 뜻 1~3개를 짧게 쓴다 (예: "꺼리는", "마지못해 하는").
- tone: 이 뜻으로 쓰일 때의 감정 톤. positive / negative / neutral 중 하나.
- synonyms: [유의어 후보] 중에서 고른 뜻에 맞고 수능·일반 독해에 나올 만한 흔한 단어만 최대 4개. 후보에 없는 단어는 쓰지 않는다. 맞는 게 없으면 빈 배열.
- antonyms: [반의어 후보] 중에서 같은 기준으로 최대 3개.
- nuance: 2~3문장. 긍정·부정, 격식 정도(일상적/격식체), 강도를 짚고, 고른 synonyms가 있으면 그중 1~2개와의 차이를 한 문장으로 쓴다. 없으면 유의어 비교는 쓰지 않는다.
- example: [예문]이 비어 있을 때만, 선택한 뜻풀이에 맞는 수능 수준의 영어 예문 한 문장을 쓴다. [예문]이 있으면 빈 문자열.
- exampleKo: 최종 예문([예문] 또는 네가 쓴 example)의 자연스러운 한국어 해석.`;

const MERGE_SYSTEM = `너는 여러 영영사전의 뜻풀이를 종합해 수능 단어장의 뜻 목록을 만든다.
입력은 [MW](Merriam-Webster 학습자 사전), [WK](Wiktionary), [FD](Free Dictionary)의 뜻풀이와 예문이다.

- 같은 의미를 말하는 뜻풀이는 하나로 합치고, refs에 근거가 된 뜻풀이 번호(예: "mw0", "wk2")를 모두 적는다.
- 고어·방언·전문용어(프로그래밍 등)·아주 드문 뜻은 빼고, 수능·일반 독해에 자주 나오는 뜻을 앞에 둔다. 최대 6개.
- ko: 수능 단어장식 짧은 한국어 뜻 1~2개 (쉼표로 구분). 예: "꺼리는, 마지못해 하는".
- pos: 영어 품사명 (noun, verb, adjective, adverb 등).
- en: 그 뜻을 요약한 짧은 영어 설명.
- example: refs의 사전 예문 중 그 뜻에 가장 맞는 것을 글자 그대로 하나 복사한다. 없으면 빈 문자열. 예문을 새로 쓰지 않는다.
- 자료에 없는 의미를 만들지 않는다.`;

function buildUserMessage({ word, senses, koMeanings = [], synonyms = [], antonyms = [], example }) {
  const lines = [`[단어] ${word}`, `[정한 한국어 뜻] ${koMeanings.length ? koMeanings.join(', ') : '(없음)'}`, '', '[선택한 뜻풀이]'];
  senses.forEach((s, i) => {
    lines.push(`${i + 1}. (${s.pos || '?'}) ${s.definition}`);
    s.examples.forEach((ex) => lines.push(`   - 사전 예문: ${ex}`));
  });
  lines.push(
    '',
    `[유의어 후보] ${synonyms.length ? synonyms.join(', ') : '(없음)'}`,
    `[반의어 후보] ${antonyms.length ? antonyms.join(', ') : '(없음)'}`,
    `[예문] ${example || '(없음)'}`,
  );
  return lines.join('\n');
}

/**
 * @returns {Promise<{ meanings: string[], tone: string, nuance: string, example: string, exampleKo: string }>}
 */
const loadSdk = () =>
  Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod'), import('zod')]).then(
    ([sdk, helper, zod]) => ({ Anthropic: sdk.default, betaZodOutputFormat: helper.betaZodOutputFormat, z: zod.z }),
  );

// 구조화된 응답 한 번 받기 (거절 시 서버에서 다른 모델로 자동 재시도)
async function ask({ apiKey, system, user, schema }) {
  const { Anthropic, betaZodOutputFormat } = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    throw new Error(describeError(e, Anthropic));
  }
  if (response.stop_reason === 'refusal') throw new Error('AI가 이 단어의 해설 작성을 거절했어요. 직접 입력해 주세요.');
  if (!response.parsed_output) throw new Error('AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
  return response.parsed_output;
}

/**
 * 여러 사전의 뜻풀이를 종합해 한국어 뜻 목록으로
 * @param senses lookupAll().senses (id: mw0, wk1, fd2 …)
 * @returns {Promise<Array<{ ko, pos, en, refs: string[], example }>>}
 */
export async function synthesizeMeanings(word, senses, apiKey) {
  const { z } = await loadSdk();
  const tag = { mw: 'MW', wikt: 'WK', fd: 'FD' };
  const lines = [`[단어] ${word}`, ''];
  for (const s of senses) {
    lines.push(`${s.id} [${tag[s.source] || s.source}] (${s.pos || '?'}) ${s.definition}`);
    s.examples.forEach((ex) => lines.push(`   - 예문: ${ex}`));
  }
  const Item = z.object({ ko: z.string(), pos: z.string(), en: z.string(), refs: z.array(z.string()), example: z.string() });
  const out = await ask({ apiKey, system: MERGE_SYSTEM, user: lines.join('\n'), schema: z.object({ meanings: z.array(Item) }) });
  const ids = new Set(senses.map((s) => s.id));
  const allExamples = senses.flatMap((s) => s.examples);
  const norm = (x) => x.replace(/\s+/g, ' ').trim();
  return out.meanings
    .map((m) => ({
      ko: m.ko.trim(),
      pos: m.pos.trim().toLowerCase(),
      en: m.en.trim(),
      refs: m.refs.filter((r) => ids.has(r)),
      // 사전에 실제로 있는 예문만 인정 (AI가 지어낸 문장 방지)
      example: allExamples.find((ex) => norm(ex) === norm(m.example)) || '',
    }))
    .filter((m) => m.ko && m.refs.length)
    .slice(0, 6);
}

export async function generateKorean(input, apiKey) {
  const { z } = await loadSdk();
  const Schema = z.object({
    meanings: z.array(z.string()),
    tone: z.enum(['positive', 'negative', 'neutral']),
    synonyms: z.array(z.string()),
    antonyms: z.array(z.string()),
    nuance: z.string(),
    example: z.string(),
    exampleKo: z.string(),
  });
  const out = await ask({ apiKey, system: SYSTEM, user: buildUserMessage(input), schema: Schema });
  // 후보 목록에 있는 단어만 인정
  const pick = (list, pool, n) => {
    const ok = new Map(pool.map((x) => [x.toLowerCase(), x]));
    return [...new Set(list.map((x) => ok.get(x.trim().toLowerCase())).filter(Boolean))].slice(0, n);
  };
  return {
    ...out,
    meanings: out.meanings.map((m) => m.trim()).filter(Boolean).slice(0, 3),
    synonyms: pick(out.synonyms, input.synonyms || [], 4),
    antonyms: pick(out.antonyms, input.antonyms || [], 3),
  };
}

// 키 확인용: 토큰을 쓰지 않는 모델 정보 조회
export async function testClaudeKey(apiKey) {
  const { Anthropic } = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 });
  try {
    await client.models.retrieve(AI_MODEL);
  } catch (e) {
    throw new Error(describeError(e, Anthropic));
  }
}

function describeError(e, Anthropic) {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude API 키가 올바르지 않아요. 설정에서 확인해 주세요.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Claude API 키에 권한이 없어요.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude API 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (e instanceof Anthropic.APIConnectionError) return 'Claude API에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
  if (e instanceof Anthropic.APIError) {
    if (/credit|billing/i.test(e.message)) return 'Claude API 크레딧이 부족해요. console.anthropic.com에서 결제를 확인해 주세요.';
    return `Claude API 오류 (${e.status ?? '?'}): ${e.message}`;
  }
  return e?.message || 'Claude API 호출에 실패했어요.';
}
