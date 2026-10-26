import SourceTag from './SourceTag.jsx';

// 사전 뜻 목록에서 외울 뜻 고르기 (여러 개 선택 가능, 첫 번째로 고른 뜻이 대표)
// choices: autofill.choicesOf() 결과 { source, items: [{ id, pos, text(한국어 뜻 또는 영영 뜻풀이), sub?, ko, refs? }] }
export default function SenseChooser({ word, choices, selected, onChange }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="senses">
      <div className="senses-head">
        <strong className="detail-word">{word}</strong>
        <SourceTag source={choices.source} />
      </div>
      <ul className="sense-list">
        {choices.items.map((c) => {
          const on = selected.includes(c.id);
          return (
            <li key={c.id}>
              <button type="button" className={'sense' + (on ? ' on' : '')} onClick={() => toggle(c.id)} aria-pressed={on}>
                <span className="sense-check">{on ? '✓' : ''}</span>
                <span className={'sense-body' + (c.ko ? ' ko' : '')}>
                  {c.pos && <span className="pos">{c.pos}</span>} {c.text}
                  {c.sub && <em className="sense-ex">{c.sub}</em>}
                  {c.refs?.length > 0 && <span className="sense-refs">근거: {c.refs.join(' · ')}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
