// 해설 만들기: 학습 중에는 API를 부르지 않고, 저장된 데이터(내 단어 + 미리 만든 풀)만으로 만든다.
//  - 모든 선지의 뜻: 내 단어면 저장된 뜻·느낌, AI 헷갈리는 단어면 생성 때 함께 저장한 뜻·'왜 헷갈리는지'
//  - 자세한 해설: 정답이 왜 맞는지 + (틀렸다면) 내가 고른 오답이 왜 안 맞는지
// 나중에 Claude로 실시간 문맥 해설을 붙이려면 fetchContextNote()를 구현하면 된다 (지금은 오프라인 대응으로 사용 안 함).
import { profileSummary, DIRECTION_LABEL, INTENSITY_LABEL, ROLE_CHOICES, STANCES, roleKey, stanceKey } from './profile.js';
import { mainForm, meaningLabelIn } from './distractors.js';

export function summarize(w) {
  return {
    id: w.id,
    word: w.word,
    pos: w.pos,
    meanings: w.meanings,
    tone: w.tone,
    nuance: w.nuance,
    definition: w.definition,
    memo: w.memo,
    form: w.form,
    related: w.related,
    example: w.example, // 별표 표시는 화면의 <Sentence>가 처리
    exampleKo: w.exampleKo,
    synonyms: w.synonyms,
    antonyms: w.antonyms,
    profile: w.profile,
  };
}

const meaningOf = (w) => meaningLabelIn(w.meanings, mainForm(w.meanings)) || w.meanings.slice(0, 3).join(', ');

// 선지 하나의 정보
function optionInfo(o, chosenKey, byId) {
  const base = { key: o.key, label: o.label, correct: !!o.correct, chosen: o.key === chosenKey };
  if (o.wordId && byId.has(o.wordId)) {
    const w = byId.get(o.wordId);
    return { ...base, kind: 'word', wordId: w.id, word: w.word, pos: w.pos, meanings: meaningOf(w), note: profileSummary(w.profile) || w.nuance };
  }
  if (o.confusable) {
    const c = o.confusable;
    return { ...base, kind: 'confusable', word: c.word, pos: c.pos, meanings: c.meanings.join(', '), note: c.why, confusable: c };
  }
  return { ...base, kind: 'choice' };
}

/**
 * @param question buildQuestion() 결과
 * @param correctWord 정답 단어 (최신)
 * @param chosen 고른 선지 (없으면 null)
 * @param allWords 내 단어 전체
 */
export async function buildExplanation({ question: q, correctWord: w, chosen = null, allWords }) {
  const byId = new Map(allWords.map((x) => [x.id, x]));
  byId.set(w.id, w);
  const options = q.options.filter((o) => !o.grade).map((o) => optionInfo(o, chosen?.key, byId));
  const picked = options.find((o) => o.chosen) || null;
  const isCorrect = !picked || picked.correct;
  const ex = q.example;
  const p = w.profile;
  const meaning = meaningOf(w);

  let why = '';
  let whyNot = null;

  if (q.type === 'nuance') {
    const summary = profileSummary(p);
    if (q.sub === 'stance') {
      why = `${w.word}의 프로필은 ${summary}이에요. 그래서 이 단어를 쓴 필자는 "${STANCES[stanceKey(p)]}"고 볼 수 있어요.`;
      if (!isCorrect) whyNot = `"${picked.label}"는 ${w.word}와 맞지 않는 태도예요. 평가 방향(${DIRECTION_LABEL[p.direction]})과 글 속 역할을 다시 보세요.`;
    } else if (q.sub === 'role') {
      why = `${w.word}는 글에서 "${ROLE_CHOICES[roleKey(p)]}" 역할을 해요. (${summary})`;
      if (!isCorrect) whyNot = `"${picked.label}"가 아니라 ${ROLE_CHOICES[roleKey(p)]}예요.`;
    } else if (q.sub === 'feel') {
      const best = byId.get(options.find((o) => o.correct).wordId);
      const shared = best.profile.keywords.filter((k) => p.keywords.includes(k));
      why = `${best.word}도 ${DIRECTION_LABEL[best.profile.direction]} · 강도 ${INTENSITY_LABEL[best.profile.intensity]}${shared.length ? ` · ${shared.join(', ')}` : ''}로 ${w.word}(${summary})와 느낌이 가장 가까워요.`;
      if (!isCorrect) {
        const cw = byId.get(picked.wordId);
        whyNot = `${cw.word}는 ${profileSummary(cw.profile)}라서 ${w.word}와 느낌이 달라요.`;
      }
    } else if (q.sub === 'pair') {
      why = `${ex?.why ? ex.why + ' ' : ''}차이: ${p.diff}`;
      if (!isCorrect) whyNot = `${picked.word || picked.label}${picked.meanings ? `(${picked.meanings})` : ''}는 ${picked.note || '이 문맥의 느낌과 달라요.'}`;
    }
  } else {
    // 뜻·예문 문제
    why = ex?.why || (ex ? `이 문장은 "${ex.ko}"라는 뜻이라 '${meaning}'인 ${w.word}가 맞아요.` : `${w.word}는 '${meaning}'라는 뜻이에요.`);
    if (!isCorrect && picked) {
      if (picked.kind === 'word') {
        const cw = byId.get(picked.wordId);
        const diff = p?.diff && w.synonyms.some((s) => s.toLowerCase() === cw.word.toLowerCase()) ? ` 차이: ${p.diff}` : '';
        whyNot = ex
          ? `${cw.word}는 '${meaningOf(cw)}'라는 뜻이라, 넣으면 문장이 '${meaningOf(cw)}'의 의미가 되어 문맥과 맞지 않아요.${diff}`
          : `'${picked.label}'는 ${cw.word}의 뜻이에요. ${w.word}는 '${meaning}'예요.${diff}`;
      } else if (picked.kind === 'confusable') {
        whyNot = `${picked.word}는 '${picked.meanings}'라는 뜻이에요. ${picked.note}`;
      }
    }
  }

  let contextNote = null;
  try {
    contextNote = await fetchContextNote({ question: q, correctWord: w, chosen });
  } catch {
    contextNote = null;
  }

  return { isCorrect, correct: summarize(w), example: ex, why, whyNot, options, contextNote };
}

// 실시간 AI 문맥 해설 연결 지점 (학습 중 API를 부르지 않는 원칙 때문에 지금은 사용하지 않음)
async function fetchContextNote() {
  return null;
}
