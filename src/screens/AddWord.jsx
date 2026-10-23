import { useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import WordForm from '../components/WordForm.jsx';
import { sameWord } from '../lib/word.js';

export default function AddWord() {
  const { words, addWords } = useVocab();
  const [recent, setRecent] = useState([]);

  const dupOf = (text) => text.trim() && words.find((w) => sameWord(w.word, text));

  const submit = async (f) => {
    if (dupOf(f.word)) return false;
    const [w] = await addWords([f]);
    setRecent((r) => [w, ...r].slice(0, 5));
    return true;
  };

  return (
    <>
      <PageHeader title="단어 추가" back="/" right={<a href="#/bulk" className="link-btn">일괄 추가</a>} />
      <WordForm
        onSubmit={submit}
        submitLabel="추가하고 계속"
        resetOnSubmit
        warn={(f) => {
          const d = dupOf(f.word);
          return (
            d && (
              <p className="hint warn">
                이미 있는 단어예요. <a href={`#/words/${d.id}`}>수정하러 가기</a>
              </p>
            )
          );
        }}
      />
      {recent.length > 0 && (
        <section className="recent">
          <h2 className="section-title">방금 추가</h2>
          <ul className="list">
            {recent.map((w) => (
              <li key={w.id}>
                <a href={`#/words/${w.id}`} className="list-row">
                  <strong>{w.word}</strong>
                  <span className="muted">{w.meanings.join(', ')}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
