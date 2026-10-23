import { useEffect, useRef, useState } from 'react';
import { POS_OPTIONS, TONE_OPTIONS } from '../lib/word.js';
import { findTarget } from '../lib/inflect.js';

const toForm = (w = {}) => ({
  word: w.word || '',
  meanings: (w.meanings || []).join(', '),
  pos: w.pos || '',
  tone: w.tone || '',
  nuance: w.nuance || '',
  example: w.example || '',
  exampleKo: w.exampleKo || '',
  synonyms: (w.synonyms || []).join(', '),
  antonyms: (w.antonyms || []).join(', '),
});

export default function WordForm({ initial, onSubmit, submitLabel = '저장', defaultOpen = false, resetOnSubmit = false, warn }) {
  const [f, setF] = useState(() => toForm(initial));
  const [open, setOpen] = useState(defaultOpen);
  const wordRef = useRef(null);
  const meaningRef = useRef(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (k, v) => setF((p) => ({ ...p, [k]: p[k] === v ? '' : v }));

  useEffect(() => {
    if (resetOnSubmit) wordRef.current?.focus();
  }, [resetOnSubmit]);

  const canSave = f.word.trim() && f.meanings.trim();
  const exampleMissesWord = f.example.trim() && f.word.trim() && !findTarget(f.example, f.word);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) {
      (f.word.trim() ? meaningRef : wordRef).current?.focus();
      return;
    }
    const ok = await onSubmit(f);
    if (ok !== false && resetOnSubmit) {
      setF(toForm());
      wordRef.current?.focus();
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>영어 단어</span>
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
      </label>
      {warn && warn(f)}
      <label className="field">
        <span>뜻 (여러 개는 쉼표로)</span>
        <input ref={meaningRef} value={f.meanings} onChange={set('meanings')} enterKeyHint="done" placeholder="예) 꺼리는, 마지못해 하는" />
      </label>

      <button type="button" className="more-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? '− 접기' : '+ 품사 · 뉘앙스 · 예문 · 유의어'}
      </button>

      {open && (
        <div className="more">
          <div className="field">
            <span>품사</span>
            <div className="chips">
              {POS_OPTIONS.map((p) => (
                <button type="button" key={p.value} className={'chip' + (f.pos === p.value ? ' on' : '')} onClick={() => toggle('pos', p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>감정 톤</span>
            <div className="chips">
              {TONE_OPTIONS.map((t) => (
                <button type="button" key={t.value} className={'chip' + (f.tone === t.value ? ' on' : '')} onClick={() => toggle('tone', t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>뉘앙스 메모</span>
            <textarea rows={3} value={f.nuance} onChange={set('nuance')} placeholder="예) 부정적. 하기 싫어서 꺼림. hesitant는 확신이 없어 망설임" />
          </label>
          <label className="field">
            <span>예문</span>
            <textarea rows={2} value={f.example} onChange={set('example')} autoCapitalize="sentences" spellCheck={false} />
            {exampleMissesWord && <small className="hint warn">예문에서 단어를 못 찾았어요. 불규칙 활용이면 *fought*처럼 별표로 감싸 주세요.</small>}
          </label>
          <label className="field">
            <span>예문 해석</span>
            <textarea rows={2} value={f.exampleKo} onChange={set('exampleKo')} />
          </label>
          <label className="field">
            <span>유의어 (쉼표로)</span>
            <input value={f.synonyms} onChange={set('synonyms')} autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="field">
            <span>반의어 (쉼표로)</span>
            <input value={f.antonyms} onChange={set('antonyms')} autoCapitalize="none" spellCheck={false} />
          </label>
        </div>
      )}

      <button type="submit" className="btn primary block" disabled={!canSave}>
        {submitLabel}
      </button>
    </form>
  );
}
