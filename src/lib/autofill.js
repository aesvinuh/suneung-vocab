// 자동 채우기 흐름
//  1. 여러 사전 동시 조회 (Merriam-Webster · Wiktionary · Free Dictionary · Datamuse)
//  2. AI가 모든 뜻풀이를 종합해 한국어 뜻 목록으로 정리 (같은 뜻 합치기, 근거 사전 표시)
//  3. 외울 뜻 선택
//  4. AI가 고른 뜻과 근거 자료로 뉘앙스 메모·감정 톤·예문 해석 작성 → 미리보기용 초안
// Claude 키가 없으면 대표 사전의 영영 뜻풀이로 고르고, 사전 내용만 채운다.
import { lookupAll, mapPos } from './dictionary.js';
import { generateKorean, synthesizeMeanings } from './aiFill.js';
import { findTarget } from './inflect.js';
import { getKeys } from './apiKeys.js';
import { POS_LABEL, splitList } from './word.js';
import { emptyProfile, isConfirmed } from './profile.js';

export const SOURCE_LABEL = {
  mw: 'Merriam-Webster',
  wikt: 'Wiktionary',
  fd: 'Free Dictionary',
  dm: 'Datamuse',
  mix: '여러 사전',
  ai: 'AI 종합',
  user: '직접 입력',
};
const SHORT = { mw: 'MW', wikt: 'Wiktionary', fd: 'FreeDict' };
const PRIORITY = ['mw', 'wikt', 'fd']; // 공신력 순

// 자동으로 채울 수 있는 칸
export const FILL_FIELDS = ['pos', 'definition', 'meanings', 'tone', 'nuance', 'related', 'example', 'exampleKo', 'synonyms', 'antonyms'];

/**
 * @returns {Promise<{ all, merged: Array|null, mergeError: string|null }>}
 *   all: lookupAll() 결과, merged: AI가 종합한 뜻 목록 [{ id, ko, pos, en, refs, example }]
 */
export async function lookup(word) {
  const all = await lookupAll(word, { mwKey: getKeys().mw });
  const res = { all, merged: null, mergeError: null };
  const { claude } = getKeys();
  if (claude) {
    try {
      const m = await synthesizeMeanings(word, all.senses, claude);
      if (m.length) res.merged = m.map((x, i) => ({ ...x, id: 'm' + i }));
    } catch (e) {
      res.mergeError = e.message + ' 사전 뜻풀이(영어)로 골라 주세요.';
    }
  }
  return res;
}

// 대표 사전 하나의 뜻풀이 (AI 종합이 없을 때)
function primarySenses(all) {
  const src = PRIORITY.find((p) => all.senses.some((s) => s.source === p));
  return all.senses.filter((s) => s.source === src);
}

// 뜻 고르기 화면에 보여 줄 목록
export function choicesOf(res) {
  if (res.merged) {
    const byId = new Map(res.all.senses.map((s) => [s.id, s]));
    return {
      source: 'ai',
      items: res.merged.map((m) => ({
        id: m.id,
        pos: POS_LABEL[mapPos(m.pos)] || m.pos,
        text: m.ko,
        sub: m.en,
        ko: true,
        refs: [...new Set(m.refs.map((r) => SHORT[byId.get(r)?.source]).filter(Boolean))],
      })),
    };
  }
  const senses = primarySenses(res.all);
  return {
    source: senses[0].source,
    items: senses.map((s) => ({ id: s.id, pos: POS_LABEL[mapPos(s.pos)] || s.pos, text: s.definition, sub: s.examples[0] })),
  };
}

const relList = (list) => {
  const words = list.slice(0, 6).map((x) => x.word);
  const srcs = new Set(list.slice(0, 6).map((x) => x.source));
  return { words, source: srcs.size > 1 ? 'mix' : [...srcs][0] };
};

/**
 * @param res lookup() 결과
 * @param selectedIds 외울 뜻으로 고른 id 목록
 * @returns {{ data, sources, warnings: string[] }}
 */
export async function buildDraft(word, res, selectedIds) {
  const { all, merged } = res;
  const byId = new Map(all.senses.map((s) => [s.id, s]));
  const rank = (s) => PRIORITY.indexOf(s.source);

  // 고른 뜻과 그 근거가 된 사전 뜻풀이
  let chosenMerged = [];
  let evidence;
  if (merged) {
    chosenMerged = merged.filter((m) => selectedIds.includes(m.id));
    if (!chosenMerged.length) chosenMerged = merged.slice(0, 1);
    evidence = [...new Set(chosenMerged.flatMap((m) => m.refs))].map((r) => byId.get(r)).filter(Boolean).sort((a, b) => rank(a) - rank(b));
  } else {
    evidence = all.senses.filter((s) => selectedIds.includes(s.id));
    if (!evidence.length) evidence = primarySenses(all).slice(0, 1);
  }

  const data = { word };
  const sources = {};
  const put = (field, value, from) => {
    if (Array.isArray(value) ? value.length : value) {
      data[field] = value;
      sources[field] = from;
    }
  };

  const lead = evidence[0];
  put('pos', mapPos(chosenMerged[0]?.pos || lead.pos), chosenMerged.length ? 'ai' : lead.source);
  // 영영 뜻풀이는 가장 공신력 있는 사전의 원문 그대로 (뜻마다 하나)
  const defs = chosenMerged.length
    ? chosenMerged.map((m) => m.refs.map((r) => byId.get(r)).filter(Boolean).sort((a, b) => rank(a) - rank(b))[0]).filter(Boolean)
    : evidence;
  put('definition', [...new Set(defs.map((s) => s.definition))].join(' / '), new Set(defs.map((s) => s.source)).size > 1 ? 'mix' : defs[0]?.source);

  // 예문: AI가 고른 사전 예문 → 없으면 근거 뜻풀이의 예문 중 단어가 들어 있는 것
  const exSource = (ex) => evidence.find((s) => s.examples.includes(ex))?.source || all.senses.find((s) => s.examples.includes(ex))?.source;
  const candidates = [...chosenMerged.map((m) => m.example).filter(Boolean), ...evidence.flatMap((s) => s.examples)];
  const example = candidates.find((ex) => findTarget(ex, word)) || candidates[0] || '';
  put('example', example, exSource(example));

  const syn = relList(all.synonyms);
  const ant = relList(all.antonyms);
  put('synonyms', syn.words, syn.source);
  put('antonyms', ant.words, ant.source);
  put('meanings', [...new Set(chosenMerged.flatMap((m) => splitList(m.ko)))].slice(0, 4), 'ai');

  const warnings = [];
  if (res.mergeError) warnings.push(res.mergeError);
  if (all.failed.length) warnings.push(`${all.failed.map((s) => SOURCE_LABEL[s]).join(', ')}에 연결하지 못해 나머지 사전으로만 정리했어요.`);
  const { claude } = getKeys();
  if (!claude) {
    warnings.push('Claude API 키가 없어 한국어 뜻·뉘앙스·예문 해석은 채우지 못했어요. 직접 입력하거나 설정에서 키를 넣어 주세요.');
    return { data, sources, warnings };
  }
  try {
    const ai = await generateKorean(
      {
        word,
        senses: evidence,
        koMeanings: data.meanings || [],
        synonyms: all.synonyms.slice(0, 15).map((x) => x.word),
        antonyms: all.antonyms.slice(0, 10).map((x) => x.word),
        example: data.example || '',
      },
      claude,
    );
    // 유의어·반의어: AI가 후보 중 고른 뜻에 맞는 것만 추림 (출처는 원래 사전)
    for (const [field, list] of [['synonyms', all.synonyms], ['antonyms', all.antonyms]]) {
      if (!ai[field].length) continue;
      const srcs = new Set(ai[field].map((wd) => list.find((x) => x.word.toLowerCase() === wd.toLowerCase())?.source));
      put(field, ai[field], srcs.size > 1 ? 'mix' : [...srcs][0]);
    }
    if (!data.meanings) put('meanings', ai.meanings, 'ai');
    put('tone', ai.tone, 'ai');
    put('nuance', ai.nuance, 'ai');
    put('related', ai.related, 'ai');
    // 뉘앙스 프로필은 '초안'으로만 넣고, 확정은 사용자가 (프로필 확인 화면 또는 단어 수정)
    data.profile = { ...emptyProfile(), suggested: ai.profile };
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
  // 확정 안 된 프로필이면 AI 초안만 붙임 (확정된 프로필은 절대 건드리지 않음)
  if (draft.data.profile?.suggested && !isConfirmed(word) && !word.profile?.suggested) {
    next.profile = { ...(word.profile || emptyProfile()), suggested: draft.data.profile.suggested };
    filled.push('profile');
  }
  for (const f of FILL_FIELDS) {
    if (isEmpty(word[f]) && !isEmpty(draft.data[f])) {
      next[f] = draft.data[f];
      if (draft.sources[f]) next.sources[f] = draft.sources[f];
      filled.push(f);
    }
  }
  return { word: next, filled };
}

// 이미 있는 단어를 다시 넣었을 때: 비어 있는 칸만 채우고, 다시 넣은 횟수를 올려 더 자주 출제
export function reinforce(word, data, now = Date.now()) {
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => FILL_FIELDS.includes(k)));
  const { word: merged, filled } = mergeMissing(word, { data: clean, sources: {} });
  return { word: { ...merged, readd: { count: (word.readd?.count || 0) + 1, lastAt: now } }, filled };
}
