// 일괄 추가용 텍스트 파서
// 한 줄 = 단어 | 뜻 | 뉘앙스 | 예문 | 예문 해석 [| 품사 | 유의어 | 반의어]
// 뜻·유의어·반의어는 쉼표(,)나 슬래시(/)로 여러 개. '|' 대신 탭(엑셀 복사)도 가능. '#'으로 시작하면 무시.
import { POS_OPTIONS, sameWord } from './word.js';

const POS_ALIASES = {
  n: 'n', noun: 'n', 명: 'n', 명사: 'n',
  v: 'v', verb: 'v', 동: 'v', 동사: 'v',
  adj: 'adj', a: 'adj', 형: 'adj', 형용사: 'adj',
  adv: 'adv', ad: 'adv', 부: 'adv', 부사: 'adv',
  prep: 'prep', 전치사: 'prep', conj: 'conj', 접속사: 'conj',
  phr: 'phr', 숙어: 'phr', 구: 'phr',
};

export function parsePos(text) {
  const key = String(text || '').trim().toLowerCase().replace(/\.$/, '');
  return POS_ALIASES[key] || (POS_OPTIONS.some((p) => p.value === key) ? key : '');
}

export function parseBulk(text, existingWords = []) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    const cols = (raw.includes('|') ? raw.split('|') : raw.split('\t')).map((c) => c.trim());
    const [word, meanings, nuance = '', example = '', exampleKo = '', pos = '', synonyms = '', antonyms = ''] = cols;
    if (!word || !meanings) {
      errors.push({ line: i + 1, text: raw, reason: '단어와 뜻은 필수' });
      return;
    }
    const key = word.toLowerCase();
    const duplicate = seen.has(key) || existingWords.some((w) => sameWord(w.word, word));
    seen.add(key);
    rows.push({ line: i + 1, duplicate, data: { word, meanings, nuance, example, exampleKo, pos: parsePos(pos), synonyms, antonyms } });
  });
  return { rows, errors };
}
