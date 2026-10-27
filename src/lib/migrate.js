// 예전 데이터 → 현재 구조 변환 (설정 → 데이터 정리에서 백업 안내 후 실행)
//  1) 뉘앙스 칸에 섞인 본문 형태·반의어·숙어 분리 (notes.js)
//  2) 뉘앙스 프로필 도입: profile이 없는 단어에 빈 프로필을 만들고,
//     예전 '감정 톤'(긍정/부정/중립)이 있으면 평가 방향 초기값으로 옮김. 미확정 상태.
//     예전 뉘앙스 메모는 지우지 않고 '느낌 메모'(word.nuance)로 그대로 둔다.
import { migrateWord as splitNotes, needsMigration } from './notes.js';
import { emptyProfile } from './profile.js';

export const needsDataUpdate = (w) => w.profile == null;

export function planCleanup(w) {
  let next = needsMigration(w) ? splitNotes(w) : null;
  if (needsDataUpdate(w)) {
    const base = next || w;
    const tone = ['positive', 'negative', 'neutral'].includes(base.tone) ? base.tone : '';
    next = { ...base, profile: { ...emptyProfile(), direction: tone } };
  }
  return next;
}
