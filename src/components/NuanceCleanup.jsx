import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import { migrateWord } from '../lib/notes.js';
import { downloadBackup } from '../lib/backup.js';

// 뉘앙스 칸에 본문 형태·반의어·숙어 등이 섞인 단어를 알맞은 칸으로 옮기기 (먼저 백업 안내)
export default function NuanceCleanup() {
  const { words, daily, saveWord } = useVocab();
  const targets = useMemo(() => words.map((w) => ({ before: w, after: migrateWord(w) })).filter((x) => x.after), [words]);
  const [backedUp, setBackedUp] = useState(false);
  const [done, setDone] = useState(null);
  const [open, setOpen] = useState(false);

  if (!targets.length) return done ? <p className="notice ok">{done}개 단어를 정리했어요. 이제 뉘앙스 문제에 이상한 보기가 나오지 않아요.</p> : null;

  const run = async () => {
    if (!backedUp && !confirm('백업 없이 정리할까요? (되돌리려면 백업 파일이 필요해요)')) return;
    for (const t of targets) await saveWord(t.after);
    setDone(targets.length);
  };

  const show = (label, v) => (Array.isArray(v) ? v.length : v) ? <div><dt>{label}</dt><dd>{Array.isArray(v) ? v.join(', ') : v}</dd></div> : null;

  return (
    <section className="card warn-card">
      <h2 className="section-title">데이터 정리 필요 · {targets.length}개 단어</h2>
      <p className="hint">
        뉘앙스 메모 칸에 본문 형태·반의어·숙어 같은 다른 정보가 섞여 있어요. 그래서 뉘앙스 고르기 문제에 '본문 형태: ○○' 같은 보기가 나왔어요.
        정리하면 각 정보를 본문 형태 / 관련 표현·숙어 / 반의어·유의어 / 기타 메모 칸으로 옮겨요.
      </p>
      <ol className="help">
        <li>
          먼저 백업:{' '}
          <button className="link-btn inline" onClick={() => { downloadBackup(words, daily); setBackedUp(true); }}>
            JSON 백업 받기
          </button>
          {backedUp && ' ✓'}
        </li>
        <li>아래에서 바뀔 내용을 확인한 뒤 '정리하기'</li>
      </ol>
      <button className="link-btn" onClick={() => setOpen((v) => !v)}>
        {open ? '바뀔 내용 닫기' : '바뀔 내용 보기'}
      </button>
      {open && (
        <div className="stack">
          {targets.map(({ before, after }) => (
            <div key={before.id} className="review-card">
              <div className="review-head">
                <strong className="detail-word">{before.word}</strong>
              </div>
              <dl className="filled">
                {show('지금 뉘앙스 칸', before.nuance)}
                {show('→ 남는 뉘앙스', after.nuance || '(비어 있게 됨)')}
                {after.form !== before.form && show('→ 본문 형태', after.form)}
                {after.related !== before.related && show('→ 관련 표현', after.related)}
                {after.antonyms.length !== before.antonyms.length && show('→ 반의어', after.antonyms)}
                {after.synonyms.length !== before.synonyms.length && show('→ 유의어', after.synonyms)}
                {after.memo !== before.memo && show('→ 기타 메모', after.memo)}
              </dl>
            </div>
          ))}
        </div>
      )}
      <button className="btn primary block" onClick={run}>
        {targets.length}개 단어 정리하기
      </button>
    </section>
  );
}
