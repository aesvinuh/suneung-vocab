// 자동 채우기 흐름: 영영 사전 조회 → (AI가 뜻 목록을 한국어로) → 뜻 선택 → AI 해설 → 미리보기용 초안
//  - 품사·영영 뜻·예문·유의어: Merriam-Webster → Free Dictionary
//  - 한국어 뜻·뉘앙스 메모·감정 톤·예문 해석: AI가 위 사전 자료를 근거로 작성
import { lookupDictionary, mapPos } from './dictionary.js';
import { generateKorean, translateSenses } from './aiFill.js';
import { findTarget } from './inflect.js';
import { getKeys } from './apiKeys.js';
import { POS_LABEL, splitList } from './word.js';

export const SOURCE_LABEL = {
  mw: 'Merriam-Webster',
  fd: 'Free Dictionary',
  ai: 'AI 생성',
  user: '직접 입력',
};

// 자동으로 채울 수 있는 칸
export const FILL_FIELDS = ['pos', 'definition', 'meanings', 'tone', 'nuance', 'example', 'exampleKo', 'synonyms', 'antonyms'];

/**
 * 사전 조회 + (뜻이 여러 개고 Claude 키가 있으면) 뜻 목록 한국어 번역
 * @returns {Promise<{ dict, glosses: Record<string,string>, glossError: string|null }>}
 */
export async function lookup(word) {
  const dict = await lookupDictionary(word, { mwKey: getKeys().mw });
  const res = { dict, glosses: {}, glossError: null };
  const { claude } = getKeys();
  if (claude && dict.senses.length > 1) {
    try {
      const ko = await translateSenses(word, dict.senses, claude);
      dict.senses.forEach((s, i) => (res.glosses[s.id] = ko[i]));
    } catch (e) {
      res.glossError = e.message; // 번역 실패해도 영어 목록으로 고르면 됨
    }
  }
  return res;
}

// 뜻 고르기 화면에 보여 줄 목록: 한국어 뜻(있으면)을 크게, 영영 뜻풀이를 작게
export function choicesOf(res) {
  return {
    source: res.dict.source,
    items: res.dict.senses.map((s) => {
      const ko = res.glosses[s.id];
      return { id: s.id, pos: POS_LABEL[mapPos(s.pos)] || s.pos, text: ko || s.definition, sub: ko ? s.definition : s.examples[0], ko: !!ko };
    }),
  };
}

/**
 * @param res lookup() 결과
 * @param selectedIds 외울 뜻으로 고른 sense id 목록 (첫 번째가 대표 뜻)
 * @returns {{ data, sources, warnings: string[] }}
 */
export async function buildDraft(word, res, selectedIds) {
  const { dict, glosses } = res;
  const sel = dict.senses.filter((s) => selectedIds.includes(s.id));
  const chosen = sel.length ? sel : dict.senses.slice(0, 1);
  const src = dict.source;

  const data = { word };
  const sources = {};
  const put = (field, value, from) => {
    if (Array.isArray(value) ? value.length : value) {
      data[field] = value;
      sources[field] = from;
    }
  };

  put('pos', mapPos(chosen[0].pos), src);
  put('definition', chosen.map((s) => s.definition).join(' / '), src);
  put('synonyms', dict.synonyms, dict.relSource);
  put('antonyms', dict.antonyms, dict.relSource);
  // 빈칸 문제에 쓰려면 단어(활용형)가 들어 있는 예문이 좋다
  const examples = chosen.flatMap((s) => s.examples);
  put('example', examples.find((ex) => findTarget(ex, word)) || examples[0] || '', src);
  // 뜻 고르기에서 본 한국어 뜻을 그대로 쓴다
  put('meanings', [...new Set(chosen.flatMap((s) => splitList(glosses[s.id] || '')))].slice(0, 4), 'ai');

  const warnings = [];
  if (res.glossError) warnings.push(res.glossError);
  const { claude } = getKeys();
  if (!claude) {
    warnings.push('Claude API 키가 없어 한국어 뜻·뉘앙스·예문 해석은 채우지 못했어요. 직접 입력하거나 설정에서 키를 넣어 주세요.');
    return { data, sources, warnings };
  }
  try {
    const ai = await generateKorean(
      { word, senses: chosen, koMeanings: data.meanings || [], synonyms: data.synonyms || [], example: data.example || '' },
      claude,
    );
    if (!data.meanings) put('meanings', ai.meanings, 'ai');
    put('tone', ai.tone, 'ai');
    put('nuance', ai.nuance, 'ai');
    if (!data.example) put('example', ai.example, 'ai');
    put('exampleKo', ai.exampleKo, 'ai');
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
