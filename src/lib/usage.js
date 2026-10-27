// Claude API 사용량 기록과 하루 요청 한도 (이 기기 브라우저에 저장)
// 비용은 응답의 실제 토큰 수 × 모델 단가로 계산한 '대략'의 값.
import { todayKey } from './word.js';

const KEY = 'suneung-vocab.aiUsage';
const LIMIT_KEY = 'suneung-vocab.aiDailyLimit';
export const DEFAULT_DAILY_LIMIT = 20;
// claude-opus-5-5: 입력 $4 / 출력 $20 (100만 토큰당)
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 };
export const USD_TO_KRW = 1400; // 대략 환율 (표시용)

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function write(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* 저장 불가 */
  }
}

export function getDailyLimit() {
  try {
    const n = Number(localStorage.getItem(LIMIT_KEY));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
  } catch {
    return DEFAULT_DAILY_LIMIT;
  }
}
export function setDailyLimit(n) {
  try {
    localStorage.setItem(LIMIT_KEY, String(Math.max(1, Math.round(n))));
  } catch {
    /* 저장 불가 */
  }
}

const monthKey = (d = new Date()) => todayKey(d).slice(0, 7);

export function todayRequests() {
  return read().days?.[todayKey()] || 0;
}
export const canRequest = () => todayRequests() < getDailyLimit();

// ask() 한 번 끝날 때마다 호출
export function recordUsage(usage) {
  const v = read();
  const day = todayKey();
  const month = monthKey();
  const inTok = (usage?.input_tokens || 0) + (usage?.cache_creation_input_tokens || 0) + (usage?.cache_read_input_tokens || 0);
  const outTok = usage?.output_tokens || 0;
  v.days = { ...(v.days || {}), [day]: (v.days?.[day] || 0) + 1 };
  // 오래된 날짜 기록은 정리 (40일 넘은 것)
  for (const d of Object.keys(v.days)) if (Date.now() - new Date(d).getTime() > 40 * 864e5) delete v.days[d];
  const m = v.months?.[month] || { requests: 0, input: 0, output: 0, usd: 0 };
  v.months = {
    ...(v.months || {}),
    [month]: {
      requests: m.requests + 1,
      input: m.input + inTok,
      output: m.output + outTok,
      usd: m.usd + inTok * PRICE.input + outTok * PRICE.output,
    },
  };
  write(v);
}

export function monthUsage() {
  return read().months?.[monthKey()] || { requests: 0, input: 0, output: 0, usd: 0 };
}
