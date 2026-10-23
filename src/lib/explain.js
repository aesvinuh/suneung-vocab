// 오답 해설 생성. 지금은 저장된 데이터만으로 만들지만,
// 나중에 Claude API로 문맥 해설을 붙일 때는 fetchContextNote()만 구현하면 된다.
import { effectiveTone, registeredSynonyms, TONE_LABEL } from './word.js';

/**
 * @returns Promise<{
 *   correct: WordSummary, chosen: WordSummary|null,
 *   notes: string[],          // 차이를 짚어주는 짧은 문장들
 *   contextNote: string|null, // (선택) AI 문맥 해설
 * }>
 */
export async function buildExplanation({ question, correctWord, chosenWord, allWords }) {
  const notes = localNotes(correctWord, chosenWord, allWords);
  let contextNote = null;
  try {
    contextNote = await fetchContextNote({ question, correctWord, chosenWord });
  } catch {
    contextNote = null; // 해설 생성이 실패해도 학습은 계속
  }
  return {
    correct: summarize(correctWord),
    chosen: chosenWord && chosenWord.id !== correctWord.id ? summarize(chosenWord) : null,
    notes,
    contextNote,
  };
}

export function summarize(w) {
  return {
    id: w.id,
    word: w.word,
    pos: w.pos,
    meanings: w.meanings,
    tone: effectiveTone(w),
    nuance: w.nuance,
    definition: w.definition,
    example: w.example, // 별표 표시는 화면의 <Sentence>가 처리
    exampleKo: w.exampleKo,
    synonyms: w.synonyms,
    antonyms: w.antonyms,
  };
}

function localNotes(correct, chosen, all) {
  const notes = [];
  if (!chosen || chosen.id === correct.id) return notes;
  const a = effectiveTone(correct);
  const b = effectiveTone(chosen);
  if (registeredSynonyms(correct, all).some((w) => w.id === chosen.id)) {
    notes.push(`${correct.word}와 ${chosen.word}는 유의어예요. 아래 뉘앙스 메모로 차이를 확인하세요.`);
  }
  if (correct.antonyms.some((x) => x.toLowerCase() === chosen.word.toLowerCase())) {
    notes.push(`${chosen.word}는 ${correct.word}의 반의어예요.`);
  }
  if (a && b && a !== b) {
    notes.push(`${correct.word}는 ${TONE_LABEL[a]}, ${chosen.word}는 ${TONE_LABEL[b]} 뉘앙스예요.`);
  }
  if (correct.pos && chosen.pos && correct.pos !== chosen.pos) {
    notes.push('두 단어는 품사가 달라요.');
  }
  return notes;
}

// ── Claude API 연결 지점 ──────────────────────────────────────
// 예시 (서버 없이 브라우저에서 키를 쓰면 키가 노출되므로, 실제로는
// Cloudflare Workers 같은 작은 프록시를 두고 그 주소를 호출하는 것을 권장):
//
// async function fetchContextNote({ question, correctWord, chosenWord }) {
//   const res = await fetch('https://내-프록시/explain', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       sentence: correctWord.example,
//       answer: correctWord.word,
//       chosen: chosenWord?.word,
//       questionType: question.type,
//     }),
//   });
//   const data = await res.json();
//   return data.text; // "이 문장에서는 ~ 때문에 ~가 자연스럽다"
// }
async function fetchContextNote() {
  return null;
}
