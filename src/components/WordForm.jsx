import { useEffect, useMemo, useRef, useState } from 'react';
import { POS_OPTIONS, TONE_OPTIONS } from '../lib/word.js';
import { findTarget } from '../lib/inflect.js';
import SourceTag from './SourceTag.jsx';

// 네이버는 공개 사전 API가 없어 자동으로 가져올 수 없고, 사전 페이지를 새 탭으로 연다
const naverDictUrl = (word) => 'https://en.dict.naver.com/#/search?query=' + encodeURIComponent(word.trim());

const toForm = (w = {}) => ({
  word: w.word || '',
  meanings: (w.meanings || []).join(', '),
  pos: w.pos || '',
  tone: w.tone || '',
  nuance: w.nuance || '',
  memo: w.memo || '',
  form: w.form || '',
  related: w.related || '',
  definition: w.definition || '',
  example: w.example || '',
  exampleKo: w.exampleKo || '',
  synonyms: (w.synonyms || []).join(', '),
  antonyms: (w.antonyms || []).join(', '),
});

/**
 * sources: 칸별 출처 { meanings: 'ai', example: 'mw', ... }. 값을 고치면 '직접 입력'으로 바뀐다.
 * onSubmit(form, sources)
 * autofill: { onClick(word), disabled, label } — 단어 칸 옆 '자동 채우기' 버튼
 * requireMeaning=false면 단어만으로 저장 가능 (미완성 단어)
 */
export default function WordForm({
  initial,
  sources = {},
  onSubmit,
  submitLabel = '저장',
  defaultOpen = false,
  resetOnSubmit = false,
  requireMeaning = true,
  autofill,
  warn,
  footer,
}) {
  const start = useMemo(() => toForm(initial), [initial]);
  const [f, setF] = useState(start);
  const [open, setOpen] = useState(defaultOpen);
  const wordRef = useRef(null);
  const meaningRef = useRef(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (k, v) => setF((p) => ({ ...p, [k]: p[k] === v ? '' : v }));

  useEffect(() => {
    if (resetOnSubmit) wordRef.current?.focus();
  }, [resetOnSubmit]);

  // 출처 표시: 자동으로 채운 값 그대로면 원래 출처, 고쳤으면 '직접 입력'
  const sourceOf = (k) => (sources[k] ? (f[k] === start[k] ? sources[k] : 'user') : null);
  const Label = ({ k, children }) => (
    <span className="field-label">
      {children}
      <SourceTag source={sourceOf(k)} />
    </span>
  );

  const canSave = f.word.trim() && (!requireMeaning || f.meanings.trim());
  const exampleMissesWord = f.example.trim() && f.word.trim() && !findTarget(f.example, f.word);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) {
      (f.word.trim() ? meaningRef : wordRef).current?.focus();
      return;
    }
    const finalSources = {};
    for (const k of Object.keys(sources)) if (sourceOf(k)) finalSources[k] = sourceOf(k);
    const ok = await onSubmit(f, finalSources);
    if (ok !== false && resetOnSubmit) {
      setF(toForm());
      wordRef.current?.focus();
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">영어 단어</span>
        <div className="input-row">
          <input
            ref={wordRef}
            value={f.word}
            onChange={set('word')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                meaningRef.current?.focus();
              }
            }}
            placeholder="예) reluctant"
          />
          {autofill && (
            <button
              type="button"
              className="btn autofill-btn"
              disabled={autofill.disabled || !f.word.trim()}
              onClick={() => autofill.onClick(f.word.trim())}
            >
              {autofill.label || '자동 채우기'}
            </button>
          )}
        </div>
      </label>
      {f.word.trim() && (
        <a className="naver-link" href={naverDictUrl(f.word)} target="_blank" rel="noreferrer">
          네이버 영어사전에서 '{f.word.trim()}' 보기 ↗
        </a>
      )}
      {warn && warn(f)}
      <label className="field">
        <Label k="meanings">뜻 (여러 개는 쉼표로){!requireMeaning && ' · 비워 두면 미완성'}</Label>
        <input ref={meaningRef} value={f.meanings} onChange={set('meanings')} enterKeyHint="done" placeholder="예) 꺼리는, 마지못해 하는" />
      </label>

      <button type="button" className="more-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? '− 접기' : '+ 품사 · 뉘앙스 · 예문 · 유의어'}
      </button>

      {open && (
        <div className="more">
          <div className="field">
            <Label k="pos">품사</Label>
            <div className="chips">
              {POS_OPTIONS.map((p) => (
                <button type="button" key={p.value} className={'chip' + (f.pos === p.value ? ' on' : '')} onClick={() => toggle('pos', p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <Label k="tone">감정 톤</Label>
            <div className="chips">
              {TONE_OPTIONS.map((t) => (
                <button type="button" key={t.value} className={'chip' + (f.tone === t.value ? ' on' : '')} onClick={() => toggle('tone', t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <Label k="nuance">느낌 메모</Label>
            <textarea rows={3} value={f.nuance} onChange={set('nuance')} placeholder="예) 부정적. 하기 싫어서 꺼림. hesitant는 확신이 없어 망설임" />
            <small className="hint">자유 메모예요. 뉘앙스 문제는 '뉘앙스 프로필'(단어 수정 화면)로 나와요. 숙어·반의어·본문 형태는 아래 칸에 따로 적어 주세요.</small>
          </label>
          <label className="field">
            <Label k="related">관련 표현·숙어</Label>
            <input value={f.related} onChange={set('related')} placeholder="예) mutually exclusive: 상호 배타적인" spellCheck={false} />
          </label>
          <label className="field">
            <Label k="form">본문 형태 (지문에 나온 형태)</Label>
            <input value={f.form} onChange={set('form')} placeholder="예) settlements" autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="field">
            <Label k="memo">기타 메모 (강세·참고 등)</Label>
            <textarea rows={2} value={f.memo} onChange={set('memo')} />
          </label>
          <label className="field">
            <Label k="definition">영영 뜻풀이</Label>
            <textarea rows={2} value={f.definition} onChange={set('definition')} spellCheck={false} />
          </label>
          <label className="field">
            <Label k="example">예문</Label>
            <textarea rows={2} value={f.example} onChange={set('example')} autoCapitalize="sentences" spellCheck={false} />
            {exampleMissesWord && <small className="hint warn">예문에서 단어를 못 찾았어요. 불규칙 활용이면 *fought*처럼 별표로 감싸 주세요.</small>}
          </label>
          <label className="field">
            <Label k="exampleKo">예문 해석</Label>
            <textarea rows={2} value={f.exampleKo} onChange={set('exampleKo')} />
          </label>
          <label className="field">
            <Label k="synonyms">유의어 (쉼표로)</Label>
            <input value={f.synonyms} onChange={set('synonyms')} autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="field">
            <Label k="antonyms">반의어 (쉼표로)</Label>
            <input value={f.antonyms} onChange={set('antonyms')} autoCapitalize="none" spellCheck={false} />
          </label>
        </div>
      )}

      <button type="submit" className="btn primary block" disabled={!canSave}>
        {submitLabel}
      </button>
      {footer}
    </form>
  );
}
