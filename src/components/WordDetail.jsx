import { findTarget, stripMarkers } from '../lib/inflect.js';
import { effectiveTone, POS_LABEL, TONE_LABEL } from '../lib/word.js';

export function Sentence({ text, word, mode = 'bold' }) {
  const t = findTarget(text, word);
  if (!t) return <>{stripMarkers(text)}</>;
  return (
    <>
      {t.before}
      <span className={mode === 'blank' ? 'blank' : mode === 'underline' ? 'underline' : 'em'}>{mode === 'blank' ? ' '.repeat(8) : t.target}</span>
      {t.after}
    </>
  );
}

export function ToneTag({ word }) {
  const tone = effectiveTone(word);
  if (!tone) return null;
  return <span className={'tone tone-' + tone}>{TONE_LABEL[tone]}</span>;
}

// 단어 정보 카드. compact=true면 해설 비교용(예문 생략 가능)
export default function WordDetail({ word, showExample = true, children }) {
  return (
    <div className="detail">
      <div className="detail-head">
        <strong className="detail-word">{word.word}</strong>
        {word.pos && <span className="pos">{POS_LABEL[word.pos] || word.pos}</span>}
        <ToneTag word={word} />
      </div>
      <p className="detail-meaning">{word.meanings.join(', ')}</p>
      {word.nuance && <p className="detail-nuance">{word.nuance}</p>}
      {showExample && word.example && (
        <div className="detail-example">
          <p className="en">
            <Sentence text={word.example} word={word.word} />
          </p>
          {word.exampleKo && <p className="ko">{word.exampleKo}</p>}
        </div>
      )}
      {(word.synonyms.length > 0 || word.antonyms.length > 0) && (
        <p className="detail-rel">
          {word.synonyms.length > 0 && (
            <span>
              <b>유</b> {word.synonyms.join(', ')}
            </span>
          )}
          {word.antonyms.length > 0 && (
            <span>
              <b>반</b> {word.antonyms.join(', ')}
            </span>
          )}
        </p>
      )}
      {children}
    </div>
  );
}
