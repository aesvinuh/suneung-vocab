import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { parseBulk } from '../lib/parse.js';
import { POS_LABEL } from '../lib/word.js';

const SAMPLE = `reluctant (형)
꺼리는, 마지못해 하는
뉘앙스: 부정적. 하기 싫어서 꺼림. hesitant보다 싫은 감정이 강함
He was reluctant to admit his mistake.
그는 자기 실수를 인정하기를 꺼렸다.
유의어: hesitant, unwilling

curtail
[동] 줄이다, 축소하다
The government curtailed public spending.
정부는 공공 지출을 줄였다.

vivid - 생생한, 선명한
frugal | 검소한 | 긍정. 아껴 쓰는 | She lives a frugal life. | 그녀는 검소하게 산다.`;

const FIELDS = [
  ['meanings', '뜻'],
  ['nuance', '뉘앙스'],
  ['example', '예문'],
  ['exampleKo', '해석'],
  ['synonyms', '유의어'],
  ['antonyms', '반의어'],
];

export default function BulkAdd() {
  const { words, addWords } = useVocab();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const parsed = useMemo(() => parseBulk(text, words), [text, words]);
  const toAdd = parsed.rows.filter((r) => !r.duplicate);
  const dupCount = parsed.rows.length - toAdd.length;

  const submit = async () => {
    await addWords(toAdd.map((r) => r.data));
    setResult({ added: toAdd.length, skipped: dupCount });
    setText('');
  };

  return (
    <>
      <PageHeader title="일괄 추가" back="/" />
      <p className="hint">
        정리한 메모를 그대로 붙여 넣으세요. 단어 줄로 시작하면 그 아래 줄들을 뜻·예문·해석으로 알아서 나눠요. 아래 미리보기에서 칸이 맞게 나뉘었는지 확인하고 추가하면 돼요.{' '}
        <button className="link-btn inline" onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? '형식 설명 닫기' : '쓰는 법 보기'}
        </button>
      </p>
      {showHelp && (
        <div className="help-box">
          <ul className="help">
            <li><b>단어 줄</b>: 영어 단어만 한 줄 (품사는 <code>reluctant (형)</code>처럼 괄호로). 번호·글머리표는 무시돼요.</li>
            <li><b>뜻</b>: 단어 다음 첫 한국어 줄. 쉼표로 여러 개. <code>[동] 줄이다</code>처럼 품사를 앞에 써도 돼요.</li>
            <li><b>예문</b>: 영어 문장 줄. <b>해석</b>: 예문 바로 다음 한국어 줄.</li>
            <li><b>뉘앙스</b>: 뜻 다음에 오는 그 밖의 한국어 줄. 여러 줄이면 이어 붙여요.</li>
            <li>헷갈리면 머리말을 붙이세요: <code>뜻:</code> <code>뉘앙스:</code> <code>예문:</code> <code>해석:</code> <code>품사:</code> <code>유의어:</code> <code>반의어:</code></li>
            <li>한 줄로 쓰기: <code>vivid - 생생한</code> 또는 <code>단어 | 뜻 | 뉘앙스 | 예문 | 해석</code> (엑셀에서 복사한 표도 돼요)</li>
            <li>단어만 죽 나열하면 뜻 없는 '미완성' 단어로 들어가요.</li>
          </ul>
          <button className="btn small" onClick={() => setText(SAMPLE)}>
            예시 넣어 보기
          </button>
        </div>
      )}
      <textarea className="bulk-input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} spellCheck={false} />

      {result && (
        <p className="notice ok">
          {result.added}개 추가{result.skipped > 0 && `, 이미 있는 단어 ${result.skipped}개 건너뜀`}
        </p>
      )}

      {text.trim() && (
        <section className="stack">
          <p className="muted">
            단어 {parsed.rows.length}개 인식 · 추가 {toAdd.length}개
            {dupCount > 0 && ` · 이미 있음 ${dupCount}개`}
            {parsed.errors.length > 0 && ` · 확인 필요 ${parsed.errors.length}줄`}
          </p>
          {parsed.errors.map((e) => (
            <p key={'e' + e.line} className="notice bad">
              {e.line}번째 줄 — {e.reason}: <code>{e.text}</code>
            </p>
          ))}
          {parsed.rows.map((r) => (
            <div key={r.line} className={'review-card' + (r.duplicate ? ' saved' : '')}>
              <div className="review-head">
                <strong className="detail-word">{r.data.word}</strong>
                {r.data.pos && <span className="pos">{POS_LABEL[r.data.pos]}</span>}
                {r.duplicate && <span className="src-tag src-user">이미 있음 · 건너뜀</span>}
              </div>
              <dl className="filled">
                {FIELDS.map(([k, label]) => {
                  const v = Array.isArray(r.data[k]) ? r.data[k].join(', ') : r.data[k];
                  return v ? (
                    <div key={k}>
                      <dt>{label}</dt>
                      <dd className={k === 'example' ? 'en' : ''}>{v}</dd>
                    </div>
                  ) : null;
                })}
              </dl>
              {r.warnings.map((w) => (
                <p key={w} className="hint warn">
                  {w}
                </p>
              ))}
            </div>
          ))}
          <div className="sticky-actions">
            <button className="btn primary block" disabled={toAdd.length === 0} onClick={submit}>
              {toAdd.length}개 추가
            </button>
          </div>
        </section>
      )}
    </>
  );
}
