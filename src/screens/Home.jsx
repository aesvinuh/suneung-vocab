import { useVocab } from '../store/VocabContext.jsx';
import { hasMeaning, isIncomplete, todayKey } from '../lib/word.js';
import { SAMPLE_WORDS } from '../data/sampleWords.js';
import { navigate } from '../lib/router.js';

export default function Home() {
  const { words, daily, addWords, sync } = useVocab();
  const today = daily[todayKey()] || { answered: 0, correct: 0 };
  const rate = today.answered ? Math.round((today.correct / today.answered) * 100) : null;
  const noteCount = words.filter((w) => w.note.inNote).length;
  const studyable = words.filter(hasMeaning).length;
  const incomplete = words.filter(isIncomplete).length;

  return (
    <div className="home">
      <header className="home-head">
        <h1>수능 단어</h1>
        <p className="muted">보는 순간 뜻과 뉘앙스가 떠오르게</p>
        {sync.state !== 'off' && (
          <a href="#/settings" className={'sync-pill' + (sync.state === 'error' ? ' bad' : '')}>
            {sync.state === 'syncing' ? '동기화 중…' : sync.state === 'error' ? '동기화 문제 있음' : sync.state === 'ok' ? '동기화됨' : '동기화 대기'}
          </a>
        )}
      </header>

      <section className="stats">
        <div className="stat">
          <span>오늘 푼 문제</span>
          <strong>{today.answered}</strong>
        </div>
        <div className="stat">
          <span>오늘 정답률</span>
          <strong>{rate === null ? '-' : rate + '%'}</strong>
        </div>
        <div className="stat">
          <span>전체 단어</span>
          <strong>{words.length}</strong>
        </div>
        <a className="stat link" href="#/note">
          <span>오답 노트</span>
          <strong>{noteCount}</strong>
        </a>
      </section>

      {words.length === 0 && (
        <section className="empty-box">
          <p>아직 단어가 없어요. 직접 추가하거나 샘플 15개로 시작해 보세요.</p>
          <button className="btn block" onClick={() => addWords(SAMPLE_WORDS)}>
            샘플 단어 15개 넣기
          </button>
        </section>
      )}

      <div className="home-actions">
        <button className="btn primary block big" disabled={studyable === 0} onClick={() => navigate('/study')}>
          학습 시작
        </button>
        <button className="btn block big" disabled={noteCount === 0} onClick={() => navigate('/study?mode=note')}>
          오답 노트 학습 {noteCount > 0 && <span className="count">{noteCount}</span>}
        </button>
        <div className="row-2">
          <a className="btn block" href="#/add">
            + 단어 추가
          </a>
          <a className="btn block" href="#/bulk">
            일괄 추가
          </a>
        </div>
        {incomplete > 0 && (
          <a className="link-btn" href="#/autofill">
            미완성 단어 {incomplete}개 자동 채우기 →
          </a>
        )}
      </div>
    </div>
  );
}
