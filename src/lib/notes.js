// 뉘앙스가 아닌 정보를 알맞은 칸으로 나누는 규칙 (일괄 추가 파서와 기존 데이터 정리에서 함께 사용)
//   본문 형태: settlements        → form     (지문에 나온 형태)
//   반의: distributive 분배적인     → antonyms (+ 한국어 풀이는 기타 메모)
//   유의: hesitant                 → synonyms (+ 한국어 풀이는 기타 메모)
//   숙어:/관련 표현: …, mutually exclusive: 상호 배타적인 → related (관련 표현·숙어)
//   명사는 앞, 동사는 뒤에 강세       → memo     (발음·강세 등 기타)
// 그 밖의 문장은 진짜 뉘앙스로 보고 그대로 둔다.
import { inflections } from './inflect.js';

const PREFIX = [
  ['form', /^(본문\s*형태|본문|지문\s*형태|지문)\s*[:：]\s*/],
  ['antonyms', /^(반의어?|반대말)\s*[:：]\s*/],
  ['synonyms', /^(유의어?|동의어?|비슷한\s*말)\s*[:：]\s*/],
  ['related', /^(숙어|관련\s*표현|표현|연어|구문)\s*[:：]\s*/],
];
const PREFIX_START = /(?:본문\s*형태|본문|지문\s*형태|지문|반의어?|반대말|유의어?|동의어?|비슷한\s*말|숙어|관련\s*표현|표현|연어|구문)\s*[:：]/;
const englishWords = (s) => s.match(/[A-Za-z][A-Za-z'’-]*(?: [A-Za-z][A-Za-z'’-]*)*/g) || [];

// "mutually exclusive: …"처럼 표제어(활용형 포함)가 든 영어 구 + 콜론 → 관련 표현
function isPhraseNote(text, word) {
  const m = text.match(/^([A-Za-z][A-Za-z'’ -]*?)\s*[:：]/);
  if (!m || !word) return false;
  const forms = new Set(inflections(word.split(/\s+/)[0]));
  return m[1].toLowerCase().split(/\s+/).some((t) => forms.has(t)) && m[1].trim().includes(' ');
}

/** 메모 한 덩어리 → { field, value, words? } */
export function classifyNote(text, word) {
  const t = text.trim();
  for (const [field, re] of PREFIX) {
    if (!re.test(t)) continue;
    const value = t.replace(re, '').trim();
    if (field === 'antonyms' || field === 'synonyms') return { field, value: t, words: englishWords(value) };
    return { field, value };
  }
  if (isPhraseNote(t, word)) return { field: 'related', value: t };
  if (/강세|발음|철자/.test(t) && t.length <= 40) return { field: 'memo', value: t };
  return { field: 'nuance', value: t };
}

/**
 * 뉘앙스 칸을 줄·머리말 단위로 나눠 분류
 * @returns {{ nuance, form[], related[], memo[], antonyms[], synonyms[], moved: number }}
 */
export function splitNuance(nuance = '', word = '') {
  const out = { nuance: [], form: [], related: [], memo: [], antonyms: [], synonyms: [], moved: 0 };
  const parts = String(nuance)
    .split(new RegExp(`\\n|\\s+(?=${PREFIX_START.source})`))
    .map((x) => x.trim())
    .filter(Boolean);
  for (const p of parts) {
    const c = classifyNote(p, word);
    if (c.field === 'nuance') {
      out.nuance.push(p);
      continue;
    }
    out.moved++;
    if (c.words) {
      out[c.field].push(...c.words);
      if (/[가-힣]/.test(c.value)) out.memo.push(c.value); // 한국어 풀이는 메모로 보존
    } else out[c.field].push(c.value);
  }
  return { ...out, nuance: out.nuance.join(' ') };
}

const joinUniq = (prev, add, sep) => [...new Set([...(prev ? prev.split(sep).map((x) => x.trim()) : []), ...add])].filter(Boolean).join(sep);
const listUniq = (prev, add) => {
  const seen = new Set(prev.map((x) => x.toLowerCase()));
  return [...prev, ...add.filter((x) => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))];
};

// 기존 데이터 정리: 뉘앙스 칸에 섞인 정보를 알맞은 칸으로 옮긴 단어 (바뀐 게 없으면 null)
export function migrateWord(w) {
  const s = splitNuance(w.nuance, w.word);
  if (!s.moved) return null;
  return {
    ...w,
    nuance: s.nuance,
    form: joinUniq(w.form, s.form, ', '),
    related: joinUniq(w.related, s.related, ' · '),
    memo: joinUniq(w.memo, s.memo, ' · '),
    antonyms: listUniq(w.antonyms, s.antonyms),
    synonyms: listUniq(w.synonyms, s.synonyms),
  };
}

export const needsMigration = (w) => splitNuance(w.nuance, w.word).moved > 0;
