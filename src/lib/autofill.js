// 자동 채우기 흐름: 사전 조회(영영 + 영한) → (뜻 선택) → AI 뉘앙스 해설 → 미리보기용 초안
//  - 한국어 뜻: 위키낱말사전(영한)에서 가져오고, 없을 때만 AI가 영영 뜻풀이를 근거로 작성
//  - 품사·영영 뜻·예문·유의어: Merriam-Webster → Free Dictionary
//  - 뉘앙스 메모·감정 톤·예문 해석: AI (사전 자료 근거)
import { lookupDictionary, lookupKoWiktionary, LookupError, mapPos, splitKoMeaning } from './dictionary.js';
import { generateKorean } from './aiFill.js';
import { findTarget } from './inflect.js';
import { getKeys } from './apiKeys.js';
import { POS_LABEL } from './word.js';

export const SOURCE_LABEL = {
  kowikt: '위키낱말사전',
  mw: 'Merriam-Webster',
  fd: 'Free Dictionary',
  ai: 'AI 생성',
  user: '직접 입력',
};

// 자동으로 채울 수 있는 칸
export const FILL_FIELDS = ['pos', 'definition', 'meanings', 'tone', 'nuance', 'example', 'exampleKo', 'synonyms', 'antonyms'];

/** @returns {Promise<{ en: object|null, ko: object|null }>} 둘 다 없으면 LookupError */
export async function lookup(word) {
  const [en, ko] = await Promise.allSettled([lookupDictionary(word, { mwKey: getKeys().mw }), lookupKoWiktionary(word)]);
  const res = { en: en.status === 'fulfilled' ? en.value : null, ko: ko.status === 'fulfilled' ? ko.value : null };
  if (res.en || res.ko) return res;
  const errs = [en.reason, ko.reason];
  if (errs.every((e) => e?.notFound)) throw new LookupError(`'${word}'를 사전에서 찾지 못했어요.`, { notFound: true });
  throw new LookupError(errs.map((e) => e?.message).filter(Boolean).join(' / ') || '사전 조회에 실패했어요.');
}

// 뜻 고르기 화면에 보여 줄 목록: 한국어 뜻이 있으면 한국어, 없으면 영영 뜻풀이
export function choicesOf(res) {
  if (res.ko?.senses.length) {
    return { source: 'kowikt', items: res.ko.senses.map((s) => ({ id: s.id, pos: s.posLabel, text: s.meaning })) };
  }
  return {
    source: res.en.source,
    items: res.en.senses.map((s) => ({ id: s.id, pos: POS_LABEL[mapPos(s.pos)] || s.pos, text: s.definition, sub: s.examples[0] })),
  };
}

/**
 * @param res lookup() 결과
 * @param selectedIds 외울 뜻으로 고른 id 목록 (첫 번째가 대표 뜻)
 * @returns {{ data, sources, warnings: string[] }}
 */
export async function buildDraft(word, res, selectedIds) {
  const { en, ko } = res;
  const koSel = ko ? ko.senses.filter((s) => selectedIds.includes(s.id)) : [];
  let enSel = en ? en.senses.filter((s) => selectedIds.includes(s.id)) : [];
  if (koSel.length && en) {
    // 한국어 뜻을 골랐으면 같은 품사의 영영 뜻풀이를 근거 자료로 사용
    const same = en.senses.filter((s) => mapPos(s.pos) === koSel[0].pos);
    enSel = (same.length ? same : en.senses).slice(0, 2);
  }
  if (!koSel.length && !enSel.length) {
    if (ko) koSel.push(ko.senses[0]);
    else enSel = en.senses.slice(0, 1);
  }

  const data = { word };
  const sources = {};
  const put = (field, value, src) => {
    if (Array.isArray(value) ? value.length : value) {
      data[field] = value;
      sources[field] = src;
    }
  };

  if (koSel.length) {
    put('meanings', [...new Set(koSel.flatMap((s) => splitKoMeaning(s.meaning)))].slice(0, 4), 'kowikt');
    put('pos', koSel[0].pos, 'kowikt');
  }
  if (en) {
    if (!data.pos) put('pos', mapPos(enSel[0]?.pos || ''), en.source);
    put('definition', enSel.map((s) => s.definition).join(' / '), en.source);
    put('synonyms', en.synonyms, en.relSource);
    put('antonyms', en.antonyms, en.relSource);
    // 빈칸 문제에 쓰려면 단어(활용형)가 들어 있는 예문이 좋다
    const examples = enSel.flatMap((s) => s.examples);
    put('example', examples.find((ex) => findTarget(ex, word)) || examples[0] || '', en.source);
  }

  const warnings = [];
  const { claude } = getKeys();
  if (!claude) {
    warnings.push(
      data.meanings
        ? 'Claude API 키가 없어 뉘앙스 메모·예문 해석은 채우지 못했어요. 직접 입력하거나 설정에서 키를 넣어 주세요.'
        : '위키낱말사전에 한국어 뜻이 없고 Claude API 키도 없어 한국어 뜻·뉘앙스·해석을 채우지 못했어요. 직접 입력해 주세요.',
    );
    return { data, sources, warnings };
  }
  try {
    const ai = await generateKorean(
      { word, senses: enSel, koMeanings: data.meanings || [], synonyms: data.synonyms || [], example: data.example || '' },
      claude,
    );
    if (!data.meanings) {
      put('meanings', ai.meanings, 'ai');
      warnings.push('위키낱말사전에 한국어 뜻이 없어서 AI가 영영 뜻풀이를 보고 한국어 뜻을 정리했어요. 맞는지 확인해 주세요.');
    }
    put('tone', ai.tone, 'ai');
    put('nuance', ai.nuance, 'ai');
    if (!data.example) put('example', ai.example, 'ai');
    put('exampleKo', ai.exampleKo, 'ai');
  } catch (e) {
    warnings.push(e.message + ' 뉘앙스는 직접 입력해 주세요.');
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
