// 앱 전체 상태: 단어 목록과 날짜별 기록을 메모리에 들고, 변경할 때마다 IndexedDB에 저장.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from '../db/db.js';
import { normalizeWord, sameWord, todayKey } from '../lib/word.js';

const VocabContext = createContext(null);

export function VocabProvider({ children }) {
  const [words, setWords] = useState([]);
  const [daily, setDaily] = useState({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  // 학습 화면에서 setState 반영 전에도 최신 값을 읽기 위한 ref
  const wordsRef = useRef([]);
  const dailyRef = useRef({});

  const commitWords = useCallback((next) => {
    wordsRef.current = next;
    setWords(next);
  }, []);
  const commitDaily = useCallback((next) => {
    dailyRef.current = next;
    setDaily(next);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [w, d] = await Promise.all([db.getAllWords(), db.getAllDaily()]);
        commitWords(w.map((x) => normalizeWord(x)));
        commitDaily(Object.fromEntries(d.map((x) => [x.date, x])));
        // 폰 저장 공간이 부족할 때 브라우저가 데이터를 지우지 않도록 요청
        navigator.storage?.persist?.().catch(() => {});
      } catch (e) {
        setError(e);
      } finally {
        setReady(true);
      }
    })();
  }, [commitWords, commitDaily]);

  const addWords = useCallback(
    async (inputs) => {
      const now = Date.now();
      const created = inputs.map((x, i) => normalizeWord({ ...x, id: undefined, createdAt: now + i, updatedAt: now + i }, now));
      await db.putWords(created);
      commitWords([...wordsRef.current, ...created]);
      return created;
    },
    [commitWords],
  );

  const saveWord = useCallback(
    async (word, { touch = true } = {}) => {
      const next = normalizeWord({ ...word, updatedAt: touch ? Date.now() : word.updatedAt });
      await db.putWords([next]);
      const list = wordsRef.current;
      commitWords(list.some((w) => w.id === next.id) ? list.map((w) => (w.id === next.id ? next : w)) : [...list, next]);
      return next;
    },
    [commitWords],
  );

  const deleteWord = useCallback(
    async (id) => {
      await db.deleteWord(id);
      commitWords(wordsRef.current.filter((w) => w.id !== id));
    },
    [commitWords],
  );

  // 채점 후 호출: 단어 기록 저장 + 오늘 통계 증가
  const recordAnswer = useCallback(
    async (updatedWord, correct) => {
      const key = todayKey();
      const prev = dailyRef.current[key] || { date: key, answered: 0, correct: 0 };
      const entry = { ...prev, answered: prev.answered + 1, correct: prev.correct + (correct ? 1 : 0) };
      commitDaily({ ...dailyRef.current, [key]: entry });
      await Promise.all([saveWord(updatedWord, { touch: false }), db.putDaily(entry)]);
    },
    [saveWord, commitDaily],
  );

  const importData = useCallback(
    async ({ words: incoming, daily: incomingDaily }, mode) => {
      if (mode === 'replace') {
        await db.replaceAll({ words: incoming, daily: incomingDaily });
        commitWords(incoming);
        commitDaily(Object.fromEntries(incomingDaily.map((d) => [d.date, d])));
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
      return { added, updated, skipped };
    },
    [commitWords, commitDaily],
  );

  const clearAll = useCallback(async () => {
    await db.replaceAll({ words: [], daily: [] });
    commitWords([]);
    commitDaily({});
  }, [commitWords, commitDaily]);

  const value = useMemo(
    () => ({ ready, error, words, daily, wordsRef, addWords, saveWord, deleteWord, recordAnswer, importData, clearAll }),
    [ready, error, words, daily, addWords, saveWord, deleteWord, recordAnswer, importData, clearAll],
  );
  return <VocabContext.Provider value={value}>{children}</VocabContext.Provider>;
}

export function useVocab() {
  return useContext(VocabContext);
}
