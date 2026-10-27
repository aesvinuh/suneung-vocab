import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProfileEditor from '../components/ProfileEditor.jsx';
import { needsConfirm, profileSummary } from '../lib/profile.js';
import { getKeys } from '../lib/apiKeys.js';

// 미확정 뉘앙스 프로필을 한 번에 몰아서 확인·확정
export default function ProfileReview() {
  const { words, saveWord, pool, fillPoolsNow } = useVocab();
  const todo = useMemo(() => words.filter(needsConfirm).sort((a, b) => (b.profile?.suggested ? 1 : 0) - (a.profile?.suggested ? 1 : 0)), [words]);
  const [openId, setOpenId] = useState(null);
  const [confirmed, setConfirmed] = useState(0);
  const withSuggestion = todo.filter((w) => w.profile?.suggested).length;
  const hasKey = !!getKeys().claude;

  const confirmAs = async (w) => {
    await saveWord(w);
    setConfirmed((n) => n + 1);
    setOpenId(null);
  };
  const quickConfirm = (w) =>
    confirmAs({ ...w, profile: { ...w.profile, ...w.profile.suggested, suggested: w.profile.suggested, confirmed: true, confirmedAt: Date.now() } });

  return (
    <>
      <PageHeader title={`프로필 확인 ${todo.length}`} back="/" />
      <p className="hint">
        뉘앙스 문제는 확정된 프로필로만 나와요. AI 초안이 맞으면 '그대로 확정', 다르면 '고치기'를 누르세요.
      </p>
      {confirmed > 0 && <p className="notice ok">{confirmed}개 확정했어요.</p>}
      {hasKey && todo.length > withSuggestion && (
        <button className="btn block" disabled={pool.running} onClick={() => fillPoolsNow({ ids: todo.filter((w) => !w.profile?.suggested).map((w) => w.id) })}>
          {pool.running ? `AI 초안 만드는 중 ${pool.done}/${pool.total}` : `초안 없는 ${todo.length - withSuggestion}개 AI 초안 받기`}
        </button>
      )}
      {todo.length === 0 ? (
        <p className="empty">확인할 프로필이 없어요.</p>
      ) : (
        <ul className="list">
          {todo.map((w) => (
            <li key={w.id} className={openId === w.id ? 'open' : ''}>
              <div className="list-row">
                <div className="row-main">
                  <strong>{w.word}</strong>
                  <span className="muted ellipsis">{w.meanings.join(', ')}</span>
                </div>
                <span className="row-meta">{w.profile?.suggested ? `AI 초안: ${profileSummary(w.profile.suggested)}` : '초안 없음 — 직접 고르기'}</span>
                <div className="row-actions">
                  {w.profile?.suggested && openId !== w.id && (
                    <button className="btn small primary" onClick={() => quickConfirm(w)}>
                      그대로 확정
                    </button>
                  )}
                  <button className="btn small" onClick={() => setOpenId(openId === w.id ? null : w.id)}>
                    {openId === w.id ? '닫기' : w.profile?.suggested ? '고치기' : '직접 고르기'}
                  </button>
                </div>
              </div>
              {openId === w.id && (
                <div className="detail">
                  <ProfileEditor word={w} onSave={confirmAs} onCancel={() => setOpenId(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
