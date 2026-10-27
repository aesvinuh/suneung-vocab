import { useState } from 'react';
import { DIRECTIONS, INTENSITIES, ROLES, SIGNALS, emptyProfile, isFilled } from '../lib/profile.js';
import SourceTag from './SourceTag.jsx';

// 뉘앙스 프로필 편집 → '확정'. 미확정 상태에서 AI 제안이 있으면 그 값으로 미리 채워 둔다.
export default function ProfileEditor({ word, onSave, onCancel, saveLabel = '확정' }) {
  const cur = word.profile || emptyProfile();
  const useSuggestion = !cur.confirmed && !isFilled(cur) && cur.suggested;
  const start = useSuggestion ? cur.suggested : cur;
  const [p, setP] = useState({
    direction: start.direction,
    role: start.role,
    signal: start.signal,
    intensity: start.intensity,
    keywords: start.keywords.join(', '),
    diff: start.diff,
  });
  const [feel, setFeel] = useState(word.nuance || '');
  const set = (k, v) => setP((x) => ({ ...x, [k]: x[k] === v ? '' : v }));
  const ready = p.direction && p.role && p.intensity && (p.role !== 'signal' || p.signal);

  const chips = (k, list) => (
    <div className="chips">
      {list.map((o) => (
        <button type="button" key={o.value} className={'chip' + (p[k] === o.value ? ' on' : '')} onClick={() => set(k, o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );

  const save = () =>
    onSave({
      ...word,
      nuance: feel,
      profile: {
        ...cur,
        direction: p.direction,
        role: p.role,
        signal: p.role === 'signal' ? p.signal : '',
        intensity: p.intensity,
        keywords: p.keywords.split(/[,;/]/).map((k) => k.trim()).filter(Boolean).slice(0, 3),
        diff: p.diff.trim(),
        confirmed: true,
        confirmedAt: Date.now(),
      },
    });

  return (
    <div className="profile-editor">
      {useSuggestion && (
        <p className="hint">
          <SourceTag source="ai" /> 사전 정보를 근거로 한 AI 초안이에요. 맞으면 그대로, 아니면 고친 뒤 확정하세요.
        </p>
      )}
      <div className="field">
        <span className="field-label">평가 방향</span>
        {chips('direction', DIRECTIONS)}
      </div>
      <div className="field">
        <span className="field-label">글 속 역할</span>
        {chips('role', ROLES)}
        {p.role === 'signal' && chips('signal', SIGNALS)}
      </div>
      <div className="field">
        <span className="field-label">강도</span>
        {chips('intensity', INTENSITIES)}
      </div>
      <label className="field">
        <span className="field-label">느낌 키워드 (1~3개, 쉼표로)</span>
        <input value={p.keywords} onChange={(e) => setP((x) => ({ ...x, keywords: e.target.value }))} placeholder="예) 마지못함, 소극적" />
      </label>
      <label className="field">
        <span className="field-label">유사어와의 차이</span>
        <textarea rows={2} value={p.diff} onChange={(e) => setP((x) => ({ ...x, diff: e.target.value }))} placeholder="예) hesitant는 확신이 없어 망설임, reluctant는 하기 싫어서 꺼림" />
      </label>
      <label className="field">
        <span className="field-label">느낌 메모 (예전 뉘앙스 메모)</span>
        <textarea rows={2} value={feel} onChange={(e) => setFeel(e.target.value)} />
      </label>
      <div className="row-2">
        {onCancel && (
          <button type="button" className="btn block" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="button" className="btn primary block" disabled={!ready} onClick={save}>
          {saveLabel}
        </button>
      </div>
      {!ready && <small className="hint">평가 방향·글 속 역할·강도를 고르면 확정할 수 있어요.</small>}
    </div>
  );
}
