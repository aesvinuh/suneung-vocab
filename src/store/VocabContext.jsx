// 앱 전체 상태: 단어 목록과 날짜별 기록을 메모리에 들고, 변경할 때마다 IndexedDB에 저장.
// GitHub 토큰이 있으면 Gist와 자동 동기화한다 (src/lib/sync.js).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from '../db/db.js';
import { normalizeWord, sameWord, todayKey } from '../lib/word.js';
import { deviceId, getToken, mergeData, syncOnce } from '../lib/sync.js';

const VocabContext = createContext(null);

const SYNC_DEBOUNCE = 15_000; // 마지막 변경 후 15초 뒤 자동 업로드
const SYNC_MIN_GAP = 30_000; // 앱으로 돌아왔을 때 너무 잦은 동기화 방지

export function VocabProvider({ children }) {
  const [words, setWords] = useState([]);
  const [daily, setDaily] = useState({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [sync, setSync] = useState({ state: getToken() ? 'idle' : 'off', at: null, message: '' });
  // 학습 화면에서 setState 반영 전에도 최신 값을 읽기 위한 ref
  const wordsRef = useRef([]);
  const dailyRef = useRef({});
  const tombRef = useRef({}); // 삭제한 단어 { id: 삭제 시각 }
  const syncTimer = useRef(null);
  const syncing = useRef(null);
  const lastSyncAt = useRef(0);

  const commitWords = useCallback((next) => {
    wordsRef.current = next;
    setWords(next);
  }, []);
  const commitDaily = useCallback((next) => {
    dailyRef.current = next;
    setDaily(next);
  }, []);

  // ── 동기화 ──
  const getLocal = useCallback(
    () => ({ words: wordsRef.current, daily: Object.values(dailyRef.current), tombstones: tombRef.current }),
    [],
  );

  const applyMerged = useCallback(
    async (merged) => {
      // 내려받는 사이에 바뀐 내용이 있을 수 있으니 현재 상태와 한 번 더 합친다
      const m = mergeData(getLocal(), merged);
      await db.replaceAll({ words: m.words, daily: m.daily });
      await db.putMeta('tombstones', m.tombstones);
      tombRef.current = m.tombstones;
      commitWords(m.words);
      commitDaily(Object.fromEntries(m.daily.map((d) => [d.date, d])));
    },
    [getLocal, commitWords, commitDaily],
  );

  const syncNow = useCallback(async () => {
    if (!getToken()) {
      setSync({ state: 'off', at: null, message: '' });
      return;
    }
    if (!navigator.onLine) {
      setSync((s) => ({ ...s, state: 'error', message: '오프라인이라 동기화를 미뤘어요.' }));
      return;
    }
    if (syncing.current) return syncing.current;
    clearTimeout(syncTimer.current);
    syncTimer.current = null;
    setSync((s) => ({ ...s, state: 'syncing', message: '' }));
    syncing.current = (async () => {
      try {
        const r = await syncOnce({ getLocal, applyLocal: applyMerged });
        lastSyncAt.current = Date.now();
        setSync({ state: 'ok', at: Date.now(), message: r.changedLocal ? '다른 기기의 변경을 받아왔어요.' : '' });
      } catch (e) {
        setSync((s) => ({ ...s, state: 'error', message: e.message }));
      } finally {
        syncing.current = null;
      }
    })();
    return syncing.current;
  }, [getLocal, applyMerged]);

  // 변경 후 잠시 뒤 자동 업로드
  const scheduleSync = useCallback(() => {
    if (!getToken()) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncNow, SYNC_DEBOUNCE);
  }, [syncNow]);

  useEffect(() => {
    (async () => {
      try {
        const [w, d, t] = await Promise.all([db.getAllWords(), db.getAllDaily(), db.getMeta('tombstones')]);
        commitWords(w.map((x) => normalizeWord(x)));
        commitDaily(Object.fromEntries(d.map((x) => [x.date, x])));
        tombRef.current = t || {};
        // 폰 저장 공간이 부족할 때 브라우저가 데이터를 지우지 않도록 요청
        navigator.storage?.persist?.().catch(() => {});
      } catch (e) {
        setError(e);
      } finally {
        setReady(true);
      }
    })();
  }, [commitWords, commitDaily]);

  // 앱을 열 때, 다시 돌아왔을 때, 인터넷이 다시 연결됐을 때 자동 동기화
  useEffect(() => {
    if (!ready) return;
    syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSyncAt.current > SYNC_MIN_GAP) syncNow();
      // 앱을 떠날 때 올릴 게 남아 있으면 바로 올림
      if (document.visibilityState === 'hidden' && syncTimer.current) syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', syncNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', syncNow);
    };
  }, [ready, syncNow]);

  const addTombstones = useCallback(async (ids) => {
    if (!ids.length) return;
    const now = Date.now();
    tombRef.current = { ...tombRef.current, ...Object.fromEntries(ids.map((id) => [id, now])) };
    await db.putMeta('tombstones', tombRef.current);
  }, []);

  // ── 단어 ──
  const addWords = useCallback(
    async (inputs) => {
      const now = Date.now();
      const created = inputs.map((x, i) => normalizeWord({ ...x, id: undefined, createdAt: now + i, updatedAt: now + i }, now));
      await db.putWords(created);
      commitWords([...wordsRef.current, ...created]);
      scheduleSync();
      return created;
    },
    [commitWords, scheduleSync],
  );

  const saveWord = useCallback(
    async (word, { touch = true } = {}) => {
      const next = normalizeWord({ ...word, updatedAt: touch ? Date.now() : word.updatedAt });
      await db.putWords([next]);
      const list = wordsRef.current;
      commitWords(list.some((w) => w.id === next.id) ? list.map((w) => (w.id === next.id ? next : w)) : [...list, next]);
      scheduleSync();
      return next;
    },
    [commitWords, scheduleSync],
  );

  const deleteWord = useCallback(
    async (id) => {
      await db.deleteWord(id);
      await addTombstones([id]);
      commitWords(wordsRef.current.filter((w) => w.id !== id));
      scheduleSync();
    },
    [commitWords, addTombstones, scheduleSync],
  );

  // 채점 후 호출: 단어 기록 저장 + 오늘 통계 증가 (기기별로 따로 셈 → 동기화 때 합계)
  const recordAnswer = useCallback(
    async (updatedWord, correct) => {
      const key = todayKey();
      const me = deviceId();
      const prev = dailyRef.current[key] || { date: key, answered: 0, correct: 0, devices: {} };
      const devices = prev.devices ? { ...prev.devices } : { legacy: { answered: prev.answered, correct: prev.correct } };
      const mine = devices[me] || { answered: 0, correct: 0 };
      devices[me] = { answered: mine.answered + 1, correct: mine.correct + (correct ? 1 : 0) };
      const entry = { date: key, answered: prev.answered + 1, correct: prev.correct + (correct ? 1 : 0), devices };
      commitDaily({ ...dailyRef.current, [key]: entry });
      await Promise.all([saveWord(updatedWord, { touch: false }), db.putDaily(entry)]);
    },
    [saveWord, commitDaily],
  );

  const importData = useCallback(
    async ({ words: incoming, daily: incomingDaily }, mode) => {
      if (mode === 'replace') {
        const keep = new Set(incoming.map((w) => w.id));
        await addTombstones(wordsRef.current.filter((w) => !keep.has(w.id)).map((w) => w.id));
        await db.replaceAll({ words: incoming, daily: incomingDaily });
        commitWords(incoming);
        commitDaily(Object.fromEntries(incomingDaily.map((d) => [d.date, d])));
        scheduleSync();
        return { added: incoming.length, updated: 0, skipped: 0 };
      }
      // merge: 같은 id면 덮어쓰기, id가 달라도 같은 단어가 이미 있으면 건너뜀
      const byId = new Map(wordsRef.current.map((w) => [w.id, w]));
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const w of incoming) {
        if (byId.has(w.id)) {
          byId.set(w.id, w);
          updated++;
        } else if ([...byId.values()].some((x) => sameWord(x.word, w.word))) {
          skipped++;
        } else {
          byId.set(w.id, w);
          added++;
        }
      }
      const nextDaily = { ...dailyRef.current };
      for (const d of incomingDaily) if (!nextDaily[d.date]) nextDaily[d.date] = d;
      const nextWords = [...byId.values()];
      await db.replaceAll({ words: nextWords, daily: Object.values(nextDaily) });
      commitWords(nextWords);
      commitDaily(nextDaily);
      scheduleSync();
      return { added, updated, skipped };
    },
    [commitWords, commitDaily, addTombstones, scheduleSync],
  );

  const clearAll = useCallback(async () => {
    await addTombstones(wordsRef.current.map((w) => w.id));
    await db.replaceAll({ words: [], daily: [] });
    commitWords([]);
    commitDaily({});
    scheduleSync();
  }, [commitWords, commitDaily, addTombstones, scheduleSync]);

  const value = useMemo(
    () => ({ ready, error, words, daily, wordsRef, sync, syncNow, addWords, saveWord, deleteWord, recordAnswer, importData, clearAll }),
    [ready, error, words, daily, sync, syncNow, addWords, saveWord, deleteWord, recordAnswer, importData, clearAll],
  );
  return <VocabContext.Provider value={value}>{children}</VocabContext.Provider>;
}

export function useVocab() {
  return useContext(VocabContext);
}
