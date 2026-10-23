import SourceTag from './SourceTag.jsx';

// 사전 뜻 목록에서 외울 뜻 고르기 (여러 개 선택 가능, 첫 번째로 고른 뜻이 대표)
export default function SenseChooser({ word, dict, selected, onChange }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="senses">
      <div className="senses-head">
        <strong className="detail-word">{word}</strong>
        <SourceTag source={dict.source} />
      </div>
      <ul className="sense-list">
        {dict.senses.map((s) => {
          const on = selected.includes(s.id);
          return (
            <li key={s.id}>
              <button type="button" className={'sense' + (on ? ' on' : '')} onClick={() => toggle(s.id)} aria-pressed={on}>
                <span className="sense-check">{on ? '✓' : ''}</span>
                <span className="sense-body">
                  {s.pos && <span className="pos">{s.pos}</span>} {s.definition}
                  {s.examples[0] && <em className="sense-ex">{s.examples[0]}</em>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
