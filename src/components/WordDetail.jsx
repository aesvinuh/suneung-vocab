import { findTarget, stripMarkers } from '../lib/inflect.js';
import { effectiveTone, POS_LABEL, TONE_LABEL } from '../lib/word.js';
import { DIRECTION_LABEL, isFilled, profileSummary } from '../lib/profile.js';

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

// 평가 방향 표시: 프로필이 있으면 프로필(미확정이면 흐리게), 없으면 예전 감정 톤
export function ToneTag({ word }) {
  const p = word.profile;
  if (isFilled(p)) {
    const cls = { positive: 'positive', negative: 'negative' }[p.direction] || 'neutral';
    return <span className={'tone tone-' + cls + (p.confirmed ? '' : ' unconfirmed')}>{DIRECTION_LABEL[p.direction]}{p.confirmed ? '' : '?'}</span>;
  }
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
      {isFilled(word.profile) && (
        <div className="detail-profile">
          <p>
            <b>뉘앙스 프로필{word.profile.confirmed ? '' : ' (미확정)'}</b> {profileSummary(word.profile)}
          </p>
          {word.profile.diff && <p className="muted">유사어와의 차이 · {word.profile.diff}</p>}
        </div>
      )}
      {word.nuance && <p className="detail-nuance">{word.nuance}</p>}
      {word.definition && <p className="detail-def">{word.definition}</p>}
      {word.related && <p className="detail-related"><b>관련 표현</b> {word.related}</p>}
      {word.form && <p className="detail-memo">본문 형태 · {word.form}</p>}
      {word.memo && <p className="detail-memo">메모 · {word.memo}</p>}
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
