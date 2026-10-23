import { useRef, useState } from 'react';
import { useVocab } from '../store/VocabContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { downloadBackup, parseBackup } from '../lib/backup.js';
import { SAMPLE_WORDS } from '../data/sampleWords.js';
import { sameWord } from '../lib/word.js';
import { getKeys, setKeys } from '../lib/apiKeys.js';
import { lookupMw } from '../lib/dictionary.js';
import { testClaudeKey } from '../lib/aiFill.js';
import { useOnline } from '../lib/useOnline.js';

export default function Settings() {
  const { words, daily, importData, clearAll, addWords } = useVocab();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
      setMsg(null);
    } catch (err) {
      setMsg({ type: 'bad', text: '불러올 수 없는 파일이에요: ' + err.message });
    }
  };

  const doImport = async (mode) => {
    if (mode === 'replace' && !confirm('지금 기기의 데이터를 모두 지우고 파일 내용으로 바꿀까요?')) return;
    const r = await importData(pending, mode);
    setPending(null);
    setMsg({ type: 'ok', text: mode === 'replace' ? `${r.added}개 단어로 교체했어요.` : `추가 ${r.added} · 갱신 ${r.updated} · 중복 건너뜀 ${r.skipped}` });
  };

  const addSamples = async () => {
    const fresh = SAMPLE_WORDS.filter((s) => !words.some((w) => sameWord(w.word, s.word)));
    await addWords(fresh);
    setMsg({ type: 'ok', text: `샘플 ${fresh.length}개 추가 (이미 있는 ${SAMPLE_WORDS.length - fresh.length}개 제외)` });
  };

  const wipe = async () => {
    if (!confirm('모든 단어와 학습 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
    if (!confirm('정말 삭제할까요? 먼저 백업을 내보내는 것을 권장해요.')) return;
    await clearAll();
    setMsg({ type: 'ok', text: '모두 삭제했어요.' });
  };

  return (
    <>
      <PageHeader title="설정" />
      {msg && <p className={'notice ' + msg.type}>{msg.text}</p>}

      <ApiKeys />

      <section className="card">
        <h2 className="section-title">백업</h2>
        <p className="hint">데이터는 이 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 꼭 내보내 두세요.</p>
        <button className="btn primary block" onClick={() => downloadBackup(words, daily)} disabled={words.length === 0}>
          JSON으로 내보내기 ({words.length}개)
        </button>
        <button className="btn block" onClick={() => fileRef.current?.click()}>
          JSON 불러오기
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        {pending && (
          <div className="confirm-box">
            <p>파일에 단어 {pending.words.length}개가 있어요. 어떻게 불러올까요?</p>
            <div className="row-2">
              <button className="btn block" onClick={() => doImport('merge')}>
                합치기
              </button>
              <button className="btn danger block" onClick={() => doImport('replace')}>
                전체 교체
              </button>
            </div>
            <button className="link-btn" onClick={() => setPending(null)}>
              취소
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">데이터</h2>
        <button className="btn block" onClick={addSamples}>
          샘플 단어 15개 넣기
        </button>
        <button className="btn danger block" onClick={wipe}>
          전체 삭제
        </button>
      </section>

      <section className="card">
        <h2 className="section-title">도움말</h2>
        <ul className="help">
          <li>안드로이드 크롬: 메뉴 ⋮ → '홈 화면에 추가'로 앱처럼 실행할 수 있어요.</li>
          <li>예문에서 불규칙 활용(went, fought 등)은 *fought*처럼 별표로 감싸면 빈칸 문제에 쓰여요.</li>
          <li>감정 톤(긍정/부정/중립)을 지정하지 않으면 뉘앙스 메모에 '긍정/부정/중립' 중 하나만 적혀 있을 때 자동 인식해요.</li>
        </ul>
      </section>
    </>
  );
}

function ApiKeys() {
  const online = useOnline();
  const [keys, setK] = useState(getKeys);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState({});
  const saved = getKeys();
  const dirty = keys.mw !== saved.mw || keys.claude !== saved.claude;

  const save = () => {
    const ok = setKeys(keys);
    setStatus({ save: ok ? '이 브라우저에 저장했어요.' : '저장하지 못했어요 (시크릿 모드인지 확인).' });
  };

  const test = async (which) => {
    setStatus((s) => ({ ...s, [which]: '확인 중…' }));
    try {
      if (which === 'mw') await lookupMw('test', keys.mw.trim());
      else await testClaudeKey(keys.claude.trim());
      setStatus((s) => ({ ...s, [which]: '✓ 연결됐어요' }));
    } catch (e) {
      setStatus((s) => ({ ...s, [which]: '✗ ' + e.message }));
    }
  };

  const field = (which, label, placeholder) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="input-row">
        <input
          type={show ? 'text' : 'password'}
          value={keys[which]}
          onChange={(e) => setK((k) => ({ ...k, [which]: e.target.value }))}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <button type="button" className="btn small" disabled={!online || !keys[which].trim()} onClick={() => test(which)}>
          확인
        </button>
      </div>
      {status[which] && <small className={'hint' + (status[which].startsWith('✗') ? ' warn' : '')}>{status[which]}</small>}
    </label>
  );

  return (
    <section className="card">
      <h2 className="section-title">자동 채우기 API 키</h2>
      <p className="hint">
        키는 이 기기의 이 브라우저에만 저장돼요. 코드·GitHub·JSON 백업에는 들어가지 않으니, 폰과 컴퓨터에 각각 넣어 주세요.
      </p>
      <div className="form">
        {field('mw', "Merriam-Webster Learner's 키 (무료)", 'dictionaryapi.com에서 발급')}
        {field('claude', 'Claude API 키 (유료, 사용한 만큼)', 'sk-ant-…')}
        <label className="check-line">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> 키 보이기
        </label>
        <button className="btn primary block" disabled={!dirty} onClick={save}>
          키 저장
        </button>
        {status.save && <small className="hint">{status.save}</small>}
      </div>
      <ul className="help">
        <li>
          Merriam-Webster: <a href="https://dictionaryapi.com/register/index" target="_blank" rel="noreferrer">dictionaryapi.com 가입</a> → 'Request API Key 1'에서 <b>Merriam-Webster's Learner's Dictionary</b>를 고르면 키가 나와요. 없으면 Free Dictionary만 써요.
        </li>
        <li>
          Claude: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> → API Keys → Create Key. 결제 수단 등록이 필요해요. 없으면 영영 뜻·예문·유의어만 채워져요.
        </li>
      </ul>
    </section>
  );
}
