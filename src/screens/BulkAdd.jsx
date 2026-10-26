import { useMemo, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { parseBulk } from '../lib/parse.js';
import { POS_LABEL } from '../lib/word.js';
import { reinforce } from '../lib/autofill.js';

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

// Claude·ChatGPT에 단어 정리를 부탁할 때 붙여 쓰는 요청문 (이 형식이면 칸이 확실히 나뉨)
const AI_PROMPT = `아래 영단어들을 수능 단어장으로 정리해줘. 단어마다 아래 형식을 그대로 지키고, 단어 사이에는 빈 줄을 하나 넣어줘. 다른 설명은 붙이지 마.

단어 (품사)
뜻: 한국어 뜻 1~3개, 쉼표로 구분
뉘앙스: 긍정/부정, 격식 정도, 비슷한 단어와의 차이를 한두 문장으로
예문: 그 단어가 들어간 영어 문장 하나
해석: 예문의 한국어 해석
유의어: 영어 단어 2~3개, 쉼표로 구분

[단어 목록]
`;

const FIELDS = [
  ['meanings', '뜻'],
  ['nuance', '뉘앙스'],
  ['example', '예문'],
  ['exampleKo', '해석'],
  ['synonyms', '유의어'],
  ['antonyms', '반의어'],
];

export default function BulkAdd() {
  const { words, addWords, saveWord } = useVocab();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowHelp(true);
    }
  };
  const parsed = useMemo(() => parseBulk(text, words), [text, words]);
  const toAdd = parsed.rows.filter((r) => !r.duplicate);
  // 이미 있는 단어: 비어 있는 칸만 채우고 더 자주 나오게 (같은 글 안의 반복은 건너뜀)
  const again = useMemo(
    () =>
      parsed.rows
        .filter((r) => r.existingId && !r.repeat)
        .map((r) => ({ row: r, ...reinforce(words.find((w) => w.id === r.existingId), r.data) })),
    [parsed, words],
  );
  const againByLine = new Map(again.map((a) => [a.row.line, a]));
  const total = toAdd.length + again.length;

  const submit = async () => {
    await addWords(toAdd.map((r) => r.data));
    for (const a of again) await saveWord(a.word);
    setResult({ added: toAdd.length, again: again.length, filled: again.filter((a) => a.filled.length).length });
    setText('');
  };

  return (
    <>
      <PageHeader title="일괄 추가" back="/" />
      <p className="hint">
        정리한 메모나 Claude·ChatGPT가 정리해 준 글을 그대로 붙여 넣으세요 (표, **굵은 글씨**, 목록 모두 괜찮아요). 단어별로 뜻·예문·해석을 알아서 나누고, 아래 미리보기에서 확인한 뒤 추가하면 돼요.{' '}
        <button className="link-btn inline" onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? '형식 설명 닫기' : '쓰는 법 보기'}
        </button>
      </p>
      <div className="prompt-copy">
        <button className="btn small" onClick={copyPrompt}>
          {copied ? '✓ 복사했어요' : 'AI에게 보낼 요청문 복사'}
        </button>
        <span className="hint">Claude에 붙여 넣고 맨 아래에 단어 목록을 쓰면, 이 앱이 확실히 알아보는 형식으로 정리해 줘요.</span>
      </div>
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
            <li>이미 있는 단어를 다시 넣으면 더 자주 나오게 하고, 비어 있던 칸만 채워요 (직접 쓴 내용은 그대로).</li>
            <li>표는 첫 줄(단어 | 품사 | 뜻 | 예문 | 해석 …)의 순서를 따라요. 예문 뒤 괄호 속 한국어는 해석으로 나눠요.</li>
          </ul>
          <pre className="prompt-text">{AI_PROMPT}</pre>
          <button className="btn small" onClick={() => setText(SAMPLE)}>
            예시 넣어 보기
          </button>
        </div>
      )}
      <textarea className="bulk-input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} spellCheck={false} />

      {result && (
        <p className="notice ok">
          {result.added}개 추가
          {result.again > 0 && ` · 이미 있던 ${result.again}개는 더 자주 나오게 했어요`}
          {result.filled > 0 && ` (그중 ${result.filled}개는 빈 칸도 채움)`}
        </p>
      )}

      {text.trim() && (
        <section className="stack">
          <p className="muted">
            단어 {parsed.rows.length}개 인식 · 새로 추가 {toAdd.length}개
            {again.length > 0 && ` · 이미 있음 ${again.length}개(더 자주 출제)`}
            {parsed.errors.length > 0 && ` · 확인 필요 ${parsed.errors.length}줄`}
          </p>
          {parsed.errors.map((e) => (
            <p key={'e' + e.line} className="notice bad">
              {e.line}번째 줄 — {e.reason}: <code>{e.text}</code>
            </p>
          ))}
          {parsed.rows.map((r) => (
            <div key={r.line} className={'review-card' + (r.repeat ? ' saved' : '')}>
              <div className="review-head">
                <strong className="detail-word">{r.data.word}</strong>
                {r.data.pos && <span className="pos">{POS_LABEL[r.data.pos]}</span>}
                {r.repeat && <span className="src-tag src-user">위에 이미 있음 · 건너뜀</span>}
                {againByLine.has(r.line) && (
                  <span className="src-tag src-ai">
                    이미 있는 단어 · 더 자주 출제
                    {againByLine.get(r.line).filled.length > 0 && ` · 빈 칸 ${againByLine.get(r.line).filled.length}개 채움`}
                  </span>
                )}
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
            <button className="btn primary block" disabled={total === 0} onClick={submit}>
              {toAdd.length > 0 && `${toAdd.length}개 추가`}
              {toAdd.length > 0 && again.length > 0 && ' · '}
              {again.length > 0 && `${again.length}개 다시 넣기`}
              {total === 0 && '추가할 단어 없음'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
