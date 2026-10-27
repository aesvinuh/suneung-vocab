// Claude API로 여러 사전 자료를 종합해 한국어 뜻 목록, 뉘앙스 메모, 예문 해석을 만든다.
// 사용자가 설정에서 넣은 본인 키로 브라우저에서 직접 호출한다
// (Anthropic API는 anthropic-dangerous-direct-browser-access 헤더로 CORS를 허용 → 중계 서버 불필요).
// SDK는 자동 채우기를 처음 쓸 때만 불러온다(dynamic import) → 첫 화면 로딩에 영향 없음.

import { canRequest, getDailyLimit, recordUsage } from './usage.js';

export const AI_MODEL = 'claude-opus-5-5';

const SYSTEM = `너는 한국 고등학생의 수능 영어 어휘 학습 앱에 들어갈 단어 해설을 쓴다.
반드시 사용자가 준 [사전 자료]의 영영 뜻풀이와 예문을 근거로 쓰고, 자료에 없는 뜻을 만들지 않는다.
수능 단어장처럼 간결한 한국어로 쓴다.

- meanings: [정한 한국어 뜻]이 있으면 그대로 옮긴다. 없으면 [선택한 뜻풀이]에 해당하는 한국어 뜻 1~3개를 짧게 쓴다 (예: "꺼리는", "마지못해 하는").
- tone: 이 뜻으로 쓰일 때의 감정 톤. positive / negative / neutral 중 하나.
- synonyms: [유의어 후보] 중에서 고른 뜻에 맞고 수능·일반 독해에 나올 만한 흔한 단어만 최대 4개. 후보에 없는 단어는 쓰지 않는다. 맞는 게 없으면 빈 배열.
- antonyms: [반의어 후보] 중에서 같은 기준으로 최대 3개.
- nuance: 2~3문장. 긍정·부정, 격식 정도(일상적/격식체), 강도를 짚고, 고른 synonyms가 있으면 그중 1~2개와의 차이를 한 문장으로 쓴다. 없으면 유의어 비교는 쓰지 않는다. 숙어·반의어·활용형·발음 정보는 nuance에 넣지 않는다.
- related: [선택한 뜻풀이]나 사전 예문에 실제로 나온, 이 뜻과 관련된 숙어·연어 0~2개를 "표현: 한국어 뜻" 형식으로, 여러 개면 " · "로 구분. 자료에 없으면 빈 문자열.
- example: [예문]이 비어 있을 때만, 선택한 뜻풀이에 맞는 수능 수준의 영어 예문 한 문장을 쓴다. [예문]이 있으면 빈 문자열.
- exampleKo: 최종 예문([예문] 또는 네가 쓴 example)의 자연스러운 한국어 해석.
- profile: 이 뜻의 뉘앙스 프로필 초안 (사전 자료 근거)
  · direction: 이 단어가 담는 평가 방향 positive / negative / neutral / context(문맥에 따라 다름)
  · role: 글 속 역할 signal(흐름 신호어: 대조·인과·양보·강조를 알림) / evaluative(필자의 태도·평가를 드러냄) / content(대상을 가리킴)
  · signal: role이 signal이면 contrast / cause / concession / emphasis, 아니면 none
  · intensity: weak / medium / strong
  · keywords: 느낌 키워드 1~3개 (짧은 한국어, 예: "마지못함", "소극적")
  · diff: 고른 synonyms가 있으면 그 단어들과의 차이 한 문장, 없으면 빈 문자열`;

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
  if (!canRequest()) throw new Error(`오늘 AI 요청 한도(${getDailyLimit()}회)를 다 썼어요. 설정에서 한도를 바꾸거나 내일 다시 시도해 주세요.`);
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
  recordUsage(response.usage);
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
    related: z.string(),
    example: z.string(),
    exampleKo: z.string(),
    profile: ProfileSchema(z),
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
    profile: cleanProfile(out.profile),
  };
}

const ProfileSchema = (z) =>
  z.object({
    direction: z.enum(['positive', 'negative', 'neutral', 'context']),
    role: z.enum(['signal', 'evaluative', 'content']),
    signal: z.enum(['contrast', 'cause', 'concession', 'emphasis', 'none']),
    intensity: z.enum(['weak', 'medium', 'strong']),
    keywords: z.array(z.string()),
    diff: z.string(),
  });
const cleanProfile = (p) => ({ ...p, signal: p.signal === 'none' ? '' : p.signal, keywords: p.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 3) });

// ── 콘텐츠 풀 일괄 생성 (여러 단어를 요청 한 번에) ───────────────────

const POOL_SYSTEM = `너는 수능 영어 어휘 학습 앱의 문제 재료를 만든다. 입력된 단어마다 [필요] 항목만 채우고, 필요 없는 항목은 빈 배열·빈 문자열로 둔다.
각 단어의 [뜻]·[영영]·[내 예문] 자료를 근거로, 그 뜻으로만 쓴다.

- examples: 수능 지문 스타일(학술·사회·과학·심리 등)의 영어 예문. 15~30단어, 그 단어(필요하면 활용형)를 정확히 한 번 쓴다. 활용형(-s, -ed, -ing 등)을 골고루 섞는다.
  · ko: 자연스러운 한국어 해석
  · why: 이 문장에서 왜 이 단어가 맞는지, 문맥의 단서를 짚어 한국어 한 문장
- userWhy: [내 예문]이 있으면 그 문장에서 이 단어가 맞는 이유 한 문장, 없으면 빈 문자열
- grammar: transitivity(vt 타동사 / vi 자동사 / both / none 동사 아님), pattern(자주 오는 뒤 구조: "to부정사", "that절", "전치사 to" 등, 없으면 빈 문자열),
  level(1 기초 ~ 5 고난도 수능 어휘), forms(s, ed, en(과거분사), ing — 동사가 아니면 빈 문자열)
- confusables: 학생이 이 단어와 헷갈릴 만한 다른 영어 단어 8개. 반드시 이 단어와 같은 품사.
  · pos: 품사를 n / v / adj / adv 중 하나로
  · type: spelling(철자 혼동) / meaning(의미 혼동) / range(같은 의미 범위의 다른 단어)
  · meanings: 한국어 뜻 1~3개 — 이 단어의 한국어 뜻과 같은 형태로 (동사면 "~하다", 형용사면 "~한/~적인")
  · forms: 위 grammar.forms와 같은 형식, transitivity·pattern·level도 같은 기준
  · why: 왜 헷갈리는지와 정답 단어와의 차이를 한국어 한 문장
  · [제외]에 있는 단어와 정답 단어 자신은 쓰지 않는다
- profile: 뉘앙스 프로필 초안
  · direction: positive / negative / neutral / context(문맥에 따라 다름)
  · role: signal(흐름 신호어) / evaluative(필자의 태도·평가) / content(대상 지칭), signal: role이 signal이면 contrast / cause / concession / emphasis, 아니면 none
  · intensity: weak / medium / strong, keywords: 느낌 키워드 1~3개(짧은 한국어), diff: 비슷한 단어와의 차이 한 문장`;

/**
 * @param items [{ word, pos, meanings[], definition, example, exampleKo, nuance, synonyms[],
 *                 needs: { examples: number, userWhy, grammar, confusables, profile } }]
 * @param exclude 혼동 단어로 쓰면 안 되는 단어 (내 단어장)
 * @returns {Promise<Array<{ word, examples[], userWhy, grammar, confusables[], profile }>>}
 */
export async function generatePools(items, exclude, apiKey) {
  const { z } = await loadSdk();
  const Forms = z.object({ s: z.string(), ed: z.string(), en: z.string(), ing: z.string() });
  const Transitivity = z.enum(['vt', 'vi', 'both', 'none']);
  const Schema = z.object({
    words: z.array(
      z.object({
        word: z.string(),
        examples: z.array(z.object({ en: z.string(), ko: z.string(), why: z.string() })),
        userWhy: z.string(),
        grammar: z.object({ transitivity: Transitivity, pattern: z.string(), level: z.number().int(), forms: Forms }),
        confusables: z.array(
          z.object({
            word: z.string(),
            pos: z.string(),
            meanings: z.array(z.string()),
            forms: Forms,
            type: z.enum(['spelling', 'meaning', 'range']),
            why: z.string(),
            transitivity: Transitivity,
            pattern: z.string(),
            level: z.number().int(),
          }),
        ),
        profile: ProfileSchema(z),
      }),
    ),
  });
  const lines = [`[제외] ${exclude.slice(0, 400).join(', ')}`, ''];
  for (const it of items) {
    const n = it.needs;
    const need = [
      n.examples ? `예문 ${n.examples}개` : '',
      n.userWhy ? '내 예문 이유' : '',
      n.grammar ? '문법' : '',
      n.confusables ? '헷갈리는 단어' : '',
      n.profile ? '뉘앙스 프로필' : '',
    ].filter(Boolean);
    lines.push(`### ${it.word} (${it.pos || '품사 미상'})`, `[필요] ${need.join(', ')}`, `[뜻] ${it.meanings.join(', ')}`);
    if (it.definition) lines.push(`[영영] ${it.definition}`);
    if (it.example) lines.push(`[내 예문] ${it.example}${it.exampleKo ? ' / ' + it.exampleKo : ''}`);
    if (it.nuance) lines.push(`[느낌 메모] ${it.nuance}`);
    if (it.synonyms.length) lines.push(`[유의어] ${it.synonyms.join(', ')}`);
    lines.push('');
  }
  const out = await ask({ apiKey, system: POOL_SYSTEM, user: lines.join('\n'), schema: Schema });
  return out.words.map((w) => ({ ...w, profile: cleanProfile(w.profile) }));
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
