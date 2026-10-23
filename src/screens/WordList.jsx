import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ToneTag } from '../components/WordDetail.jsx';
import { errorRate, isIncomplete } from '../lib/word.js';

const FILTERS = [
  { key: 'all', label: '전체', fn: () => true },
  { key: 'incomplete', label: '미완성', fn: isIncomplete },
  { key: 'noExample', label: '예문 없음', fn: (w) => !w.example },
  { key: 'noNuance', label: '뉘앙스 없음', fn: (w) => !w.nuance },
  { key: 'noSyn', label: '유의어 없음', fn: (w) => w.synonyms.length === 0 },
];
const SORTS = {
  recent: { label: '최근 추가', fn: (a, b) => b.createdAt - a.createdAt },
  abc: { label: 'ABC', fn: (a, b) => a.word.localeCompare(b.word) },
  wrong: { label: '오답률', fn: (a, b) => errorRate(b) - errorRate(a) },
};
const PAGE = 100;

export default function WordList() {
  const { words } = useVocab();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = FILTERS.find((x) => x.key === filter).fn;
    return words
      .filter(f)
      .filter(
        (w) =>
          !needle ||
          w.word.toLowerCase().includes(needle) ||
          w.meanings.some((m) => m.includes(needle)) ||
          w.nuance.toLowerCase().includes(needle) ||
          w.synonyms.some((s) => s.toLowerCase().includes(needle)),
      )
      .sort(SORTS[sort].fn);
  }, [words, q, filter, sort]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((x) => [x.key, words.filter(x.fn).length])), [words]);

  return (
    <>
      <PageHeader title={`단어 ${words.length}`} right={<a href="#/add" className="btn small primary">+ 추가</a>} />
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="단어 · 뜻 · 뉘앙스 검색" autoCapitalize="none" />
      <div className="chips scroll">
        {FILTERS.map((x) => (
          <button key={x.key} className={'chip' + (filter === x.key ? ' on' : '')} onClick={() => setFilter(x.key)}>
            {x.label} {counts[x.key]}
          </button>
        ))}
      </div>
      {counts.incomplete > 0 && (
        <a className="link-btn" href="#/autofill">
          미완성 {counts.incomplete}개 일괄 자동 채우기 →
        </a>
      )}
      <div className="sort-row">
        {Object.entries(SORTS).map(([k, s]) => (
          <button key={k} className={'sort' + (sort === k ? ' on' : '')} onClick={() => setSort(k)}>
            {s.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="empty">{words.length === 0 ? '아직 단어가 없어요.' : '조건에 맞는 단어가 없어요.'}</p>
      ) : (
        <ul className="list">
          {list.slice(0, limit).map((w) => (
            <li key={w.id}>
              <a href={`#/words/${w.id}`} className="list-row">
                <div className="row-main">
                  <strong>{w.word}</strong>
                  <ToneTag word={w} />
                  {w.note.inNote && <span className="tag-note">오답</span>}
                </div>
                <span className="muted ellipsis">{w.meanings.length ? w.meanings.join(', ') : '뜻 없음 (출제 안 됨)'}</span>
                <span className="row-meta">
                  {w.stats.shown > 0 ? `${w.stats.correct}/${w.stats.shown}` : '새 단어'}
                  {!w.example && ' · 예문 없음'}
                  {!w.nuance && ' · 뉘앙스 없음'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {list.length > limit && (
        <button className="btn block" onClick={() => setLimit((l) => l + PAGE)}>
          더 보기 ({list.length - limit})
        </button>
      )}
    </>
  );
}
