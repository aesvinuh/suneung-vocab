import { useCallback, useEffect, useRef, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import WordDetail, { Sentence } from '../components/WordDetail.jsx';
import ProfileEditor from '../components/ProfileEditor.jsx';
import { pickNextWord } from '../lib/weights.js';
import { buildQuestion, NUANCE_LABEL, TYPE_LABEL } from '../lib/questions.js';
import { applyAnswer } from '../lib/grading.js';
import { buildExplanation } from '../lib/explain.js';
import { markExampleUsed, pickExample } from '../lib/pools.js';
import { hasMeaning, POS_LABEL } from '../lib/word.js';
import { navigate } from '../lib/router.js';

// 자기평가 '모름' → 이만큼 문제 뒤에 같은 단어 다시
const REQUEUE_MIN = 5;
const REQUEUE_MAX = 10;
const REAL_TYPES = ['meaning', 'blank', 'underline', 'synonym', 'nuance'];

export default function Study({ mode }) {
  const { wordsRef, recordAnswer, saveWord, addWords } = useVocab();
  const recentRef = useRef([]);
  const lockRef = useRef(false);
  const followRef = useRef(null); // 자기평가 직후 이어서 낼 문제 { wordId, types, fallback, illusion, note }
  const requeueRef = useRef([]); // '모름' 단어 재출제 [{ wordId, due }]
  const answeredRef = useRef(0);
  const [cur, setCur] = useState(null); // { word, q, illusion, note }
  const [phase, setPhase] = useState('ask'); // ask | result | card | empty
  const [chosen, setChosen] = useState(null);
  const [exp, setExp] = useState(null);
  const [session, setSession] = useState({ answered: 0, correct: 0 });
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null); // '내 느낌은 달라' 프로필 편집 중인 단어
  const [added, setAdded] = useState(() => new Set());

  const toastTimer = useRef(null);
  const flash = (text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const next = useCallback(() => {
    const all = wordsRef.current.filter(hasMeaning); // 미완성(뜻 없음) 단어는 출제하지 않음
    const pool = mode === 'note' ? all.filter((w) => w.note.inNote) : all;
    const find = (id) => all.find((w) => w.id === id);
    let word = null;
    let q = null;
    let extra = {};

    // 1) 자기평가 후속 문제
    const f = followRef.current;
    followRef.current = null;
    if (f && (word = find(f.wordId))) {
      q = buildQuestion(word, all, Math.random, { types: f.types });
      if (q) extra = { illusion: f.illusion };
      else if (f.fallback) {
        q = buildQuestion(word, all, Math.random, { types: f.fallback });
        extra = { note: f.fallbackNote };
      }
    }
    // 2) '모름' 단어 재출제
    if (!q) {
      const i = requeueRef.current.findIndex((r) => r.due <= answeredRef.current);
      if (i >= 0) {
        const [r] = requeueRef.current.splice(i, 1);
        word = find(r.wordId);
        q = word && buildQuestion(word, all, Math.random, { types: REAL_TYPES });
        if (q) extra = { note: '아까 모른다고 한 단어예요.' };
      }
    }
    // 3) 가중치로 뽑기
    if (!q) {
      word = pickNextWord(pool, { recentIds: recentRef.current, mode });
      q = word && buildQuestion(word, all);
    }

    setChosen(null);
    setExp(null);
    if (!word || !q) {
      setCur(null);
      setPhase('empty');
      return;
    }
    recentRef.current = [word.id, ...recentRef.current].slice(0, 20);
    setCur({ word, q, ...extra });
    setPhase('ask');
    lockRef.current = false;
  }, [mode, wordsRef]);

  useEffect(() => {
    next();
  }, [next]);

  const answer = useCallback(
    async (opt) => {
      if (lockRef.current || !cur) return;
      lockRef.current = true;
      const { q } = cur;
      const all = wordsRef.current.filter(hasMeaning);
      const fresh = all.find((w) => w.id === cur.word.id) || cur.word;
      setChosen(opt);

      // 자기평가 카드: 고른 것에 따라 바로 다음 화면으로
      if (q.type === 'self') {
        if (opt.grade === 'none') {
          const { word: updated } = applyAnswer(fresh, { correct: false, mode });
          recordAnswer(updated, false);
          answeredRef.current++;
          setSession((s) => ({ answered: s.answered + 1, correct: s.correct }));
          requeueRef.current.push({ wordId: fresh.id, due: answeredRef.current + REQUEUE_MIN + Math.floor(Math.random() * (REQUEUE_MAX - REQUEUE_MIN + 1)) });
          setCur((c) => ({ ...c, word: updated, cardExample: pickExample(updated) }));
          setPhase('card');
          return;
        }
        followRef.current =
          opt.grade === 'meaning'
            ? { wordId: fresh.id, types: ['meaning', 'underline'] }
            : {
                wordId: fresh.id,
                types: ['nuance'],
                illusion: true,
                fallback: ['meaning', 'underline'],
                fallbackNote: '확정된 뉘앙스 프로필이 없어 뜻 문제로 확인해요.',
              };
        next();
        return;
      }

      const correct = !!opt.correct;
      const chosenWordId = !correct && opt.wordId ? opt.wordId : null;
      const res = applyAnswer(fresh, { correct, chosenWordId, mode, illusion: !!cur.illusion });
      const updated = markExampleUsed(res.word, q.example?.id);
      answeredRef.current++;
      setSession((s) => ({ answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0) }));
      recordAnswer(updated, correct);
      if (res.illusion) flash('착각 단어로 기록했어요 — 더 자주 나와요');
      else if (res.graduated) flash(`'${updated.word}' 오답 노트 졸업!`);
      else if (res.entered && mode === 'normal') flash('오답 노트에 추가됨');
      if (!correct) navigator.vibrate?.(40);
      setExp(await buildExplanation({ question: q, correctWord: updated, chosen: opt, allWords: all }));
      setPhase('result');
    },
    [cur, mode, next, recordAnswer, wordsRef],
  );

  // 데스크톱: 숫자키로 보기 선택, Enter로 다음
  useEffect(() => {
    const onKey = (e) => {
      if (editing) return;
      if (phase === 'ask' && cur) {
        const opt = cur.q.options[Number(e.key) - 1];
        if (opt) answer(opt);
      } else if ((phase === 'result' || phase === 'card') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, cur, answer, next, editing]);

  const addConfusable = async (c) => {
    await addWords([{ word: c.word, meanings: c.meanings, pos: c.pos }]);
    setAdded((s) => new Set(s).add(c.word.toLowerCase()));
    flash(`'${c.word}'를 단어장에 추가했어요`);
  };

  const rate = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;
  const typeLabel = cur ? (cur.q.type === 'nuance' ? `뉘앙스 · ${NUANCE_LABEL[cur.q.sub]}` : TYPE_LABEL[cur.q.type]) : '';
  const latestWord = cur && (wordsRef.current.find((w) => w.id === cur.word.id) || cur.word);

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
            {cur && ` · ${typeLabel}`}
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
              {editing ? (
                <div className="stack">
                  <p className="prompt-title">'{editing.word}' 뉘앙스 프로필 고치기</p>
                  <ProfileEditor
                    word={editing}
                    onSave={async (w) => {
                      await saveWord(w);
                      setEditing(null);
                      flash('프로필을 고쳐 확정했어요');
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : phase === 'result' ? (
                <Explanation q={cur.q} exp={exp} added={added} onAdd={addConfusable} />
              ) : phase === 'card' ? (
                <StudyCard word={cur.word} ex={cur.cardExample} />
              ) : (
                <>
                  {cur.note && <p className="notice">{cur.note}</p>}
                  {cur.illusion && <p className="notice">뉘앙스까지 떠오른다고 했으니 확인해 볼게요.</p>}
                  {wordsRef.current.filter(hasMeaning).length < 4 && (
                    <p className="notice">뜻이 있는 단어가 4개 이상이면 4지선다 문제도 나와요.</p>
                  )}
                  <Prompt q={cur.q} />
                </>
              )}
            </div>
            {!editing && (
              <div className="study-bottom">
                {phase === 'result' || phase === 'card' ? (
                  <div className="result-actions">
                    <button className="btn block feel-btn" onClick={() => setEditing(latestWord)}>
                      내 느낌은 달라
                    </button>
                    <button className="btn primary block big" onClick={next} autoFocus>
                      다음
                    </button>
                  </div>
                ) : (
                  <div className={'options' + (cur.q.small ? ' small' : '') + (cur.q.type === 'self' ? ' self' : '')}>
                    {cur.q.options.map((o) => (
                      <button key={o.key} className={'opt' + (o.grade ? ' grade-' + o.grade : '')} onClick={() => answer(o)} disabled={phase !== 'ask'}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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

// '모름' → 학습 카드 (뜻, 뉘앙스 프로필, 예문)
function StudyCard({ word, ex }) {
  return (
    <div className="explain">
      <div className="verdict bad">
        <strong>모름</strong>
        <span>이 카드를 보고, 5~10문제 뒤에 다시 나와요.</span>
      </div>
      <WordDetail word={word} showExample={false} />
      {ex && (
        <div className="explain-example">
          <p className="en">
            <Sentence text={ex.en} word={word.word} />
          </p>
          {ex.ko && <p className="ko">{ex.ko}</p>}
        </div>
      )}
    </div>
  );
}

function Explanation({ q, exp, added, onAdd }) {
  if (!exp) return <p className="muted">해설 준비 중…</p>;
  const c = exp.correct;
  const answerLabel = q.options.find((o) => o.correct)?.label;
  return (
    <div className="explain">
      <div className={'verdict ' + (exp.isCorrect ? 'ok' : 'bad')}>
        <strong>{exp.isCorrect ? '정답' : '오답'}</strong>
        <span>
          정답 <b>{answerLabel}</b>
        </span>
      </div>

      <div className="why">
        <h3 className="col-label ok">왜 정답인가</h3>
        <p>{exp.why}</p>
      </div>
      {exp.whyNot && (
        <div className="why">
          <h3 className="col-label bad">내가 고른 답이 안 맞는 이유</h3>
          <p>{exp.whyNot}</p>
        </div>
      )}
      {exp.contextNote && <p className="context-note">{exp.contextNote}</p>}

      {exp.example && (
        <div className="explain-example">
          <p className="en">
            <Sentence text={exp.example.en} word={c.word} />
          </p>
          {exp.example.ko && <p className="ko">{exp.example.ko}</p>}
        </div>
      )}

      {exp.options.some((o) => o.kind !== 'choice') && (
        <div className="all-options">
          <h3 className="section-title">선지 뜻 모두 보기</h3>
          <ul>
            {exp.options.map((o) => (
              <li key={o.key} className={(o.correct ? 'is-correct' : '') + (o.chosen ? ' is-chosen' : '')}>
                <div className="opt-head">
                  <strong>{o.word || o.label}</strong>
                  {o.word && o.label !== o.word && <span className="muted">({o.label})</span>}
                  {o.correct && <span className="src-tag src-ai">정답</span>}
                  {o.chosen && !o.correct && <span className="src-tag src-mw">내 선택</span>}
                  {o.kind === 'confusable' && <span className="src-tag src-user">AI 헷갈리는 단어</span>}
                </div>
                {o.meanings && <p>{o.meanings}</p>}
                {o.note && <p className="muted">{o.note}</p>}
                {o.kind === 'confusable' &&
                  (added.has(o.word.toLowerCase()) ? (
                    <span className="hint">단어장에 추가됨</span>
                  ) : (
                    <button className="link-btn" onClick={() => onAdd(o.confusable)}>
                      + 단어장에 추가
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <WordDetail word={c} showExample={false} />
    </div>
  );
}
