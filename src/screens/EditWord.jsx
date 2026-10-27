import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import WordForm from '../components/WordForm.jsx';
import { goBack } from '../lib/router.js';
import { formatDate, sameWord } from '../lib/word.js';
import { weightParts } from '../lib/weights.js';
import ProfileEditor from '../components/ProfileEditor.jsx';
import { profileSummary } from '../lib/profile.js';

export default function EditWord({ id }) {
  const { words, saveWord, deleteWord } = useVocab();
  const word = words.find((w) => w.id === id);
  if (!word) return <><PageHeader title="단어" back="/words" /><p className="empty">삭제되었거나 없는 단어예요.</p></>;

  const submit = async (f, sources) => {
    if (words.some((w) => w.id !== id && sameWord(w.word, f.word))) {
      alert('같은 단어가 이미 있어요.');
      return false;
    }
    await saveWord({ ...word, ...f, sources: { ...word.sources, ...sources } });
    goBack('/words');
  };

  const remove = async () => {
    if (!confirm(`'${word.word}'를 삭제할까요? 학습 기록도 함께 지워집니다.`)) return;
    await deleteWord(id);
    goBack('/words');
  };

  const s = word.stats;
  const wp = weightParts(word);
  return (
    <>
      <PageHeader title="단어 수정" back="/words" />
      <WordForm key={word.id} initial={word} sources={word.sources} onSubmit={submit} submitLabel="저장" defaultOpen requireMeaning={false} />
      <section className="card">
        <h2 className="section-title">
          뉘앙스 프로필 {word.profile?.confirmed ? '· 확정됨' : '· 미확정'}
        </h2>
        {word.profile?.confirmed && <p className="hint">{profileSummary(word.profile)}</p>}
        <ProfileEditor key={word.updatedAt} word={word} onSave={(w) => saveWord(w)} saveLabel={word.profile?.confirmed ? '고쳐서 확정' : '확정'} />
      </section>
      <section className="meta-box">
        <p>
          추가 {new Date(word.createdAt).toLocaleDateString()} · 출제 {s.shown} · 정답 {s.correct} · 오답 {s.wrong}
          {word.readd.count > 0 && ` · 다시 넣음 ${word.readd.count}회`}
          {word.illusion.count > 0 && ` · 착각 ${word.illusion.count}회`}
          {word.ai.generatedAt ? ` · AI 예문 ${word.ai.examples.length}개·헷갈리는 단어 ${word.ai.confusables.length}개` : ''}
        </p>
        <p>
          마지막 출제 {s.lastShownAt ? new Date(s.lastShownAt).toLocaleString() : '-'} · 마지막 오답 {formatDate(s.lastWrongAt)}
        </p>
        <p>
          오답 노트: {word.note.inNote ? `등록됨 (연속 정답 ${word.note.streak})` : word.note.graduatedAt ? `졸업 ${formatDate(word.note.graduatedAt)}` : '-'}
        </p>
        <p className="muted">
          현재 출제 가중치 {wp.total.toFixed(2)} = 최근추가 {wp.recency.toFixed(1)} + 오답률 {wp.error.toFixed(1)} + 경과 {wp.staleness.toFixed(1)}
          {wp.readd > 0 && ` + 다시 넣음 ${wp.readd.toFixed(1)}`}
          {wp.illusion > 0 && ` + 착각 ${wp.illusion.toFixed(1)}`}
        </p>
      </section>
      <button className="btn danger block" onClick={remove}>
        삭제
      </button>
    </>
  );
}
