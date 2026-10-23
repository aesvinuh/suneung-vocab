import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { parseBulk } from '../lib/parse.js';

const EXAMPLE = `reluctant | 꺼리는, 마지못해 하는 | 부정적. 하기 싫어서 꺼림 | He was reluctant to admit his mistake. | 그는 자기 실수를 인정하기를 꺼렸다.
vivid | 생생한, 선명한 | 긍정적. 색·기억이 또렷함`;

export default function BulkAdd() {
  const { words, addWords } = useVocab();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const parsed = useMemo(() => parseBulk(text, words), [text, words]);
  const toAdd = parsed.rows.filter((r) => !r.duplicate);

  const submit = async () => {
    await addWords(toAdd.map((r) => r.data));
    setResult({ added: toAdd.length, skipped: parsed.rows.length - toAdd.length });
    setText('');
  };

  return (
    <>
      <PageHeader title="일괄 추가" back="/" />
      <p className="hint">
        한 줄에 하나씩: <code>단어 | 뜻 | 뉘앙스 | 예문 | 예문 해석</code>
        <br />
        뜻은 쉼표로 여러 개. 뒤 칸은 비워도 됩니다. 추가로 <code>| 품사 | 유의어 | 반의어</code>까지 쓸 수 있고, 엑셀에서 복사한 탭 구분도 됩니다.
      </p>
      <textarea className="bulk-input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} spellCheck={false} />

      {result && (
        <p className="notice ok">
          {result.added}개 추가{result.skipped > 0 && `, 중복 ${result.skipped}개 건너뜀`}
        </p>
      )}

      {text.trim() && (
        <section>
          <p className="muted">
            인식 {parsed.rows.length}줄 · 추가 예정 {toAdd.length}개
            {parsed.rows.length - toAdd.length > 0 && ` · 중복 ${parsed.rows.length - toAdd.length}개`}
            {parsed.errors.length > 0 && ` · 오류 ${parsed.errors.length}줄`}
          </p>
          <ul className="list preview">
            {parsed.errors.map((e) => (
              <li key={'e' + e.line} className="list-row bad">
                <strong>{e.line}행</strong>
                <span>{e.reason}: {e.text}</span>
              </li>
            ))}
            {parsed.rows.map((r) => (
              <li key={r.line} className={'list-row' + (r.duplicate ? ' dim' : '')}>
                <strong>{r.data.word}</strong>
                <span className="muted">
                  {r.data.meanings}
                  {r.duplicate && ' (중복)'}
                </span>
              </li>
            ))}
          </ul>
          <button className="btn primary block" disabled={toAdd.length === 0} onClick={submit}>
            {toAdd.length}개 추가
          </button>
        </section>
      )}
    </>
  );
}
