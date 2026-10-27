import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import { planCleanup, needsDataUpdate } from '../lib/migrate.js';
import { needsMigration } from '../lib/notes.js';
import { DIRECTION_LABEL } from '../lib/profile.js';
import { downloadBackup } from '../lib/backup.js';

// 예전 데이터 정리 (먼저 백업 안내)
//  · 뉘앙스 칸에 섞인 본문 형태·반의어·숙어 → 알맞은 칸
//  · 뉘앙스 프로필 구조로 변환 (예전 뉘앙스 메모는 '느낌 메모'로 보존, 감정 톤 → 평가 방향 초기값, 미확정)
export default function NuanceCleanup() {
  const { words, daily, saveWord } = useVocab();
  const targets = useMemo(() => words.map((w) => ({ before: w, after: planCleanup(w) })).filter((x) => x.after), [words]);
  const mixed = targets.filter((t) => needsMigration(t.before)).length;
  const old = targets.filter((t) => needsDataUpdate(t.before)).length;
  const [backedUp, setBackedUp] = useState(false);
  const [done, setDone] = useState(null);
  const [open, setOpen] = useState(false);

  if (!targets.length)
    return done ? (
      <p className="notice ok">
        {done}개 단어를 정리했어요. 뉘앙스 프로필은 홈의 '프로필 미확정 → 한 번에 확인하기'에서 확정하면 뉘앙스 문제에 나와요.
      </p>
    ) : null;

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
        {mixed > 0 && `뉘앙스 칸에 본문 형태·반의어·숙어가 섞인 단어 ${mixed}개는 각 정보를 본문 형태 / 관련 표현·숙어 / 반의어·유의어 / 기타 메모 칸으로 옮겨요. `}
        {old > 0 && `예전 형식 단어 ${old}개는 새 '뉘앙스 프로필' 구조로 바꿔요. 예전 뉘앙스 메모는 지우지 않고 '느낌 메모'로 그대로 두고, 감정 톤(긍정/부정/중립)은 평가 방향의 초기값으로 옮겨요(미확정).`}
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
                {needsMigration(before) && show('지금 뉘앙스 칸', before.nuance)}
                {needsMigration(before) && show('→ 남는 느낌 메모', after.nuance || '(비어 있게 됨)')}
                {after.form !== before.form && show('→ 본문 형태', after.form)}
                {after.related !== before.related && show('→ 관련 표현', after.related)}
                {after.antonyms.length !== before.antonyms.length && show('→ 반의어', after.antonyms)}
                {after.synonyms.length !== before.synonyms.length && show('→ 유의어', after.synonyms)}
                {after.memo !== before.memo && show('→ 기타 메모', after.memo)}
                {!before.profile && show('→ 뉘앙스 프로필', `새로 만듦 (미확정)${after.profile.direction ? ` · 평가 방향 ${DIRECTION_LABEL[after.profile.direction]}` : ''}`)}
                {!before.profile && before.nuance && show('→ 느낌 메모 (그대로 보존)', before.nuance)}
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
