// 사전 조회: 여러 사전을 동시에 조회해 근거 자료를 모은다 (lookupAll).
//  - Merriam-Webster Learner's (학습자용, 키 필요)
//  - Wiktionary 영어판 (키 불필요, 수록 단어 많음)
//  - Free Dictionary (키 불필요, 가끔 장애)
//  - Datamuse (유의어·반의어)
// 모두 브라우저 직접 호출(CORS) 허용 → 중계 서버 불필요.
//
// 결과 형식:
// { source: 'mw'|'fd', senses: [{ id, pos, definition, examples[] }],
//   synonyms[], antonyms[], relSource: 'mw'|'fd'|null }

const MW_URL = 'https://www.dictionaryapi.com/api/v3/references/learners/json/';
const FD_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const WIKT_URL = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const DM_URL = 'https://api.datamuse.com/words?max=10&';
const MAX_SENSES = 8;
const MAX_REL = 6;

export class LookupError extends Error {
  constructor(message, { notFound = false } = {}) {
    super(message);
    this.notFound = notFound;
  }
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

// ── Wiktionary 영어판 (키 불필요) ─────────────────────────────

export async function lookupWiktionary(word) {
  let res;
  try {
    res = await fetch(WIKT_URL + encodeURIComponent(word.trim().toLowerCase()));
  } catch {
    throw new LookupError('Wiktionary에 연결하지 못했어요.');
  }
  if (res.status === 404) throw new LookupError('Wiktionary에 없는 단어예요.', { notFound: true });
  if (!res.ok) throw new LookupError(`Wiktionary 오류 (${res.status}).`);
  return parseWiktionary(await res.json());
}

const stripHtml = (s = '') =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export function parseWiktionary(data) {
  const senses = [];
  for (const block of data?.en || []) {
    for (const d of block.definitions || []) {
      const definition = stripHtml(d.definition);
      if (!definition || senses.length >= MAX_SENSES) continue;
      const examples = (d.parsedExamples?.map((x) => x.example) || d.examples || []).map(stripHtml).filter(Boolean).slice(0, 2);
      senses.push({ id: 'wk' + senses.length, pos: block.partOfSpeech.toLowerCase(), definition, examples });
    }
  }
  if (!senses.length) throw new LookupError('Wiktionary에 영어 뜻이 없어요.', { notFound: true });
  return { source: 'wikt', senses, synonyms: [], antonyms: [], relSource: null };
}

// ── Datamuse (유의어·반의어, 키 불필요) ───────────────────────

export async function lookupDatamuse(word) {
  const q = encodeURIComponent(word.trim().toLowerCase());
  const get = async (rel) => {
    try {
      const r = await fetch(`${DM_URL}${rel}=${q}`);
      return r.ok ? (await r.json()).map((x) => x.word) : [];
    } catch {
      return [];
    }
  };
  const [synonyms, antonyms] = await Promise.all([get('rel_syn'), get('rel_ant')]);
  return { synonyms: synonyms.slice(0, MAX_REL), antonyms: antonyms.slice(0, MAX_REL) };
}

// ── 종합 조회 ─────────────────────────────────────────────

/**
 * 모든 사전을 동시에 조회해 하나로 모은다.
 * @returns {{ senses: Array<{id, source, pos, definition, examples}>, synonyms: Array<{word, source}>,
 *            antonyms: Array<{word, source}>, found: string[], failed: string[] }}
 */
export async function lookupAll(word, { mwKey } = {}) {
  const w = word.trim();
  const jobs = [
    ['mw', mwKey ? lookupMw(w, mwKey) : Promise.reject(new LookupError('키 없음', { notFound: true }))],
    ['wikt', lookupWiktionary(w)],
    ['fd', lookupFd(w)],
  ];
  const [results, dm] = await Promise.all([Promise.allSettled(jobs.map(([, p]) => p)), lookupDatamuse(w)]);

  const senses = [];
  const synonyms = [];
  const antonyms = [];
  const found = [];
  const failed = [];
  results.forEach((r, i) => {
    const source = jobs[i][0];
    if (r.status !== 'fulfilled') {
      if (!r.reason?.notFound) failed.push(source);
      return;
    }
    found.push(source);
    for (const s of r.value.senses) senses.push({ ...s, source });
    r.value.synonyms.forEach((x) => synonyms.push({ word: x, source }));
    r.value.antonyms.forEach((x) => antonyms.push({ word: x, source }));
  });
  dm.synonyms.forEach((x) => synonyms.push({ word: x, source: 'dm' }));
  dm.antonyms.forEach((x) => antonyms.push({ word: x, source: 'dm' }));

  if (!senses.length) {
    if (failed.length) throw new LookupError('사전에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    throw new LookupError(`'${w}'를 사전에서 찾지 못했어요.`, { notFound: true });
  }
  const target = w.toLowerCase();
  // 유의어 품질 순: MW(편집) → Datamuse(WordNet 기반, 흔한 순) → 나머지
  const order = { mw: 0, dm: 1, fd: 2, wikt: 3 };
  const dedupe = (list) => {
    const seen = new Set([target]);
    return [...list]
      .sort((a, b) => order[a.source] - order[b.source])
      .filter((x) => !seen.has(x.word.toLowerCase()) && seen.add(x.word.toLowerCase()));
  };
  return { senses, synonyms: dedupe(synonyms), antonyms: dedupe(antonyms), found, failed };
}
