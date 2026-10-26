import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SenseChooser from '../components/SenseChooser.jsx';
import SourceTag from '../components/SourceTag.jsx';
import WordForm from '../components/WordForm.jsx';
import { isIncomplete, POS_LABEL, TONE_LABEL } from '../lib/word.js';
import { buildDraft, choicesOf, lookup, mergeMissing } from '../lib/autofill.js';
import { getKeys } from '../lib/apiKeys.js';
import { useOnline } from '../lib/useOnline.js';

const MAX_PER_RUN = 20;
const FIELD_LABEL = {
  meanings: '뜻', pos: '품사', tone: '감정 톤', nuance: '뉘앙스', definition: '영영 뜻',
  example: '예문', exampleKo: '예문 해석', synonyms: '유의어', antonyms: '반의어',
};

// '미완성 단어 일괄 자동 채우기'
// select → fetching → choose(뜻 고르기) → generating → review(미리보기·수정) → 저장
export default function AutoFillBatch() {
  const { words, saveWord } = useVocab();
  const online = useOnline();
  const incomplete = useMemo(() => words.filter(isIncomplete).sort((a, b) => b.createdAt - a.createdAt), [words]);
  const [phase, setPhase] = useState('select');
  const [picked, setPicked] = useState(() => new Set(incomplete.slice(0, MAX_PER_RUN).map((w) => w.id)));
  const [items, setItems] = useState([]); // { id, word, res?, choices?, error?, selected[], result?, include, saved, editing }
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const hasClaude = !!getKeys().claude;

  const update = (id, patch) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const togglePick = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < MAX_PER_RUN) n.add(id);
      return n;
    });

  const runLookup = async () => {
    const targets = incomplete.filter((w) => picked.has(w.id));
    setPhase('fetching');
    setProgress({ done: 0, total: targets.length });
    const out = [];
    for (const w of targets) {
      try {
        const res = await lookup(w.word);
        const choices = choicesOf(res);
        out.push({ id: w.id, word: w.word, res, choices, selected: [choices.items[0].id] });
      } catch (e) {
        out.push({ id: w.id, word: w.word, error: e.message, selected: [] });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setItems(out);
    if (out.some((it) => it.choices && it.choices.items.length > 1)) setPhase('choose');
    else runGenerate(out);
  };

  const runGenerate = async (list) => {
    const todo = list.filter((it) => it.res && it.selected.length);
    setPhase('generating');
    setProgress({ done: 0, total: todo.length });
    const results = new Map();
    // 2개씩 동시에 처리
    const queue = [...todo];
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        const draft = await buildDraft(it.word, it.res, it.selected);
        const current = words.find((w) => w.id === it.id);
        results.set(it.id, { draft, ...mergeMissing(current, draft) });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all([worker(), worker()]);
    setItems(list.map((it) => {
      const r = results.get(it.id);
      return r ? { ...it, result: r, include: r.filled.length > 0 } : it;
    }));
    setPhase('review');
  };

  const saveIncluded = async () => {
    for (const it of items) if (it.result && it.include && !it.saved) await saveWord(it.result.word);
    setItems((list) => list.map((it) => (it.result && it.include ? { ...it, saved: true } : it)));
    setPhase('done');
  };

  const includedCount = items.filter((it) => it.result && it.include && !it.saved).length;

  return (
    <>
      <PageHeader title="미완성 자동 채우기" back="/words" />

      {phase === 'select' && (
        <>
          <p className="hint">
            뜻·뉘앙스·예문 중 비어 있는 칸만 채워요. 직접 쓴 내용은 덮어쓰지 않아요. 한 번에 최대 {MAX_PER_RUN}개.
          </p>
          {!hasClaude && <p className="notice bad">Claude API 키가 없어 영영 뜻·예문·유의어만 채워져요. 한국어 뜻·뉘앙스까지 채우려면 설정에서 키를 넣어 주세요.</p>}
          {!online && <p className="notice bad">오프라인이에요. 인터넷에 연결되면 쓸 수 있어요.</p>}
          {incomplete.length === 0 ? (
            <p className="empty">미완성 단어가 없어요.</p>
          ) : (
            <>
              <ul className="list">
                {incomplete.map((w) => (
                  <li key={w.id}>
                    <button className="list-row check-row" onClick={() => togglePick(w.id)} aria-pressed={picked.has(w.id)}>
                      <span className="sense-check">{picked.has(w.id) ? '✓' : ''}</span>
                      <span className="row-main">
                        <strong>{w.word}</strong>
                        <span className="muted ellipsis">
                          {[!w.meanings.length && '뜻', !w.nuance && '뉘앙스', !w.example && '예문'].filter(Boolean).join('·')} 없음
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="sticky-actions">
                <button className="btn primary block" disabled={!online || picked.size === 0} onClick={runLookup}>
                  {picked.size}개 자동 채우기
                </button>
              </div>
            </>
          )}
        </>
      )}

      {(phase === 'fetching' || phase === 'generating') && (
        <p className="loading">
          {phase === 'fetching' ? '사전 검색·뜻 정리 중' : 'AI가 한국어 해설 작성 중'} {progress.done}/{progress.total}
        </p>
      )}

      {phase === 'choose' && (
        <section className="stack">
          <p className="hint">뜻이 여러 개인 단어는 외울 뜻을 골라 주세요. 기본으로 첫 번째 뜻이 골라져 있어요.</p>
          {items.map((it) =>
            it.error ? (
              <p key={it.id} className="notice bad">
                <b>{it.word}</b>: {it.error}
              </p>
            ) : it.choices.items.length > 1 ? (
              <SenseChooser key={it.id} word={it.word} choices={it.choices} selected={it.selected} onChange={(selected) => update(it.id, { selected })} />
            ) : null,
          )}
          <div className="sticky-actions">
            <button className="btn primary block" onClick={() => runGenerate(items)}>
              다음: {hasClaude ? 'AI로 한국어 해설 채우기' : '미리보기'}
            </button>
          </div>
        </section>
      )}

      {phase === 'review' && (
        <section className="stack">
          <p className="notice">아직 저장되지 않았어요. 확인하고 저장할 단어를 고르세요. 바로 고치려면 '수정'을 누르세요.</p>
          {items.map((it) => (
            <ReviewCard
              key={it.id}
              item={it}
              onToggle={() => update(it.id, { include: !it.include })}
              onEdit={() => update(it.id, { editing: !it.editing })}
              onSaveEdited={async (f, sources) => {
                await saveWord({ ...it.result.word, ...f, sources: { ...it.result.word.sources, ...sources } });
                update(it.id, { saved: true, editing: false, include: false });
              }}
            />
          ))}
          <div className="sticky-actions">
            <button className="btn primary block" disabled={includedCount === 0} onClick={saveIncluded}>
              선택한 {includedCount}개 저장
            </button>
          </div>
        </section>
      )}

      {phase === 'done' && (
        <section className="stack">
          <p className="notice ok">저장했어요. 단어 {items.filter((it) => it.saved).length}개가 채워졌어요.</p>
          <a className="btn block" href="#/words">
            단어 목록으로
          </a>
        </section>
      )}
    </>
  );
}

function ReviewCard({ item, onToggle, onEdit, onSaveEdited }) {
  if (item.error) {
    return (
      <div className="review-card failed">
        <strong>{item.word}</strong>
        <p className="hint warn">{item.error}</p>
      </div>
    );
  }
  if (!item.result) return null;
  const { word, filled, draft } = item.result;
  return (
    <div className={'review-card' + (item.saved ? ' saved' : '')}>
      <div className="review-head">
        {!item.saved && (
          <button className="sense-check" onClick={onToggle} aria-pressed={item.include} aria-label="저장에 포함">
            {item.include ? '✓' : ''}
          </button>
        )}
        <strong className="detail-word">{word.word}</strong>
        {item.saved ? <span className="src-tag src-user">저장됨</span> : <button className="link-btn" onClick={onEdit}>{item.editing ? '닫기' : '수정'}</button>}
      </div>
      {draft.warnings.map((w) => (
        <p key={w} className="hint warn">
          {w}
        </p>
      ))}
      {filled.length === 0 && <p className="hint">새로 채운 칸이 없어요.</p>}
      {!item.editing && (
        <dl className="filled">
          {filled.map((f) => (
            <div key={f}>
              <dt>
                {FIELD_LABEL[f]} <SourceTag source={word.sources[f]} />
              </dt>
              <dd>{Array.isArray(word[f]) ? word[f].join(', ') : f === 'tone' ? TONE_LABEL[word[f]] : f === 'pos' ? POS_LABEL[word[f]] || word[f] : word[f]}</dd>
            </div>
          ))}
        </dl>
      )}
      {item.editing && !item.saved && (
        <WordForm initial={word} sources={word.sources} onSubmit={onSaveEdited} submitLabel="이 단어 저장" defaultOpen requireMeaning={false} />
      )}
    </div>
  );
}
