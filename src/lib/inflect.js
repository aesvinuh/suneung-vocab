// 예문에서 단어(활용형 포함)를 찾아 빈칸/밑줄 처리하기 위한 함수들.
// 불규칙 활용(fought, ran 등)은 예문에 *fought*처럼 별표로 감싸면 그 부분을 정답 위치로 사용.

const VOWEL = /[aeiou]/;

export function inflections(base) {
  const w = base.toLowerCase().trim();
  const forms = new Set([w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing', w + 'er', w + 'est', w + 'ly', w + 'ness']);
  const last = w.slice(-1);

  if (last === 'e') {
    const stem = w.slice(0, -1);
    forms.add(stem + 'ing');
    forms.add(stem + 'ed');
    if (w.endsWith('le')) forms.add(stem + 'y'); // humble → humbly
  }
  if (w.endsWith('ie')) forms.add(w.slice(0, -2) + 'ying');
  if (last === 'y' && w.length > 1 && !VOWEL.test(w.at(-2))) {
    const stem = w.slice(0, -1);
    ['ies', 'ied', 'ier', 'iest', 'ily', 'iness'].forEach((suf) => forms.add(stem + suf));
  }
  // 자음+모음+자음으로 끝나면 끝 자음 중복: compel → compelled, stop → stopping
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
    forms.add(w + last + 'ed');
    forms.add(w + last + 'ing');
    forms.add(w + last + 'er');
  }
  if (w.endsWith('ic')) forms.add(w + 'ally');
  if (/(s|x|z|ch|sh)$/.test(w)) forms.add(w + 'es');
  return [...forms];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPattern(base) {
  const parts = base.trim().split(/\s+/);
  const head = inflections(parts[0]).sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const rest = parts.slice(1).map(escapeRe).join('\\s+');
  return `(?<![A-Za-z])(?:${head})${rest ? '\\s+' + rest : ''}(?![A-Za-z])`;
}

// 반환: { before, target, after } 또는 null
export function findTarget(sentence, base) {
  if (!sentence || !base) return null;
  const marked = sentence.match(/\*([^*]+)\*/);
  if (marked) {
    const i = marked.index;
    return {
      before: stripMarkers(sentence.slice(0, i)),
      target: marked[1],
      after: stripMarkers(sentence.slice(i + marked[0].length)),
    };
  }
  const m = new RegExp(buildPattern(base), 'i').exec(sentence);
  if (!m) return null;
  return {
    before: sentence.slice(0, m.index),
    target: m[0],
    after: sentence.slice(m.index + m[0].length),
  };
}

export function stripMarkers(text = '') {
  return text.replace(/\*([^*]+)\*/g, '$1');
}

// 뉘앙스 메모를 보기로 쓸 때 정답 단어가 드러나지 않게 가림
export function maskWord(text, base, mask = '○○') {
  if (!text || !base) return text;
  return text.replace(new RegExp(buildPattern(base), 'gi'), mask);
}
