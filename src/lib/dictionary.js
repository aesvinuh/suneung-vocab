// 사전 조회
//  - 영영: Merriam-Webster Learner's → 실패하면 Free Dictionary
//  - 영한: 위키낱말사전(ko.wiktionary.org)의 '영어' 항목 → 한국어 뜻
// 모두 Access-Control-Allow-Origin: * 이라 브라우저에서 바로 호출 가능 (중계 서버 불필요).
//
// 결과 형식:
// { source: 'mw'|'fd', senses: [{ id, pos, definition, examples[] }],
//   synonyms[], antonyms[], relSource: 'mw'|'fd'|null }

const MW_URL = 'https://www.dictionaryapi.com/api/v3/references/learners/json/';
const FD_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const KO_URL = 'https://ko.wiktionary.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&origin=*&page=';
const MAX_SENSES = 8;
const MAX_REL = 6;

export class LookupError extends Error {
  constructor(message, { notFound = false } = {}) {
    super(message);
    this.notFound = notFound;
  }
}

export async function lookupDictionary(word, { mwKey } = {}) {
  const w = word.trim();
  const errors = [];
  let result = null;

  if (mwKey) {
    try {
      result = await lookupMw(w, mwKey);
    } catch (e) {
      errors.push(e);
    }
  }
  // 유의어/반의어가 비었거나 MW 실패 시 Free Dictionary로 보충
  if (!result || result.synonyms.length === 0 || result.antonyms.length === 0) {
    try {
      const fd = await lookupFd(w);
      if (!result) result = fd;
      else if (fd.synonyms.length || fd.antonyms.length) {
        result = {
          ...result,
          synonyms: result.synonyms.length ? result.synonyms : fd.synonyms,
          antonyms: result.antonyms.length ? result.antonyms : fd.antonyms,
          relSource: result.synonyms.length ? result.relSource : 'fd',
        };
      }
    } catch (e) {
      errors.push(e);
    }
  }
  if (result) return result;
  if (errors.length && errors.every((e) => e.notFound)) throw new LookupError(`'${w}'를 사전에서 찾지 못했어요.`, { notFound: true });
  throw new LookupError(errors.map((e) => e.message).join(' / ') || '사전 조회에 실패했어요.');
}

// ── Merriam-Webster Learner's ──────────────────────────────

export async function lookupMw(word, key) {
  let res;
  try {
    res = await fetch(MW_URL + encodeURIComponent(word.toLowerCase()) + '?key=' + encodeURIComponent(key));
  } catch {
    throw new LookupError('Merriam-Webster에 연결하지 못했어요.');
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new LookupError(/key/i.test(text) ? "Merriam-Webster 키가 올바르지 않아요 (Learner's 사전용 키인지 확인)." : 'Merriam-Webster 응답을 읽지 못했어요.');
  }
  return parseMw(word, data);
}

export function parseMw(word, data) {
  // 단어가 없으면 비슷한 철자 목록(문자열 배열)이 온다
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] === 'string') {
    throw new LookupError('Merriam-Webster에 없는 단어예요.', { notFound: true });
  }
  const target = word.toLowerCase();
  const entries = data.filter((e) => e && e.meta);
  const matched = entries.filter(
    (e) => e.meta.id.split(':')[0].toLowerCase() === target || (e.meta.stems || []).some((s) => s.toLowerCase() === target),
  );
  const use = matched.length ? matched : entries.slice(0, 1);

  const senses = [];
  for (const entry of use) {
    const dts = collectDts(entry.def || []);
    // 상세 정의 구조가 없는 항목은 shortdef로 대체
    if (!dts.length) {
      for (const d of entry.shortdef || []) if (senses.length < MAX_SENSES) senses.push({ id: 'mw' + senses.length, pos: entry.fl || '', definition: cleanMw(d), examples: [] });
      continue;
    }
    for (const dt of dts) {
      const definition = cleanMw(dt.filter(([t]) => t === 'text').map(([, v]) => v).join(' '));
      if (!definition) continue;
      const examples = [];
      for (const [t, v] of dt) {
        if (t === 'vis') examples.push(...v.map((x) => cleanMw(x.t)));
        if (t === 'uns') for (const un of v) for (const [ut, uv] of un) if (ut === 'vis') examples.push(...uv.map((x) => cleanMw(x.t)));
      }
      senses.push({ id: 'mw' + senses.length, pos: entry.fl || '', definition, examples: examples.filter(Boolean).slice(0, 3) });
      if (senses.length >= MAX_SENSES) break;
    }
  }
  if (!senses.length) throw new LookupError('Merriam-Webster에 뜻풀이가 없어요.', { notFound: true });

  const synonyms = [];
  for (const entry of use) for (const s of entry.syns || []) for (const [t, v] of s.pt || []) if (t === 'text') synonyms.push(...extractMwWords(v));
  const syn = uniq(synonyms.filter((s) => s.toLowerCase() !== target)).slice(0, MAX_REL);
  return { source: 'mw', senses, synonyms: syn, antonyms: [], relSource: syn.length ? 'mw' : null };
}

// sseq 안의 sense / bs / sen / pseq를 따라가며 dt(정의 텍스트 묶음)를 모은다
function collectDts(defs) {
  const out = [];
  const visit = (item) => {
    if (!Array.isArray(item)) return;
    if (typeof item[0] === 'string') {
      const [type, body] = item;
      if (type === 'sense' && body?.dt) out.push(body.dt);
      else if (type === 'bs' && body?.sense?.dt) out.push(body.sense.dt);
      else if (type === 'pseq') body.forEach(visit);
      return;
    }
    item.forEach(visit);
  };
  for (const d of defs) visit(d.sseq || []);
  return out;
}

export function cleanMw(s = '') {
  return String(s)
    .replace(/\{bc\}/g, '')
    .replace(/\{ldquo\}/g, '“')
    .replace(/\{rdquo\}/g, '”')
    .replace(/\{(?:a_link|d_link|i_link|et_link|mat|sx|dxt|ds)\|([^|}]*)[^}]*\}/g, '$1')
    .replace(/\{\/?[a-z_]+\}/g, '')
    .replace(/\[=([^\]]*)\]/g, '(= $1)')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMwWords(text) {
  const words = [];
  for (const m of text.matchAll(/\{sc\}([^{]+)\{\/sc\}/g)) words.push(m[1].trim());
  for (const m of text.matchAll(/\{sx\|([^|}]+)/g)) words.push(m[1].trim());
  return words;
}

// ── Free Dictionary (dictionaryapi.dev, 키 불필요) ─────────────

export async function lookupFd(word) {
  let res;
  try {
    res = await fetch(FD_URL + encodeURIComponent(word.toLowerCase()));
  } catch {
    throw new LookupError('Free Dictionary에 연결하지 못했어요.');
  }
  if (res.status === 404) throw new LookupError('Free Dictionary에 없는 단어예요.', { notFound: true });
  if (!res.ok) throw new LookupError(`Free Dictionary 오류 (${res.status}).`);
  return parseFd(word, await res.json());
}

export function parseFd(word, data) {
  if (!Array.isArray(data) || !data.length) throw new LookupError('Free Dictionary에 없는 단어예요.', { notFound: true });
  const senses = [];
  const synonyms = [];
  const antonyms = [];
  for (const entry of data) {
    for (const m of entry.meanings || []) {
      synonyms.push(...(m.synonyms || []));
      antonyms.push(...(m.antonyms || []));
      for (const d of m.definitions || []) {
        synonyms.push(...(d.synonyms || []));
        antonyms.push(...(d.antonyms || []));
        if (senses.length < MAX_SENSES && d.definition) {
          senses.push({ id: 'fd' + senses.length, pos: m.partOfSpeech || '', definition: d.definition.trim(), examples: d.example ? [d.example.trim()] : [] });
        }
      }
    }
  }
  if (!senses.length) throw new LookupError('Free Dictionary에 뜻풀이가 없어요.', { notFound: true });
  const target = word.toLowerCase();
  const syn = uniq(synonyms.filter((s) => s.toLowerCase() !== target)).slice(0, MAX_REL);
  const ant = uniq(antonyms).slice(0, MAX_REL);
  return { source: 'fd', senses, synonyms: syn, antonyms: ant, relSource: syn.length || ant.length ? 'fd' : null };
}

function uniq(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const POS_MAP = {
  noun: 'n', verb: 'v', adjective: 'adj', adverb: 'adv', preposition: 'prep', conjunction: 'conj',
  'phrasal verb': 'phr', idiom: 'phr', phrase: 'phr',
};
export const mapPos = (fl) => POS_MAP[String(fl).toLowerCase()] || '';

// ── 위키낱말사전 (영한, 키 불필요) ───────────────────────────
// 결과: { source: 'kowikt', senses: [{ id, pos('adj' 등), posLabel('형용사'), meaning('꺼리는, 마음이 내키지 않는') }] }

const KO_POS = { 명사: 'n', 동사: 'v', 형용사: 'adj', 부사: 'adv', 전치사: 'prep', 접속사: 'conj', 숙어: 'phr', 관용구: 'phr', 구: 'phr', 구동사: 'phr' };

export async function lookupKoWiktionary(word) {
  let res;
  try {
    res = await fetch(KO_URL + encodeURIComponent(word.trim().toLowerCase()));
  } catch {
    throw new LookupError('위키낱말사전에 연결하지 못했어요.');
  }
  if (!res.ok) throw new LookupError(`위키낱말사전 오류 (${res.status}).`);
  const data = await res.json();
  if (data.error) throw new LookupError('위키낱말사전에 없는 단어예요.', { notFound: true });
  return parseKoWiktionary(data.parse?.wikitext || '');
}

export function parseKoWiktionary(wikitext) {
  // '== 영어 ==' 구간만 (다음 언어 제목 전까지)
  const start = wikitext.search(/^==\s*영어\s*==\s*$/m);
  if (start < 0) throw new LookupError('위키낱말사전에 영어 뜻이 없어요.', { notFound: true });
  const rest = wikitext.slice(start).split('\n');
  const lines = [rest[0]];
  for (const l of rest.slice(1)) {
    if (/^==[^=].*[^=]==\s*$/.test(l)) break;
    lines.push(l);
  }
  const catPos = (lines.join('\n').match(/\[\[분류:영어 ([^\]]+)\]\]/) || [])[1];
  let posLabel = null;
  const senses = [];
  for (const l of lines) {
    const head = l.match(/^===+\s*([^=]+?)\s*===+\s*$/);
    if (head) {
      posLabel = KO_POS[head[1]] ? head[1] : posLabel;
      continue;
    }
    if (!/^#(?![:*#])/.test(l)) continue;
    const meaning = cleanKoWikt(l.replace(/^#\s*/, ''));
    if (!meaning || !/[가-힣]/.test(meaning)) continue;
    const label = posLabel || (KO_POS[catPos] ? catPos : '');
    senses.push({ id: 'ko' + senses.length, pos: KO_POS[label] || '', posLabel: label, meaning });
    if (senses.length >= MAX_SENSES) break;
  }
  if (!senses.length) throw new LookupError('위키낱말사전에 한국어 뜻이 아직 없어요.', { notFound: true });
  return { source: 'kowikt', senses };
}

export function cleanKoWikt(s) {
  return s
    .replace(/〔[^〕]*〕/g, '') // 영문 풀이
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.。]+$/, '')
    .trim();
}

// 한 줄 뜻('꺼리는, 마음이 내키지 않는')을 뜻 목록으로
export const splitKoMeaning = (m) => m.split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
