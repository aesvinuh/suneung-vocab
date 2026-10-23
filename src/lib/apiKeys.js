// API 키는 이 브라우저의 localStorage에만 저장한다.
// 코드·GitHub·JSON 백업 어디에도 들어가지 않는다 (기기마다 따로 입력).
const STORE_KEY = 'suneung-vocab.apiKeys';

export function getKeys() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { mw: v.mw || '', claude: v.claude || '' };
  } catch {
    return { mw: '', claude: '' };
  }
}

export function setKeys(keys) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ mw: keys.mw.trim(), claude: keys.claude.trim() }));
    return true;
  } catch {
    return false;
  }
}
