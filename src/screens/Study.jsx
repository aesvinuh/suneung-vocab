import { useCallback, useEffect, useRef, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import WordDetail, { Sentence } from '../components/WordDetail.jsx';
import { pickNextWord } from '../lib/weights.js';
import { buildQuestion, TYPE_LABEL } from '../lib/questions.js';
import { applyAnswer } from '../lib/grading.js';
import { buildExplanation, summarize } from '../lib/explain.js';
import { POS_LABEL } from '../lib/word.js';
import { navigate } from '../lib/router.js';

const CORRECT_DELAY = 750; // 정답 표시 후 다음 문제까지(ms)
const GRADE_LABEL = { full: '뉘앙스까지 떠오름', meaning: '뜻만 떠오름', none: '모름' };

export default function Study({ mode }) {
  const { wordsRef, recordAnswer } = useVocab();
  const recentRef = useRef([]);
  const timerRef = useRef(null);
  const lockRef = useRef(false);
  const [cur, setCur] = useState(null); // { word, q }
  const [phase, setPhase] = useState('ask'); // ask | correct | wrong | reveal | empty
  const [chosen, setChosen] = useState(null);
  const [exp, setExp] = useState(null);
  const [session, setSession] = useState({ answered: 0, correct: 0 });
  const [toast, setToast] = useState(null);

  const next = useCallback(() => {
    clearTimeout(timerRef.current);
    const all = wordsRef.current;
    const pool = mode === 'note' ? all.filter((w) => w.note.inNote) : all;
    const word = pickNextWord(pool, { recentIds: recentRef.current, mode });
    setChosen(null);
    setExp(null);
    if (!word) {
      setCur(null);
      setPhase('empty');
      return;
    }
    recentRef.current = [word.id, ...recentRef.current].slice(0, 20);
    setCur({ word, q: buildQuestion(word, all) });
    setPhase('ask');
    lockRef.current = false;
  }, [mode, wordsRef]);

  useEffect(() => {
    next();
    return () => clearTimeout(timerRef.current);
  }, [next]);

  const answer = useCallback(
    async (opt) => {
      if (lockRef.current || !cur) return;
      lockRef.current = true;
      const { q } = cur;
      const all = wordsRef.current;
      const fresh = all.find((w) => w.id === cur.word.id) || cur.word;

      const isSelf = q.type === 'self';
      const correct = isSelf ? opt.grade !== 'none' : opt.correct;
      const partial = isSelf && opt.grade === 'meaning';
      const chosenWord = !correct && opt.wordId ? all.find((w) => w.id === opt.wordId) : null;
      const { word: updated, graduated, entered } = applyAnswer(fresh, { correct, partial, chosenWordId: chosenWord?.id, mode });

      setChosen(opt);
      setSession((s) => ({ answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0) }));
      recordAnswer(updated, correct);
      if (graduated) flash(`'${updated.word}' 오답 노트 졸업!`);
      else if (entered && mode === 'normal') flash('오답 노트에 추가됨');

      if (isSelf) {
        setExp({ correct: summarize(updated), chosen: null, notes: [], contextNote: null });
        setPhase('reveal');
      } else if (correct) {
        setPhase('correct');
        timerRef.current = setTimeout(next, CORRECT_DELAY);
      } else {
        navigator.vibrate?.(40);
        setPhase('wrong');
        setExp(await buildExplanation({ question: q, correctWord: updated, chosenWord, allWords: all }));
      }
    },
    [cur, mode, next, recordAnswer, wordsRef],
  );

  const toastTimer = useRef(null);
  const flash = (text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  // 데스크톱: 숫자키로 보기 선택, Enter로 다음
  useEffect(() => {
    const onKey = (e) => {
      if (phase === 'ask' && cur) {
        const opt = cur.q.options[Number(e.key) - 1];
        if (opt) answer(opt);
      } else if ((phase === 'wrong' || phase === 'reveal') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, cur, answer, next]);

  const rate = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;

  return (
    <div className={'study phase-' + phase}>
      <header className="study-top">
        <button className="icon-btn" onClick={() => navigate('/', { replace: true })} aria-label="학습 끝내기">
          ✕
        </button>
        {toast ? (
          <span className="study-mode toast">{toast}</span>
        ) : (
          <span className="study-mode">
            {mode === 'note' ? '오답 노트' : '무한 학습'}
            {cur && ` · ${TYPE_LABEL[cur.q.type]}`}
          </span>
        )}
        <span className="study-score">
          {session.answered}문제 · {rate}%
        </span>
      </header>


      {phase === 'empty' ? (
        <div className="study-body center">
          <p className="empty">{mode === 'note' ? '오답 노트에 남은 단어가 없어요. 모두 졸업!' : '단어가 없어요. 먼저 단어를 추가하세요.'}</p>
          <button className="btn primary block big" onClick={() => navigate('/', { replace: true })}>
            홈으로
          </button>
        </div>
      ) : (
        cur && (
          <>
            <div className="study-body">
              {phase === 'wrong' || phase === 'reveal' ? (
                <Explanation phase={phase} q={cur.q} chosen={chosen} exp={exp} />
              ) : (
                <Prompt q={cur.q} />
              )}
            </div>
            <div className="study-bottom">
              {phase === 'wrong' || phase === 'reveal' ? (
                <button className="btn primary block big" onClick={next} autoFocus>
                  다음
                </button>
              ) : (
                <div className={'options' + (cur.q.small ? ' small' : '') + (cur.q.type === 'self' ? ' self' : '')}>
                  {cur.q.options.map((o) => {
                    let cls = 'opt';
                    if (phase === 'correct' && o.correct) cls += ' ok';
                    if (o.grade) cls += ' grade-' + o.grade;
                    return (
                      <button key={o.key} className={cls} onClick={() => answer(o)} disabled={phase !== 'ask'}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

function Prompt({ q }) {
  const p = q.prompt;
  return (
    <div className="prompt">
      <p className="prompt-title">{q.title}</p>
      {p.kind === 'word' ? (
        <div className="prompt-word">
          <span>{p.word}</span>
          {p.pos && <small className="pos">{POS_LABEL[p.pos] || p.pos}</small>}
        </div>
      ) : (
        <>
          <p className="prompt-sentence">
            {p.before}
            {p.mode === 'blank' ? <span className="blank">{' '.repeat(10)}</span> : <span className="underline">{p.target}</span>}
            {p.after}
          </p>
          {p.hint && <p className="prompt-hint">{p.hint}</p>}
        </>
      )}
    </div>
  );
}

function Explanation({ phase, q, chosen, exp }) {
  if (!exp) return <p className="muted">해설 준비 중…</p>;
  const c = exp.correct;
  return (
    <div className="explain">
      {phase === 'wrong' ? (
        <div className="verdict bad">
          <strong>오답</strong>
          <span>
            정답 <b>{q.options.find((o) => o.correct)?.label}</b>
          </span>
          <span>
            내 선택 <s>{chosen?.label}</s>
          </span>
        </div>
      ) : (
        <div className={'verdict ' + (chosen?.grade === 'none' ? 'bad' : chosen?.grade === 'full' ? 'ok' : '')}>
          <strong>{GRADE_LABEL[chosen?.grade]}</strong>
        </div>
      )}

      {exp.notes.map((n) => (
        <p key={n} className="note-line">
          {n}
        </p>
      ))}
      {exp.contextNote && <p className="context-note">{exp.contextNote}</p>}

      {exp.chosen ? (
        <div className="compare">
          <div>
            <h3 className="col-label ok">정답</h3>
            <WordDetail word={c} showExample={false} />
          </div>
          <div>
            <h3 className="col-label bad">내가 고른 단어</h3>
            <WordDetail word={exp.chosen} showExample={false} />
          </div>
        </div>
      ) : (
        <WordDetail word={c} showExample={false} />
      )}

      {c.example && (
        <div className="explain-example">
          <p className="en">
            <ExampleSentence s={c} />
          </p>
          {c.exampleKo && <p className="ko">{c.exampleKo}</p>}
        </div>
      )}
      {exp.chosen?.example && (
        <div className="explain-example sub">
          <p className="en">
            <ExampleSentence s={exp.chosen} />
          </p>
          {exp.chosen.exampleKo && <p className="ko">{exp.chosen.exampleKo}</p>}
        </div>
      )}
    </div>
  );
}

const ExampleSentence = ({ s }) => <Sentence text={s.example} word={s.word} />;
