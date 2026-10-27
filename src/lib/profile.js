// 뉘앙스 프로필: 단어가 글에서 주는 느낌을 축별로 정리한 구조.
// 뉘앙스 문제는 '확정된' 프로필로만 출제한다. 기존 뉘앙스 메모는 '느낌 메모'(word.nuance)로 그대로 둔다.

export const DIRECTIONS = [
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
  { value: 'neutral', label: '중립' },
  { value: 'context', label: '문맥 의존' },
];
export const ROLES = [
  { value: 'signal', label: '흐름 신호어' },
  { value: 'evaluative', label: '평가어 (필자 태도)' },
  { value: 'content', label: '내용어 (대상 지칭)' },
];
export const SIGNALS = [
  { value: 'contrast', label: '대조' },
  { value: 'cause', label: '인과' },
  { value: 'concession', label: '양보' },
  { value: 'emphasis', label: '강조' },
];
export const INTENSITIES = [
  { value: 'weak', label: '약함' },
  { value: 'medium', label: '보통' },
  { value: 'strong', label: '강함' },
];
const label = (list) => Object.fromEntries(list.map((x) => [x.value, x.label]));
export const DIRECTION_LABEL = label(DIRECTIONS);
export const ROLE_LABEL = label(ROLES);
export const SIGNAL_LABEL = label(SIGNALS);
export const INTENSITY_LABEL = label(INTENSITIES);

const pick = (v, list) => (list.some((x) => x.value === v) ? v : '');

export function emptyProfile() {
  return { direction: '', role: '', signal: '', intensity: '', keywords: [], diff: '', confirmed: false, confirmedAt: null, suggested: null };
}

export function normalizeProfile(p) {
  if (!p) return null;
  const keywords = (Array.isArray(p.keywords) ? p.keywords : String(p.keywords || '').split(/[,;/]/))
    .map((k) => String(k).trim())
    .filter(Boolean)
    .slice(0, 3);
  const role = pick(p.role, ROLES);
  return {
    direction: pick(p.direction, DIRECTIONS),
    role,
    signal: role === 'signal' ? pick(p.signal, SIGNALS) : '',
    intensity: pick(p.intensity, INTENSITIES),
    keywords,
    diff: String(p.diff || '').trim(),
    confirmed: !!p.confirmed,
    confirmedAt: p.confirmedAt || null,
    suggested: p.suggested ? normalizeProfile({ ...p.suggested, suggested: null, confirmed: false }) : null,
  };
}

// 뉘앙스 문제에 쓸 수 있는 프로필: 확정됨 + 평가 방향·역할·강도가 채워짐
export const isConfirmed = (w) => !!(w.profile?.confirmed && w.profile.direction && w.profile.role && w.profile.intensity);
export const isFilled = (p) => !!(p && p.direction && p.role && p.intensity);
// 뜻은 있는데 프로필이 확정되지 않은 단어 → 홈의 '미확정' 개수
export const needsConfirm = (w) => w.meanings.length > 0 && !isConfirmed(w);

// ── 문제·해설 문장 ──

// "필자는 앞 내용을 어떻게 보고 있나?" 보기 (평가 방향 + 글 속 역할)
export const STANCES = {
  'signal:contrast': '앞 내용과 반대되거나 대조되는 흐름을 이끈다',
  'signal:cause': '앞 내용의 원인이나 결과를 이어 준다',
  'signal:concession': '앞 내용을 일단 인정하면서 다른 주장을 펼친다',
  'signal:emphasis': '앞 내용을 강조하거나 한 단계 더 밀고 나간다',
  'evaluative:positive': '앞 내용을 긍정적으로 평가한다',
  'evaluative:negative': '앞 내용을 부정적으로 평가한다',
  'evaluative:neutral': '평가를 섞지 않고 사실을 전달한다',
  'evaluative:context': '문맥에 따라 좋게도 나쁘게도 평가한다',
  'content:positive': '대상을 좋은 쪽으로 그리며 가리킨다',
  'content:negative': '대상을 나쁜 쪽으로 그리며 가리킨다',
  'content:neutral': '평가 없이 대상을 가리킨다',
  'content:context': '평가 없이 대상을 가리키며, 좋고 나쁨은 문맥이 정한다',
};
export function stanceKey(p) {
  if (p.role === 'signal') return p.signal ? `signal:${p.signal}` : null;
  return p.role && p.direction ? `${p.role}:${p.direction}` : null;
}

// "이 단어가 글에서 하는 역할은?" 보기
export const ROLE_CHOICES = {
  'signal:contrast': '흐름 신호어 — 대조',
  'signal:cause': '흐름 신호어 — 인과',
  'signal:concession': '흐름 신호어 — 양보',
  'signal:emphasis': '흐름 신호어 — 강조',
  evaluative: '평가어 — 필자의 태도를 드러냄',
  content: '내용어 — 대상을 가리킴',
};
export const roleKey = (p) => (p.role === 'signal' ? (p.signal ? `signal:${p.signal}` : null) : p.role || null);

// 느낌이 얼마나 가까운지 (같은 평가 방향 > 강도 차이 > 키워드 겹침)
const INT = { weak: 1, medium: 2, strong: 3 };
export function feelSimilarity(a, b) {
  let s = 0;
  if (a.direction && a.direction === b.direction) s += 3;
  else if (a.direction === 'context' || b.direction === 'context') s += 1;
  if (a.intensity && b.intensity) s += 2 - Math.abs(INT[a.intensity] - INT[b.intensity]);
  const kb = new Set(b.keywords);
  s += a.keywords.filter((k) => kb.has(k)).length * 1.5;
  if (a.role && a.role === b.role) s += 0.5;
  return s;
}

// 프로필 한 줄 요약 (해설·목록용)
export function profileSummary(p) {
  if (!p || !isFilled(p)) return '';
  const role = p.role === 'signal' ? `흐름 신호어(${SIGNAL_LABEL[p.signal] || '?'})` : ROLE_LABEL[p.role].replace(/ \(.*/, '');
  const kw = p.keywords.length ? ` · ${p.keywords.join(', ')}` : '';
  return `${DIRECTION_LABEL[p.direction]} · ${role} · 강도 ${INTENSITY_LABEL[p.intensity]}${kw}`;
}
