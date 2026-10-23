// IndexedDB 저장소. 화면 코드는 이 파일의 함수만 사용한다.
import { openDB } from 'idb';

const DB_NAME = 'suneung-vocab';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    // words: 단어 1개 = 1레코드 (src/lib/word.js normalizeWord 참고)
    db.createObjectStore('words', { keyPath: 'id' });
    // daily: 날짜별 풀이 기록 { date: '2026-10-22', answered, correct }
    db.createObjectStore('daily', { keyPath: 'date' });
  },
});

export async function getAllWords() {
  return (await dbPromise).getAll('words');
}

export async function putWords(words) {
  const tx = (await dbPromise).transaction('words', 'readwrite');
  await Promise.all([...words.map((w) => tx.store.put(w)), tx.done]);
}

export async function deleteWord(id) {
  return (await dbPromise).delete('words', id);
}

export async function getAllDaily() {
  return (await dbPromise).getAll('daily');
}

export async function putDaily(entry) {
  return (await dbPromise).put('daily', entry);
}

export async function replaceAll({ words, daily }) {
  const db = await dbPromise;
  const tx = db.transaction(['words', 'daily'], 'readwrite');
  const ws = tx.objectStore('words');
  const ds = tx.objectStore('daily');
  await ws.clear();
  await ds.clear();
  await Promise.all([...words.map((w) => ws.put(w)), ...daily.map((d) => ds.put(d)), tx.done]);
}
