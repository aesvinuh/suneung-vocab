// Claude API로 한국어 뜻·뉘앙스 메모·예문 해석 생성.
// 사용자가 설정에서 넣은 본인 키로 브라우저에서 직접 호출한다
// (Anthropic API는 anthropic-dangerous-direct-browser-access 헤더로 CORS를 허용 → 중계 서버 불필요).
// SDK는 자동 채우기를 처음 쓸 때만 불러온다(dynamic import) → 첫 화면 로딩에 영향 없음.

export const AI_MODEL = 'claude-opus-5-5';

const SYSTEM = `너는 한국 고등학생의 수능 영어 어휘 학습 앱에 들어갈 단어 해설을 쓴다.
반드시 사용자가 준 [사전 자료]의 영영 뜻풀이와 예문을 근거로 쓰고, 자료에 없는 뜻을 만들지 않는다.
수능 단어장처럼 간결한 한국어로 쓴다.

- meanings: [정한 한국어 뜻]이 있으면 그대로 옮긴다. 없으면 [선택한 뜻풀이]에 해당하는 한국어 뜻 1~3개를 짧게 쓴다 (예: "꺼리는", "마지못해 하는").
- tone: 이 뜻으로 쓰일 때의 감정 톤. positive / negative / neutral 중 하나.
- nuance: 2~3문장. 긍정·부정, 격식 정도(일상적/격식체), 강도를 짚고, [유의어]가 있으면 그중 1~2개와의 차이를 한 문장으로 쓴다. [유의어]가 비어 있으면 유의어 비교는 쓰지 않는다.
- example: [예문]이 비어 있을 때만, 선택한 뜻풀이에 맞는 수능 수준의 영어 예문 한 문장을 쓴다. [예문]이 있으면 빈 문자열.
- exampleKo: 최종 예문([예문] 또는 네가 쓴 example)의 자연스러운 한국어 해석.`;

const GLOSS_SYSTEM = `너는 영영사전 뜻풀이를 수능 단어장식 한국어 뜻으로 옮긴다.
각 뜻풀이를 그 뜻풀이에만 근거해 짧은 한국어 뜻 1~2개(쉼표로 구분)로 옮긴다. 예: "꺼리는, 마지못해 하는".
뜻풀이 개수와 순서를 그대로 지켜 glosses 배열로 답한다. 뜻풀이에 없는 의미를 더하지 않는다.`;

function buildUserMessage({ word, senses, koMeanings = [], synonyms, example }) {
  const lines = [`[단어] ${word}`, `[정한 한국어 뜻] ${koMeanings.length ? koMeanings.join(', ') : '(없음)'}`, '', '[선택한 뜻풀이]'];
  senses.forEach((s, i) => {
    lines.push(`${i + 1}. (${s.pos || '?'}) ${s.definition}`);
    s.examples.forEach((ex) => lines.push(`   - 사전 예문: ${ex}`));
  });
  lines.push('', `[유의어] ${synonyms.length ? synonyms.join(', ') : '(없음)'}`, `[예문] ${example || '(없음)'}`);
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
 * 뜻 고르기 화면용: 영영 뜻풀이 각각을 짧은 한국어 뜻으로
 * @returns {Promise<string[]>} senses와 같은 순서·개수
 */
export async function translateSenses(word, senses, apiKey) {
  const { z } = await loadSdk();
  const user = [`[단어] ${word}`, ...senses.map((s, i) => `${i + 1}. (${s.pos || '?'}) ${s.definition}`)].join('\n');
  const out = await ask({ apiKey, system: GLOSS_SYSTEM, user, schema: z.object({ glosses: z.array(z.string()) }) });
  if (out.glosses.length !== senses.length) throw new Error('AI가 뜻 목록을 제대로 옮기지 못했어요.');
  return out.glosses.map((g) => g.trim());
}

export async function generateKorean(input, apiKey) {
  const { z } = await loadSdk();
  const Schema = z.object({
    meanings: z.array(z.string()),
    tone: z.enum(['positive', 'negative', 'neutral']),
    nuance: z.string(),
    example: z.string(),
    exampleKo: z.string(),
  });
  const out = await ask({ apiKey, system: SYSTEM, user: buildUserMessage(input), schema: Schema });
  return { ...out, meanings: out.meanings.map((m) => m.trim()).filter(Boolean).slice(0, 3) };
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
