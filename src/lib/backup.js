// JSON 백업 내보내기/불러오기
import { normalizeWord, todayKey } from './word.js';

export const BACKUP_APP = 'suneung-vocab';
export const BACKUP_VERSION = 1;

export function makeBackup(words, daily) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    words,
    daily: Object.values(daily),
  };
}

export function downloadBackup(words, daily) {
  const blob = new Blob([JSON.stringify(makeBackup(words, daily), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `suneung-vocab-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  const words = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(words)) throw new Error('단어 목록(words)이 없는 파일입니다.');
  return {
    words: words.filter((w) => w && w.word).map((w) => normalizeWord(w)),
    daily: Array.isArray(data.daily) ? data.daily.filter((d) => d && d.date) : [],
  };
}
