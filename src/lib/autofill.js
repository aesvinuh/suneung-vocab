// 자동 채우기 흐름: 사전 조회 → (뜻 선택) → AI 한국어 해설 → 미리보기용 초안
import { lookupDictionary, mapPos } from './dictionary.js';
import { generateKorean } from './aiFill.js';
import { findTarget } from './inflect.js';
import { getKeys } from './apiKeys.js';

export const SOURCE_LABEL = {
  mw: 'Merriam-Webster',
  fd: 'Free Dictionary',
  ai: 'AI 생성',
  user: '직접 입력',
};

// 자동으로 채울 수 있는 칸
export const FILL_FIELDS = ['pos', 'definition', 'meanings', 'tone', 'nuance', 'example', 'exampleKo', 'synonyms', 'antonyms'];

export function lookup(word) {
  return lookupDictionary(word, { mwKey: getKeys().mw });
}

/**
 * @param dict lookup() 결과
 * @param selectedIds 외울 뜻으로 고른 sense id 목록 (첫 번째가 대표 뜻)
 * @returns {{ data, sources, warnings: string[] }}
 */
export async function buildDraft(word, dict, selectedIds) {
  const senses = dict.senses.filter((s) => selectedIds.includes(s.id));
  const chosen = senses.length ? senses : dict.senses.slice(0, 1);
  const src = dict.source;
  const data = {
    word,
    pos: mapPos(chosen[0].pos),
    definition: chosen.map((s) => s.definition).join(' / '),
    synonyms: dict.synonyms,
    antonyms: dict.antonyms,
  };
  const sources = { pos: src, definition: src };
  if (dict.synonyms.length) sources.synonyms = dict.relSource;
  if (dict.antonyms.length) sources.antonyms = dict.relSource;

  // 빈칸 문제에 쓰려면 단어(활용형)가 들어 있는 예문이 좋다
  const examples = chosen.flatMap((s) => s.examples);
  const example = examples.find((ex) => findTarget(ex, word)) || examples[0] || '';
  if (example) {
    data.example = example;
    sources.example = src;
  }

  const warnings = [];
  const { claude } = getKeys();
  if (!claude) {
    warnings.push('Claude API 키가 없어 한국어 뜻·뉘앙스·해석은 채우지 못했어요. 직접 입력하거나 설정에서 키를 넣어 주세요.');
    return { data, sources, warnings };
  }
  try {
    const ai = await generateKorean({ word, senses: chosen, synonyms: dict.synonyms, example }, claude);
    Object.assign(data, { meanings: ai.meanings, tone: ai.tone, nuance: ai.nuance, exampleKo: ai.exampleKo });
    Object.assign(sources, { meanings: 'ai', tone: 'ai', nuance: 'ai', exampleKo: 'ai' });
    if (!example && ai.example) {
      data.example = ai.example;
      sources.example = 'ai';
    }
  } catch (e) {
    warnings.push(e.message + ' 한국어 뜻·뉘앙스는 직접 입력해 주세요.');
  }
  return { data, sources, warnings };
}

const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : !v);

// 기존 단어에 '비어 있는 칸만' 초안으로 채운다. 직접 쓴 내용은 절대 덮어쓰지 않음.
export function mergeMissing(word, draft) {
  const next = { ...word, sources: { ...(word.sources || {}) } };
  const filled = [];
  for (const f of FILL_FIELDS) {
    if (isEmpty(word[f]) && !isEmpty(draft.data[f])) {
      next[f] = draft.data[f];
      if (draft.sources[f]) next.sources[f] = draft.sources[f];
      filled.push(f);
    }
  }
  return { word: next, filled };
}
