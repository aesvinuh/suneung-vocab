import { useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import WordForm from '../components/WordForm.jsx';
import SenseChooser from '../components/SenseChooser.jsx';
import { sameWord } from '../lib/word.js';
import { buildDraft, choicesOf, lookup } from '../lib/autofill.js';
import { useOnline } from '../lib/useOnline.js';
import { getKeys } from '../lib/apiKeys.js';

// step: input → (loading) → choose(뜻이 여러 개일 때) → (loading) → preview → 저장 후 input
export default function AddWord() {
  const { words, addWords } = useVocab();
  const online = useOnline();
  const [step, setStep] = useState({ kind: 'input', initial: undefined });
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState([]);

  const dupOf = (text) => text.trim() && words.find((w) => sameWord(w.word, text));

  const save = async (f, sources = {}) => {
    if (dupOf(f.word)) return false;
    const [w] = await addWords([{ ...f, sources }]);
    setRecent((r) => [w, ...r].slice(0, 5));
    setStep({ kind: 'input', initial: undefined });
    setError(null);
    return true;
  };

  const startAutofill = async (word) => {
    const d = dupOf(word);
    if (d) {
      setError(`'${d.word}'는 이미 있는 단어예요. 단어 목록에서 수정하거나, 미완성이면 일괄 자동 채우기를 써 주세요.`);
      return;
    }
    setError(null);
    setStep({ kind: 'loading', msg: `'${word}' 사전 검색 중…` });
    try {
      const res = await lookup(word);
      const choices = choicesOf(res);
      if (choices.items.length > 1) setStep({ kind: 'choose', word, res, choices, selected: [choices.items[0].id] });
      else await makeDraft(word, res, [choices.items[0].id]);
    } catch (e) {
      setError(e.message);
      setStep({ kind: 'input', initial: { word } });
    }
  };

  const makeDraft = async (word, res, selected) => {
    setStep({ kind: 'loading', msg: getKeys().claude ? 'AI가 뉘앙스 메모를 정리하는 중…' : '정리하는 중…' });
    const draft = await buildDraft(word, res, selected);
    setStep({ kind: 'preview', ...draft });
  };

  const backToInput = (word) => setStep({ kind: 'input', initial: word ? { word } : undefined });

  return (
    <>
      <PageHeader title="단어 추가" back="/" right={<a href="#/bulk" className="link-btn">일괄 추가</a>} />
      {error && <p className="notice bad">{error}</p>}

      {step.kind === 'input' && (
        <>
          <WordForm
            key={step.initial?.word || 'blank'}
            initial={step.initial}
            onSubmit={(f) => save(f)}
            submitLabel="추가하고 계속"
            resetOnSubmit
            requireMeaning={false}
            autofill={{ onClick: startAutofill, disabled: !online, label: online ? '자동 채우기' : '오프라인' }}
            warn={(f) => {
              const d = dupOf(f.word);
              if (d)
                return (
                  <p className="hint warn">
                    이미 있는 단어예요. <a href={`#/words/${d.id}`}>수정하러 가기</a>
                  </p>
                );
              if (f.word.trim() && !f.meanings.trim())
                return <p className="hint">뜻 없이 추가하면 '미완성'으로 모아 두었다가 나중에 한꺼번에 자동 채우기할 수 있어요.</p>;
              return null;
            }}
          />
          {!online && <p className="hint">인터넷에 연결되면 자동 채우기를 쓸 수 있어요. 지금은 직접 입력만 가능해요.</p>}
        </>
      )}

      {step.kind === 'loading' && <p className="loading">{step.msg}</p>}

      {step.kind === 'choose' && (
        <section className="stack">
          <p className="hint">뜻이 여러 개예요. 외울 뜻을 골라 주세요. (여러 개 가능, 처음 고른 뜻이 대표 뜻)</p>
          <SenseChooser word={step.word} choices={step.choices} selected={step.selected} onChange={(selected) => setStep({ ...step, selected })} />
          <div className="sticky-actions">
            <button className="btn primary block" disabled={!step.selected.length} onClick={() => makeDraft(step.word, step.res, step.selected)}>
              고른 뜻 {step.selected.length}개로 채우기
            </button>
            <button className="link-btn" onClick={() => backToInput(step.word)}>
              취소하고 직접 입력
            </button>
          </div>
        </section>
      )}

      {step.kind === 'preview' && (
        <section>
          <p className="notice">자동으로 채운 내용이에요. 확인하고 고친 뒤 저장하세요. 고친 칸은 '직접 입력'으로 표시돼요.</p>
          {step.warnings.map((w) => (
            <p key={w} className="notice bad">
              {w}
            </p>
          ))}
          <WordForm
            initial={step.data}
            sources={step.sources}
            onSubmit={save}
            submitLabel="저장"
            defaultOpen
            requireMeaning={false}
            footer={
              <button type="button" className="link-btn" onClick={() => backToInput(step.data.word)}>
                저장하지 않고 취소
              </button>
            }
          />
        </section>
      )}

      {recent.length > 0 && step.kind === 'input' && (
        <section className="recent">
          <h2 className="section-title">방금 추가</h2>
          <ul className="list">
            {recent.map((w) => (
              <li key={w.id}>
                <a href={`#/words/${w.id}`} className="list-row">
                  <strong>{w.word}</strong>
                  <span className="muted">{w.meanings.length ? w.meanings.join(', ') : '미완성'}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
