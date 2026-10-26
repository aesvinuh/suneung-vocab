// 일괄 추가용 텍스트 파서. 직접 정리한 메모나 Claude·ChatGPT가 정리해 준 글을 붙여 넣으면 단어별로 칸을 나눈다.
//
// 1) 표 형식: 단어 | 품사 | 뜻 (| 예문 | 해석 …) — 칸 순서는 자유. 내용을 보고 판단한다
//    (품사 이름 = 품사, 영어 문장 = 예문, 첫 한국어 = 뜻, 예문 뒤 한국어 = 해석, 영어 단어 목록 = 유의어)
//    - 마크다운 표(| … |), 엑셀·구글시트·채팅 화면에서 복사한 표(탭 구분) 모두 가능
//    - 첫 줄이 '단어 | 품사 | 뜻 | 예문 | 해석' 같은 제목 줄이면 그 순서를 따른다
//    - 표 줄 아래에 예문·해석 줄이 이어져도 그 단어에 붙는다
//    - 'settlement (← settlements)'의 괄호는 기타 메모로, '(반의: distributive)'는 반의어(+메모)로 옮긴다
//
// 2) 여러 줄 형식: 단어 줄로 시작, 그 아래 줄들이 그 단어의 정보
//      ### 1. reluctant (형용사)
//      - **뜻**: 꺼리는, 마지못해 하는
//      - 예문: He was reluctant to admit his mistake. (그는 실수를 인정하기를 꺼렸다.)
//    - '뜻:', '예문:', '해석:', '뉘앙스:', '품사:', '유의어:', '반의어:' (영어 Meaning:, Example: 등도) 머리말을 따르고,
//      없으면 내용을 보고 판단한다 (영어 문장 = 예문, 예문 다음 한국어 = 해석, 첫 한국어 줄 = 뜻, 그 밖의 한국어 = 뉘앙스).
//    - 예문 뒤 괄호 안 한국어는 해석으로 나눈다.
//    - 영어 1~3단어로 된 줄이 나오면 새 단어. 'reluctant - 꺼리는'처럼 한 줄에 써도 된다.
//    - 마크다운 꾸밈(**굵게**, ### 제목, - 목록, > 인용), 번호, 화살표, 이모지는 무시한다.
// '//'로 시작하는 줄은 메모로 보고 무시.
import { POS_OPTIONS, sameWord, splitList } from './word.js';
import { classifyNote } from './notes.js';

const POS_ALIASES = {
  n: 'n', noun: 'n', 명: 'n', 명사: 'n',
  v: 'v', vt: 'v', vi: 'v', verb: 'v', 동: 'v', 동사: 'v',
  adj: 'adj', a: 'adj', adjective: 'adj', 형: 'adj', 형용사: 'adj',
  adv: 'adv', ad: 'adv', adverb: 'adv', 부: 'adv', 부사: 'adv',
  prep: 'prep', preposition: 'prep', 전: 'prep', 전치사: 'prep', conj: 'conj', conjunction: 'conj', 접: 'conj', 접속사: 'conj',
  phr: 'phr', phrase: 'phr', 숙어: 'phr', 구: 'phr', 숙: 'phr', idiom: 'phr', 관용구: 'phr', 구동사: 'phr', 'phrasal verb': 'phr',
};

export function parsePos(text) {
  const key = String(text || '').trim().toLowerCase().replace(/\.$/, '');
  return POS_ALIASES[key] || (POS_OPTIONS.some((p) => p.value === key) ? key : '');
}

// 머리말(줄 앞 '뜻:')과 표 제목 줄에 공통으로 쓰는 이름
const FIELD_NAMES = [
  ['word', /^(단어|영단어|영어|표제어|어휘|word|english|vocab(ulary)?)$/i],
  ['exampleKo', /^(예문\s*해석|해석|번역|뜻\s*풀이\s*해석|translation|korean\s*translation)/i],
  ['example', /^(예문|예시|예|ex|example(\s*sentence)?|sentence|e\.g)/i],
  ['meanings', /^(뜻|의미|한국어\s*뜻|한국어|meaning|definition|korean)/i],
  ['pos', /^(품사|pos|part\s*of\s*speech)/i],
  ['form', /^(본문\s*형태|지문\s*형태)/i],
  ['related', /^(관련\s*표현|숙어|연어|구문|phrases?|collocations?)/i],
  ['memo', /^(기타\s*메모|메모|참고|팁)/i],
  ['nuance', /^(뉘앙스|느낌|어감|특징|설명|nuance|note|usage)/i],
  ['synonyms', /^(유의어|동의어|비슷한\s*말|syn|synonyms?)/i],
  ['antonyms', /^(반의어|반대말|ant|antonyms?)/i],
  ['skip', /^(번호|no\.?|#|발음|pronunciation|ipa)$/i],
];
const fieldOf = (name) => FIELD_NAMES.find(([, re]) => re.test(name.trim()))?.[0] || null;
const LABEL_RE = /^([^:：]{1,20}?)\s*[:：]\s*(.*)$/;

const hangul = (s) => (s.match(/[가-힣]/g) || []).length;
const latin = (s) => (s.match(/[A-Za-z]/g) || []).length;
const isKorean = (s) => hangul(s) > 0 && hangul(s) >= latin(s) * 0.5;
const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
// 영어 1~3단어 (숙어 포함), 문장부호로 끝나지 않음 → 표제어
const isHeadword = (s) => hangul(s) === 0 && /^[A-Za-z][A-Za-z'’\- ]*$/.test(s) && wordCount(s) <= 3;
const isEnglishSentence = (s) => hangul(s) === 0 && latin(s) > 0 && (wordCount(s) >= 4 || /[.?!]$/.test(s));

// 마크다운 꾸밈·번호·글머리표·화살표·이모지 제거 (불규칙 활용 표시용 *단어*는 남김)
export function cleanLine(raw) {
  let s = raw.replace(/\*\*|__|`/g, '').trim();
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/^[^\p{L}\p{N}(["“‘'*]+/u, '') // # > - • → ✅ 등
      .replace(/^(?:\d{1,3}[.)]|[①-⑳]|[a-z][.)](?=\s))\s*/u, '') // 1. 1) ① a)
      .trim();
  }
  return s.replace(/^(?:ex|e\.g|예)\s*[).:]\s*/i, '예문: ');
}

// "She was reluctant to go. (그녀는 가기를 꺼렸다.)" → { en, ko }
export function splitExampleKo(s) {
  const i = s.search(/[가-힣]/);
  if (i < 0) return { en: s.trim(), ko: '' };
  const en = s.slice(0, i).replace(/[\s(（[/|–—-]+$/, '').trim();
  const ko = s.slice(i).replace(/[)）\]]+\s*$/, '').trim();
  if (hangul(en) === 0 && wordCount(en) >= 3 && latin(en) >= 8) return { en, ko };
  return null;
}

// "reluctant (형)", "reluctant [adj]", "reluctant a." → { word, pos }
// "settlement (← settlements)" → { word: 'settlement', note: 'settlements' } (본문 형태)
function splitHeadPos(s) {
  const m = s.match(/^(.*?)\s*[([]\s*([^)\]]+)\s*[)\]]\s*$/) || s.match(/^(.*?)\s+([a-z]{1,4}\.)$/i);
  if (m && parsePos(m[2])) return { word: m[1].trim(), pos: parsePos(m[2]), note: '' };
  if (m && /^[A-Za-z]/.test(m[1]) && !/[.?!]$/.test(m[1].trim())) {
    return { word: m[1].trim(), pos: '', note: m[2].trim().replace(/^[←<]-?\s*/, '') };
  }
  return { word: s.trim(), pos: '', note: '' };
}

function startRecord(line, head) {
  const rec = emptyRecord(line);
  rec.word = head.word;
  rec.pos = head.pos;
  if (head.note) rec.form.push(head.note);
  return rec;
}

// 뜻 앞에 붙은 품사 표시: "(형) 꺼리는", "[동] 줄이다", "adj. 꺼리는"
function splitMeaningPos(s) {
  const m = s.match(/^\s*[([]\s*([^)\]]{1,12})\s*[)\]]\s*(.*)$/) || s.match(/^\s*([a-z]{1,4}\.)\s*(.*)$/i);
  if (m && parsePos(m[1])) return { pos: parsePos(m[1]), text: m[2].trim() };
  return { pos: '', text: s.trim() };
}

function emptyRecord(line) {
  return { line, word: '', pos: '', meanings: [], nuance: [], form: [], related: [], memo: [], example: '', exampleKo: '', synonyms: [], antonyms: [], last: null };
}

// 괄호 메모·참고 줄을 알맞은 칸에 (본문 형태 / 반의·유의 / 관련 표현 / 기타 메모)
function addNote(rec, text, { asNuance = false } = {}) {
  const c = classifyNote(text, rec.word);
  if (c.field === 'nuance') {
    (asNuance ? rec.nuance : rec.memo).push(c.value);
    return;
  }
  if (c.words) {
    rec[c.field].push(...c.words);
    if (/[가-힣]/.test(c.value)) rec.memo.push(c.value);
  } else rec[c.field].push(c.value);
}

// 뜻 끝의 설명 괄호 → 기타 메모 (반의:/유의: 는 반의어·유의어 칸에도). 뉘앙스 칸에는 넣지 않음
// 예: "통합적인 (반의: distributive 분배적인)", "상충하다 (명사는 앞, 동사는 뒤에 강세)"
// "(책임·역할을) 맡다"처럼 앞에 붙은 짧은 괄호는 뜻의 일부로 둔다
function takeTrailingNotes(rec, text) {
  let t = text.trim();
  let m;
  while ((m = t.match(/\s*[(（]([^()（）]*)[)）]\s*$/)) && m.index > 0 && (/[:：,]|반의|반대|유의|동의|참고|cf\b|주의|강세/.test(m[1]) || m[1].length > 12)) {
    addNote(rec, m[1].trim());
    t = t.slice(0, m.index).trim();
  }
  return t;
}

function addMeaning(rec, text) {
  const { pos, text: t } = splitMeaningPos(text);
  if (pos && !rec.pos) rec.pos = pos;
  rec.meanings.push(...splitList(takeTrailingNotes(rec, t)).filter((x) => !parsePos(x)));
}

function addExample(rec, text) {
  const split = splitExampleKo(text) || { en: text.trim(), ko: '' };
  if (rec.example) {
    rec.nuance.push(text.trim()); // 예문은 하나만 → 나머지는 메모로
    return;
  }
  rec.example = split.en;
  if (split.ko && !rec.exampleKo) rec.exampleKo = split.ko;
}

// 머리말이 가리키는 칸에 값 넣기
function putField(rec, field, v) {
  if (!v) return;
  if (field === 'meanings') addMeaning(rec, v);
  else if (field === 'pos') rec.pos = parsePos(v) || splitMeaningPos(`(${v})`).pos || rec.pos;
  else if (field === 'nuance') addNote(rec, v, { asNuance: true });
  else if (field === 'form') rec.form.push(v);
  else if (field === 'related') rec.related.push(v);
  else if (field === 'memo') rec.memo.push(v);
  else if (field === 'synonyms' || field === 'antonyms') rec[field].push(...splitList(v));
  else if (field === 'example') addExample(rec, v);
  else if (field === 'exampleKo') rec.exampleKo = rec.exampleKo ? rec.exampleKo + ' ' + v : v;
  rec.last = field;
}

function finish(rec) {
  const data = {
    word: rec.word,
    meanings: [...new Set(rec.meanings)],
    pos: rec.pos,
    nuance: rec.nuance.join(' '),
    form: rec.form.join(', '),
    related: rec.related.join(' · '),
    memo: rec.memo.join(' · '),
    example: rec.example,
    exampleKo: rec.exampleKo,
    synonyms: rec.synonyms,
    antonyms: rec.antonyms,
  };
  const warnings = [];
  if (!data.meanings.length) warnings.push('뜻 없음 → 미완성으로 추가');
  if (data.example && !data.exampleKo) warnings.push('예문 해석 없음');
  if (!data.example && data.exampleKo) warnings.push('해석만 있고 예문 없음');
  return { line: rec.line, data, warnings };
}

// ── 표 한 줄 ──
const splitCells = (raw) => {
  const t = raw.trim().replace(/^\|/, '').replace(/\|$/, '');
  return (raw.includes('|') ? t.split('|') : raw.split('\t')).map((c) => c.replace(/\*\*|__|`/g, '').trim());
};
const isSeparatorRow = (raw) => /^[\s|:\-–—]+$/.test(raw) && raw.includes('-');
// 제목 줄인지: 칸의 절반 이상이 알려진 이름이고 '단어' 칸이 있음
function headerColumns(cells) {
  const fields = cells.map((c) => (c ? fieldOf(c) : null));
  const known = fields.filter(Boolean).length;
  return fields.includes('word') && known >= Math.max(2, cells.filter(Boolean).length / 2) ? fields : null;
}

// 제목 줄이 있는 표: 그 순서대로
function parseTableRow(cells, columns, line) {
  const rec = emptyRecord(line);
  cells.forEach((cell, i) => {
    const field = columns[i];
    if (!cell || !field || field === 'skip') return;
    if (field !== 'word') return putField(rec, field, cell);
    const h = splitHeadPos(cleanLine(cell));
    rec.word = h.word;
    if (h.pos && !rec.pos) rec.pos = h.pos;
    if (h.note) rec.form.push(h.note);
  });
  return rec;
}

// 제목 줄이 없는 표: 첫 칸 = 단어, 나머지는 내용으로 판단
// 'conflict | 명사 | 갈등, 충돌 / 동사 | 상충하다'처럼 품사가 여러 개여도 뜻을 모두 모은다
function inferTableRow(cells, line) {
  const tokens = cells.flatMap((c) => c.split(/\s+\/\s+/)).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return emptyRecord(line);
  const rec = startRecord(line, splitHeadPos(cleanLine(tokens[0])));
  let afterPos = false;
  for (const t of tokens.slice(1)) {
    const pos = parsePos(t);
    if (pos) {
      if (!rec.pos) rec.pos = pos;
      afterPos = true;
      continue;
    }
    if (isEnglishSentence(t) || (hangul(t) && splitExampleKo(t))) addExample(rec, t);
    else if (!hangul(t)) (rec.synonyms.length ? rec.antonyms : rec.synonyms).push(...splitList(t));
    else if (afterPos || !rec.meanings.length) addMeaning(rec, t);
    else if (rec.example && !rec.exampleKo) rec.exampleKo = t;
    else rec.nuance.push(t);
    afterPos = false;
  }
  rec.last = rec.exampleKo ? 'exampleKo' : rec.example ? 'example' : 'meanings';
  return rec;
}

export function parseBulk(text, existingWords = []) {
  const records = [];
  const errors = [];
  let cur = null;
  let columns = null; // 표 제목 줄에서 읽은 칸 순서
  const close = () => {
    if (cur && cur.word) records.push(finish(cur));
    cur = null;
  };

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = i + 1;
    const raw = rawLine.trim();
    if (!raw) {
      close(); // 빈 줄 = 단어 구분
      return;
    }
    if (raw.startsWith('//')) return;

    // 1) 표 형식
    if (raw.includes('|') || rawLine.includes('\t')) {
      close();
      if (isSeparatorRow(raw)) return;
      const cells = splitCells(rawLine);
      const header = headerColumns(cells);
      if (header) {
        columns = header;
        return;
      }
      const rec = columns ? parseTableRow(cells, columns, line) : inferTableRow(cells, line);
      if (rec.word) cur = rec; // 아래 줄의 예문·해석이 이 단어에 붙도록
      else errors.push({ line, text: raw, reason: '단어 칸이 비어 있음' });
      return;
    }
    columns = null;

    const s = cleanLine(raw);
    if (!s) return;

    // 머리말이 붙은 줄: "예문: ..."
    const lm = s.match(LABEL_RE);
    const field = lm && fieldOf(lm[1]);
    if (field && field !== 'skip' && field !== 'word') {
      if (!cur) {
        errors.push({ line, text: raw, reason: '단어 줄보다 먼저 나옴' });
        return;
      }
      putField(cur, field, lm[2].trim());
      return;
    }
    if (field === 'word' && lm[2].trim()) {
      // "단어: reluctant"
      close();
      cur = startRecord(line, splitHeadPos(lm[2].trim()));
      return;
    }

    // 새 단어 시작: 영어 1~3단어로만 된 줄 (단어만 죽 나열해도 각각 미완성 단어로 들어감)
    const head = splitHeadPos(s);
    if (isHeadword(head.word)) {
      close();
      cur = startRecord(line, head);
      return;
    }

    // 영어 문장 + 괄호 속 해석 ("The storm abated. (폭풍이 잦아들었다.)")은 예문
    const exKo = hangul(s) ? splitExampleKo(s) : null;

    // "reluctant - 꺼리는" / "reluctant: 꺼리는" / "reluctant [형] 꺼리는"
    // 단어 뒤 한국어 앞에 다른 영어가 끼어 있으면(예문) 아님. 품사 표시 [동사], adj. 는 허용
    const inline = !exKo && s.match(/^([A-Za-z][A-Za-z'’\- ]*?(?:\s*[([][^)\]]+[)\]])?)\s*(?:[-–—:=]\s*|\s+)(?=.*[가-힣])(.+)$/);
    const beforeKo = inline ? inline[2].slice(0, inline[2].search(/[가-힣]/)).replace(/[([][^)\]]*[)\]]|\b[a-z]{1,4}\./gi, '') : '';
    if (inline && latin(beforeKo) === 0 && isHeadword(splitHeadPos(inline[1]).word) && isKorean(inline[2])) {
      close();
      cur = startRecord(line, splitHeadPos(inline[1]));
      addMeaning(cur, inline[2]);
      cur.last = 'meanings';
      return;
    }

    if (!cur) {
      errors.push({ line, text: raw, reason: '단어 줄을 찾지 못함' });
      return;
    }

    // 머리말 없는 줄: 내용으로 판단
    if (isEnglishSentence(s) || exKo) {
      if (!cur.example) {
        addExample(cur, s);
        cur.last = cur.exampleKo ? 'exampleKo' : 'example';
      } else {
        cur.nuance.push(s);
        cur.last = 'nuance';
      }
    } else if (isKorean(s)) {
      if (cur.last === 'example' && !cur.exampleKo) {
        cur.exampleKo = s.replace(/^[(（]|[)）]$/g, '').trim();
        cur.last = 'exampleKo';
      } else if (!cur.meanings.length) {
        addMeaning(cur, s);
        cur.last = 'meanings';
      } else {
        cur.nuance.push(s);
        cur.last = 'nuance';
      }
    } else {
      cur.nuance.push(s);
      cur.last = 'nuance';
    }
  });
  close();

  const seen = new Set();
  const rows = records.map((r) => {
    const key = r.data.word.toLowerCase();
    const existing = existingWords.find((w) => sameWord(w.word, r.data.word));
    const repeat = seen.has(key); // 붙여 넣은 글 안에서 두 번째로 나온 단어
    seen.add(key);
    return { ...r, duplicate: repeat || !!existing, repeat, existingId: existing?.id || null };
  });
  return { rows, errors };
}
