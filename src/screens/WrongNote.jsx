import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import WordDetail from '../components/WordDetail.jsx';
import { errorRate, formatDate } from '../lib/word.js';
import { GRADUATION } from '../lib/weights.js';
import { navigate } from '../lib/router.js';

const SORTS = {
  count: { label: '틀린 횟수', fn: (a, b) => b.stats.wrong - a.stats.wrong || errorRate(b) - errorRate(a) },
  rate: { label: '오답률', fn: (a, b) => errorRate(b) - errorRate(a) || b.stats.wrong - a.stats.wrong },
  recent: { label: '최근에 틀린 순', fn: (a, b) => (b.stats.lastWrongAt || 0) - (a.stats.lastWrongAt || 0) },
};

export default function WrongNote() {
  const { words } = useVocab();
  const [tab, setTab] = useState('active');
  const [sort, setSort] = useState('count');
  const [openId, setOpenId] = useState(null);

  const active = useMemo(() => words.filter((w) => w.note.inNote), [words]);
  const graduated = useMemo(() => words.filter((w) => !w.note.inNote && w.note.graduatedAt), [words]);
  const list = useMemo(() => {
    const base = tab === 'active' ? active : graduated;
    const fn = tab === 'active' ? SORTS[sort].fn : (a, b) => b.note.graduatedAt - a.note.graduatedAt;
    return [...base].sort(fn);
  }, [tab, sort, active, graduated]);
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);

  return (
    <>
      <PageHeader title="오답 노트" />
      <div className="seg">
        <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>
          학습 중 {active.length}
        </button>
        <button className={tab === 'grad' ? 'on' : ''} onClick={() => setTab('grad')}>
          졸업 {graduated.length}
        </button>
      </div>

      {tab === 'active' && (
        <>
          <button className="btn primary block" disabled={active.length === 0} onClick={() => navigate('/study?mode=note')}>
            오답 노트 학습
          </button>
          <p className="hint">노트 학습에서 연속 {GRADUATION.streak}번 맞히면 졸업. 다시 틀리면 자동 재등록.</p>
          <div className="sort-row">
            {Object.entries(SORTS).map(([k, s]) => (
              <button key={k} className={'sort' + (sort === k ? ' on' : '')} onClick={() => setSort(k)}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      {list.length === 0 ? (
        <p className="empty">{tab === 'active' ? '틀린 단어가 없어요. 학습하면서 틀린 단어가 자동으로 모입니다.' : '아직 졸업한 단어가 없어요.'}</p>
      ) : (
        <ul className="list">
          {list.map((w) => {
            const open = openId === w.id;
            const confused = Object.entries(w.note.confusedWith)
              .map(([id, n]) => [byId.get(id), n])
              .filter(([x]) => x)
              .sort((a, b) => b[1] - a[1]);
            return (
              <li key={w.id} className={open ? 'open' : ''}>
                <button className="list-row" onClick={() => setOpenId(open ? null : w.id)} aria-expanded={open}>
                  <div className="row-main">
                    <strong>{w.word}</strong>
                    <span className="muted ellipsis">{w.meanings.join(', ')}</span>
                  </div>
                  <span className="row-meta">
                    틀림 {w.stats.wrong} · 오답률 {Math.round(errorRate(w) * 100)}% · 마지막 오답 {formatDate(w.stats.lastWrongAt)}
                    {tab === 'active' && w.note.streak > 0 && ` · 연속 ${w.note.streak}/${GRADUATION.streak}`}
                    {tab === 'grad' && ` · 졸업 ${formatDate(w.note.graduatedAt)}`}
                  </span>
                </button>
                {open && (
                  <WordDetail word={w}>
                    <div className="confused">
                      <h3>헷갈렸던 단어</h3>
                      {confused.length === 0 ? (
                        <p className="muted">기록 없음 (자기평가·뉘앙스 문제에서 틀린 경우)</p>
                      ) : (
                        <ul>
                          {confused.map(([x, n]) => (
                            <li key={x.id}>
                              <a href={`#/words/${x.id}`}>
                                <strong>{x.word}</strong> <span className="muted">{x.meanings.join(', ')}</span>
                              </a>
                              <span className="count">{n}회</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <a className="link-btn" href={`#/words/${w.id}`}>
                      수정하기 →
                    </a>
                  </WordDetail>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
