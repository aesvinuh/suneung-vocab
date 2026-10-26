// 일괄 추가용 텍스트 파서. 직접 정리한 메모를 붙여 넣으면 단어별로 칸을 나눈다.
//
// 1) 한 줄 형식: 단어 | 뜻 | 뉘앙스 | 예문 | 예문 해석 [| 품사 | 유의어 | 반의어]
//    ('|' 대신 탭도 가능 → 엑셀·구글시트에서 복사)
//
// 2) 여러 줄 형식: 단어 한 줄로 시작, 그 아래 줄들이 그 단어의 정보
//      reluctant (형)
//      꺼리는, 마지못해 하는
//      뉘앙스: 부정적. 하기 싫어서 꺼림
//      He was reluctant to admit his mistake.
//      그는 자기 실수를 인정하기를 꺼렸다.
//    - '뜻:', '예문:', '해석:', '뉘앙스:', '품사:', '유의어:', '반의어:' 같은 머리말이 있으면 그대로 따르고,
//      없으면 내용을 보고 판단한다 (영어 문장 = 예문, 예문 바로 다음 한국어 = 해석,
//      첫 한국어 줄 = 뜻, 그 뒤 한국어 문장 = 뉘앙스).
//    - 영어 1~3단어짜리 줄이 나오면 새 단어로 본다. 빈 줄로 구분해도 된다.
//    - 'reluctant - 꺼리는'처럼 단어와 뜻을 한 줄에 써도 된다.
// '#'으로 시작하는 줄은 무시.
import { POS_OPTIONS, sameWord, splitList } from './word.js';

const POS_ALIASES = {
  n: 'n', noun: 'n', 명: 'n', 명사: 'n',
  v: 'v', vt: 'v', vi: 'v', verb: 'v', 동: 'v', 동사: 'v',
  adj: 'adj', a: 'adj', 형: 'adj', 형용사: 'adj',
  adv: 'adv', ad: 'adv', 부: 'adv', 부사: 'adv',
  prep: 'prep', 전: 'prep', 전치사: 'prep', conj: 'conj', 접: 'conj', 접속사: 'conj',
  phr: 'phr', 숙어: 'phr', 구: 'phr', 숙: 'phr', idiom: 'phr',
};

export function parsePos(text) {
  const key = String(text || '').trim().toLowerCase().replace(/\.$/, '');
  return POS_ALIASES[key] || (POS_OPTIONS.some((p) => p.value === key) ? key : '');
}

const LABELS = [
  ['meanings', /^(뜻|의미|meaning)/i],
  ['pos', /^(품사|pos)/i],
  ['nuance', /^(뉘앙스|느낌|메모|어감|nuance|note)/i],
  ['exampleKo', /^(예문\s*해석|해석|번역|translation)/i],
  ['example', /^(예문|예|ex|example|e\.g)/i],
  ['synonyms', /^(유의어|동의어|비슷한\s*말|syn|synonyms?)/i],
  ['antonyms', /^(반의어|반대말|ant|antonyms?)/i],
];
const LABEL_RE = /^([^:：]{1,12})\s*[:：]\s*(.*)$/;

const hangul = (s) => (s.match(/[가-힣]/g) || []).length;
const latin = (s) => (s.match(/[A-Za-z]/g) || []).length;
const isKorean = (s) => hangul(s) > 0 && hangul(s) >= latin(s) * 0.5;
const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
// 영어 1~3단어 (숙어 포함), 문장부호로 끝나지 않음 → 표제어
const isHeadword = (s) => hangul(s) === 0 && /^[A-Za-z][A-Za-z'’\- ]*$/.test(s) && wordCount(s) <= 3;
const isEnglishSentence = (s) => hangul(s) === 0 && latin(s) > 0 && (wordCount(s) >= 4 || /[.?!]$/.test(s));

// 줄 앞의 번호·글머리표 제거: "1. ", "- ", "• ", "* ", "①"
const stripBullet = (s) => s.replace(/^\s*(?:\d+[.)]\s+|[-•*·▪︎◦]\s+|[①-⑳]\s*)/, '').trim();

// "reluctant (형)", "reluctant [adj]", "reluctant a." → { word, pos }
function splitHeadPos(s) {
  const m = s.match(/^(.*?)\s*[([]\s*([^)\]]+)\s*[)\]]\s*$/) || s.match(/^(.*?)\s+([a-z]{1,4}\.)$/i);
  if (m && parsePos(m[2])) return { word: m[1].trim(), pos: parsePos(m[2]) };
  return { word: s.trim(), pos: '' };
}

// 뜻 앞에 붙은 품사 표시: "(형) 꺼리는", "[동] 줄이다", "adj. 꺼리는"
function splitMeaningPos(s) {
  const m = s.match(/^\s*[([]\s*([^)\]]{1,6})\s*[)\]]\s*(.*)$/) || s.match(/^\s*([a-z]{1,4}\.)\s*(.*)$/i);
  if (m && parsePos(m[1])) return { pos: parsePos(m[1]), text: m[2].trim() };
  return { pos: '', text: s.trim() };
}

function emptyRecord(line) {
  return { line, word: '', pos: '', meanings: [], nuance: [], example: '', exampleKo: '', synonyms: [], antonyms: [], last: null };
}

function addMeaning(rec, text) {
  const { pos, text: t } = splitMeaningPos(text);
  if (pos && !rec.pos) rec.pos = pos;
  rec.meanings.push(...splitList(t));
}

function finish(rec) {
  const data = {
    word: rec.word,
    meanings: rec.meanings,
    pos: rec.pos,
    nuance: rec.nuance.join(' '),
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

function parsePipeLine(raw, line) {
  const cols = (raw.includes('|') ? raw.split('|') : raw.split('\t')).map((c) => c.trim());
  const [word, meanings = '', nuance = '', example = '', exampleKo = '', pos = '', synonyms = '', antonyms = ''] = cols;
  const head = splitHeadPos(stripBullet(word));
  const rec = emptyRecord(line);
  rec.word = head.word;
  rec.pos = parsePos(pos) || head.pos;
  addMeaning(rec, meanings);
  if (nuance) rec.nuance.push(nuance);
  Object.assign(rec, { example, exampleKo, synonyms: splitList(synonyms), antonyms: splitList(antonyms) });
  return finish(rec);
}

export function parseBulk(text, existingWords = []) {
  const records = [];
  const errors = [];
  let cur = null;
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
    if (raw.startsWith('#')) return;

    // 1) 한 줄 형식
    if (raw.includes('|') || raw.includes('\t')) {
      close();
      const r = parsePipeLine(raw, line);
      if (r.data.word) records.push(r);
      else errors.push({ line, text: raw, reason: '단어가 비어 있음' });
      return;
    }

    const s = stripBullet(raw);

    // 머리말이 붙은 줄: "예문: ..."
    const lm = s.match(LABEL_RE);
    const label = lm && LABELS.find(([, re]) => re.test(lm[1].trim()));
    if (label) {
      if (!cur) {
        errors.push({ line, text: raw, reason: '단어 줄보다 먼저 나옴' });
        return;
      }
      const [field] = label;
      const v = lm[2].trim();
      if (field === 'meanings') addMeaning(cur, v);
      else if (field === 'pos') cur.pos = parsePos(v) || cur.pos;
      else if (field === 'nuance') cur.nuance.push(v);
      else if (field === 'synonyms' || field === 'antonyms') cur[field].push(...splitList(v));
      else if (field === 'example') {
        if (cur.example) cur.nuance.push(v); // 예문은 하나만 → 나머지는 메모로
        else cur.example = v;
      } else cur.exampleKo = cur.exampleKo ? cur.exampleKo + ' ' + v : v;
      cur.last = field;
      return;
    }

    // 새 단어 시작: 영어 1~3단어로만 된 줄 (단어만 죽 나열해도 각각 미완성 단어로 들어감)
    const head = splitHeadPos(s);
    if (isHeadword(head.word)) {
      close();
      cur = emptyRecord(line);
      cur.word = head.word;
      cur.pos = head.pos;
      return;
    }

    // "reluctant - 꺼리는" / "reluctant: 꺼리는" / "reluctant 꺼리는"
    const inline = s.match(/^([A-Za-z][A-Za-z'’\- ]*?(?:\s*[([][^)\]]+[)\]])?)\s*(?:[-–—:=]\s*|\s+)(?=.*[가-힣])(.+)$/);
    if (inline && isHeadword(splitHeadPos(inline[1]).word) && isKorean(inline[2])) {
      close();
      const h = splitHeadPos(inline[1]);
      cur = emptyRecord(line);
      cur.word = h.word;
      cur.pos = h.pos;
      addMeaning(cur, inline[2]);
      cur.last = 'meanings';
      return;
    }

    if (!cur) {
      errors.push({ line, text: raw, reason: '단어 줄을 찾지 못함' });
      return;
    }

    // 머리말 없는 줄: 내용으로 판단
    if (isEnglishSentence(s)) {
      if (!cur.example) {
        cur.example = s;
        cur.last = 'example';
      } else {
        cur.nuance.push(s);
        cur.last = 'nuance';
      }
    } else if (isKorean(s)) {
      if (cur.last === 'example' && !cur.exampleKo) {
        cur.exampleKo = s;
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
    const duplicate = seen.has(key) || existingWords.some((w) => sameWord(w.word, r.data.word));
    seen.add(key);
    return { ...r, duplicate };
  });
  return { rows, errors };
}
