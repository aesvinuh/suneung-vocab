// AI 생성 콘텐츠 풀: 단어별 예문 풀 + 헷갈리는 단어 + 문법 정보 + 뉘앙스 프로필 초안.
// 문제를 풀 때는 절대 API를 부르지 않는다. 미리 만들어 IndexedDB(word.ai)에 저장해 두고 학습 중에는 저장된 것만 쓴다.
import { generatePools } from './aiFill.js';
import { getKeys } from './apiKeys.js';
import { canRequest } from './usage.js';
import { findTarget } from './inflect.js';
import { hasMeaning, normalizeAi, uid } from './word.js';
import { emptyProfile, isConfirmed } from './profile.js';

export const POOL_CONFIG = {
  examplesPerWord: 5, // 단어별 AI 예문 수
  exampleMaxUses: 3, // 모든 예문이 이만큼 쓰이면 새 예문 생성 대상
  recentExampleGap: 1, // 가장 최근에 쓴 예문은 다음 출제에서 피함
  confusablesMin: 5, // 헷갈리는 단어가 이보다 적으면 다시 생성
  confusablesMax: 8,
  wordsPerRequest: 5, // 요청 한 번에 묶는 단어 수
  retryAfterMs: 24 * 3600 * 1000, // 백그라운드에서는 한 번 시도한 단어를 하루 동안 다시 요청하지 않음 (요금 보호)
};

// ── 무엇이 필요한가 ──
export function poolNeeds(w) {
  if (!hasMeaning(w)) return null;
  const ai = w.ai || normalizeAi();
  const all = exampleEntries(w);
  const exhausted = all.length > 0 && all.every((e) => e.uses >= POOL_CONFIG.exampleMaxUses);
  const needs = {
    examples: ai.examples.length < POOL_CONFIG.examplesPerWord || exhausted ? POOL_CONFIG.examplesPerWord : 0,
    userWhy: !!w.example && !ai.userExample.why,
    grammar: !ai.grammar,
    // 한 번 만들어 본 단어는 (내 단어장과 겹쳐 걸러졌어도) 3개 이상이면 다시 요청하지 않음 → 요금 보호
    confusables: ai.confusables.length < (ai.lastAttemptAt ? 3 : POOL_CONFIG.confusablesMin),
    profile: !isConfirmed(w) && !w.profile?.suggested,
  };
  return Object.values(needs).some(Boolean) ? needs : null;
}
export const needsPool = (w) => !!poolNeeds(w);

// ── 결과 합치기 ──
const sameText = (a, b) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

export function mergePool(w, gen, myWords, now = Date.now()) {
  const ai = normalizeAi(w.ai);
  const needs = poolNeeds(w) || {};
  const next = { ...ai };

  if (needs.examples) {
    // 단어가 실제로 들어 있는 예문만, 중복 없이. 다 쓴 예문은 새 것으로 교체
    const fresh = (gen.examples || [])
      .filter((e) => e.en && findTarget(e.en, w.word) && !ai.examples.some((x) => sameText(x.en, e.en)))
      .map((e) => ({ id: uid(), en: e.en.trim(), ko: e.ko.trim(), why: e.why.trim(), uses: 0, lastUsedAt: null }));
    const kept = ai.examples.filter((e) => e.uses < POOL_CONFIG.exampleMaxUses);
    next.examples = [...kept, ...fresh].slice(-POOL_CONFIG.examplesPerWord * 2);
    next.examplesAt = now;
  }
  if (needs.userWhy && gen.userWhy) next.userExample = { ...ai.userExample, why: gen.userWhy.trim() };
  if (needs.grammar && gen.grammar) next.grammar = gen.grammar;
  if (needs.confusables) {
    const mine = new Set(myWords.map((x) => x.toLowerCase()));
    const seen = new Set([w.word.toLowerCase()]);
    next.confusables = (gen.confusables || [])
      .filter((c) => c.word && c.meanings.length && (!w.pos || c.pos === w.pos))
      .filter((c) => !mine.has(c.word.toLowerCase()) && !seen.has(c.word.toLowerCase()) && seen.add(c.word.toLowerCase()))
      .slice(0, POOL_CONFIG.confusablesMax);
  }
  next.generatedAt = now;
  next.lastAttemptAt = now;
  const out = { ...w, ai: next };
  if (needs.profile && gen.profile) out.profile = { ...(w.profile || emptyProfile()), suggested: gen.profile };
  return out;
}

// ── 예문 고르기 (내 예문 + AI 예문 풀에서 순환) ──
export function exampleEntries(w) {
  const ai = w.ai || normalizeAi();
  const list = [];
  if (w.example) list.push({ id: 'user', en: w.example, ko: w.exampleKo, why: ai.userExample.why, uses: ai.userExample.uses, lastUsedAt: ai.userExample.lastUsedAt, source: 'user' });
  for (const e of ai.examples) list.push({ ...e, source: 'ai' });
  return list.filter((e) => findTarget(e.en, w.word));
}

// 가장 적게 쓴 예문 우선, 방금 쓴 예문은 피함
export function pickExample(w, rng = Math.random) {
  const list = exampleEntries(w);
  if (!list.length) return null;
  const last = Math.max(0, ...list.map((e) => e.lastUsedAt || 0));
  const usable = list.length > POOL_CONFIG.recentExampleGap ? list.filter((e) => !last || (e.lastUsedAt || 0) < last) : list;
  const min = Math.min(...usable.map((e) => e.uses));
  const least = usable.filter((e) => e.uses === min);
  return least[Math.floor(rng() * least.length)];
}

// 문제에 예문을 썼다고 기록
export function markExampleUsed(w, exampleId, now = Date.now()) {
  if (!exampleId) return w;
  const ai = normalizeAi(w.ai);
  if (exampleId === 'user') return { ...w, ai: { ...ai, userExample: { ...ai.userExample, uses: ai.userExample.uses + 1, lastUsedAt: now } } };
  return { ...w, ai: { ...ai, examples: ai.examples.map((e) => (e.id === exampleId ? { ...e, uses: e.uses + 1, lastUsedAt: now } : e)) } };
}

// ── 백그라운드 채우기 ──
/**
 * @param getWords () => 최신 단어 목록
 * @param saveWord 저장 함수
 * @param onProgress ({ done, total, message })
 * @param maxRequests 이번에 보낼 최대 요청 수
 * @returns {{ done, total, stopped: string|null }}
 */
export async function fillPools({ getWords, saveWord, onProgress = () => {}, maxRequests = Infinity, ids = null }) {
  const { claude } = getKeys();
  if (!claude) return { done: 0, total: 0, stopped: 'Claude API 키가 없어요.' };
  const now = Date.now();
  const recentlyTried = (w) => w.ai?.lastAttemptAt && now - w.ai.lastAttemptAt < POOL_CONFIG.retryAfterMs;
  let targets = getWords().filter((w) => needsPool(w) && (ids ? ids.includes(w.id) : !recentlyTried(w)));
  // 프로필이 아직 없는 단어 → 예문만 다 쓴 단어 순
  targets.sort((a, b) => (a.ai?.generatedAt ? 1 : 0) - (b.ai?.generatedAt ? 1 : 0));
  const total = targets.length;
  let done = 0;
  let requests = 0;
  onProgress({ done, total, message: total ? '' : '채울 풀이 없어요.' });
  for (let i = 0; i < targets.length; i += POOL_CONFIG.wordsPerRequest) {
    if (requests >= maxRequests) return { done, total, stopped: null };
    if (!canRequest()) return { done, total, stopped: '오늘 AI 요청 한도에 닿았어요.' };
    if (!navigator.onLine) return { done, total, stopped: '오프라인이에요.' };
    const chunk = targets.slice(i, i + POOL_CONFIG.wordsPerRequest);
    const myWords = getWords().map((w) => w.word);
    const items = chunk.map((w) => ({
      word: w.word,
      pos: w.pos,
      meanings: w.meanings,
      definition: w.definition,
      example: w.example,
      exampleKo: w.exampleKo,
      nuance: w.nuance,
      synonyms: w.synonyms,
      needs: poolNeeds(w),
    }));
    let results;
    try {
      requests++;
      results = await generatePools(items, myWords, claude);
    } catch (e) {
      return { done, total, stopped: e.message };
    }
    for (const w of chunk) {
      const gen = results.find((r) => r.word.trim().toLowerCase() === w.word.toLowerCase());
      const latest = getWords().find((x) => x.id === w.id);
      if (latest) await saveWord(gen ? mergePool(latest, gen, myWords) : { ...latest, ai: { ...normalizeAi(latest.ai), lastAttemptAt: Date.now() } });
      done++;
    }
    onProgress({ done, total, message: '' });
  }
  return { done, total, stopped: null };
}
