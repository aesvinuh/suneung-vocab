// 채점 결과를 단어 기록(stats)과 오답 노트(note)에 반영. 원본을 바꾸지 않고 새 객체를 반환.
import { GRADUATION } from './weights.js';

/**
 * @param word 정답 단어
 * @param result { correct: boolean, partial?: boolean, chosenWordId?: string|null, mode: 'normal'|'note' }
 * @returns { word, graduated, entered }
 */
export function applyAnswer(word, { correct, partial = false, chosenWordId = null, mode = 'normal' }, now = Date.now()) {
  const stats = {
    ...word.stats,
    shown: word.stats.shown + 1,
    correct: word.stats.correct + (correct ? 1 : 0),
    wrong: word.stats.wrong + (correct ? 0 : 1),
    lastShownAt: now,
    lastWrongAt: correct ? word.stats.lastWrongAt : now,
  };
  const note = { ...word.note, confusedWith: { ...word.note.confusedWith } };
  let graduated = false;
  let entered = false;

  if (!correct) {
    if (!note.inNote) {
      entered = true;
      note.enteredAt = now;
    }
    note.inNote = true;
    note.streak = 0;
    if (chosenWordId && chosenWordId !== word.id) {
      note.confusedWith[chosenWordId] = (note.confusedWith[chosenWordId] || 0) + 1;
    }
  } else if (note.inNote && !partial && (mode === 'note' || GRADUATION.countInNormalMode)) {
    note.streak += 1;
    if (note.streak >= GRADUATION.streak) {
      note.inNote = false;
      note.streak = 0;
      note.graduatedAt = now;
      note.graduations += 1;
      graduated = true;
    }
  }

  return { word: { ...word, stats, note }, graduated, entered };
}
