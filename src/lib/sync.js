// GitHub Gist 동기화: 내 GitHub 계정의 비밀 Gist 하나에 전체 데이터를 JSON으로 두고,
// 기기마다 '내려받기 → 합치기 → 올리기'를 한다. 서버 없음 (api.github.com이 CORS 허용).
//
// 합치기 규칙
//  - 단어: 같은 id면 더 최근에 바뀐 쪽 (수정 시각과 마지막 출제 시각 중 늦은 것)
//  - 삭제: 지운 단어 id와 시각(tombstone)을 함께 저장 → 다른 기기에서 다시 살아나지 않음
//  - 같은 단어를 두 기기에서 따로 추가했으면 더 최근 것 하나만 남김
//  - 오늘 푼 문제 수: 기기별로 따로 세고 합계를 냄 (중복으로 더해지지 않음)
import { normalizeWord, uid } from './word.js';

const TOKEN_KEY = 'suneung-vocab.githubToken';
const GIST_KEY = 'suneung-vocab.gistId';
const DEVICE_KEY = 'suneung-vocab.deviceId';
export const SYNC_FILE = 'suneung-vocab-sync.json';
const API = 'https://api.github.com';

const ls = {
  get(k) {
    try {
      return localStorage.getItem(k) || '';
    } catch {
      return '';
    }
  },
  set(k, v) {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {
      /* 저장 불가(시크릿 모드 등) */
    }
  },
};

export const getToken = () => ls.get(TOKEN_KEY);
export const setToken = (t) => {
  ls.set(TOKEN_KEY, t.trim());
  ls.set(GIST_KEY, ''); // 토큰이 바뀌면 Gist도 다시 찾기
};

export function deviceId() {
  let id = ls.get(DEVICE_KEY);
  if (!id) {
    id = uid();
    ls.set(DEVICE_KEY, id);
  }
  return id;
}

// ── 합치기 (순수 함수) ─────────────────────────────────────

export const changedAt = (w) => Math.max(w.updatedAt || 0, w.stats?.lastShownAt || 0);

export function mergeData(local, remote) {
  const tombstones = { ...(remote.tombstones || {}) };
  for (const [id, t] of Object.entries(local.tombstones || {})) tombstones[id] = Math.max(tombstones[id] || 0, t);

  const byId = new Map();
  for (const w of [...(remote.words || []), ...(local.words || [])]) {
    const prev = byId.get(w.id);
    if (!prev || changedAt(w) > changedAt(prev)) byId.set(w.id, w);
  }
  for (const [id, w] of byId) {
    if (tombstones[id] >= changedAt(w)) byId.delete(id);
    else delete tombstones[id]; // 삭제 뒤에 다른 기기에서 다시 쓴 단어는 살림
  }
  // 같은 단어(철자)가 id만 다르게 두 개면 최근 것만
  const byWord = new Map();
  for (const w of byId.values()) {
    const key = w.word.trim().toLowerCase();
    const prev = byWord.get(key);
    if (!prev) byWord.set(key, w);
    else {
      const [keep, drop] = changedAt(w) > changedAt(prev) ? [w, prev] : [prev, w];
      byWord.set(key, keep);
      tombstones[drop.id] = Math.max(changedAt(drop), Date.now());
    }
  }

  const daily = {};
  for (const src of [remote.daily || [], local.daily || []]) {
    for (const d of src) {
      const cur = daily[d.date] || { date: d.date, devices: {} };
      const devs = d.devices || { legacy: { answered: d.answered || 0, correct: d.correct || 0 } };
      for (const [dev, c] of Object.entries(devs)) {
        const p = cur.devices[dev];
        if (!p || c.answered > p.answered) cur.devices[dev] = { answered: c.answered, correct: c.correct };
      }
      daily[d.date] = cur;
    }
  }
  for (const d of Object.values(daily)) {
    const all = Object.values(d.devices);
    d.answered = all.reduce((a, c) => a + c.answered, 0);
    d.correct = all.reduce((a, c) => a + c.correct, 0);
  }

  return {
    words: [...byWord.values()].map((w) => normalizeWord(w)),
    daily: Object.values(daily),
    tombstones,
  };
}

// 내용이 같은지 (불필요한 저장·업로드 방지)
export function sameData(a, b) {
  const key = (d) =>
    JSON.stringify([
      [...d.words].sort((x, y) => (x.id < y.id ? -1 : 1)).map((w) => [w.id, changedAt(w)]),
      [...d.daily].sort((x, y) => (x.date < y.date ? -1 : 1)).map((x) => [x.date, x.answered]),
      Object.keys(d.tombstones || {}).sort(),
    ]);
  return key(a) === key(b);
}

// ── GitHub Gist ────────────────────────────────────────────

export class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function gh(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new SyncError('GitHub에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  if (res.status === 401) throw new SyncError('GitHub 토큰이 올바르지 않거나 만료됐어요. 설정에서 새 토큰을 넣어 주세요.');
  if (res.status === 403 || res.status === 404) {
    const scopes = res.headers.get('x-oauth-scopes');
    if (scopes !== null && !scopes.includes('gist')) throw new SyncError("토큰에 'gist' 권한이 없어요. 토큰을 만들 때 gist에 체크해 주세요.");
  }
  if (!res.ok) throw new SyncError(`GitHub 오류 (${res.status}).`, res.status);
  return res.status === 204 ? null : res.json();
}

// 이 앱용 Gist 찾기 → 없으면 비밀 Gist 새로 만들기
async function findOrCreateGist(token) {
  const saved = ls.get(GIST_KEY);
  if (saved) return saved;
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, { token });
    const found = list.find((g) => g.files && g.files[SYNC_FILE]);
    if (found) {
      ls.set(GIST_KEY, found.id);
      return found.id;
    }
    if (list.length < 100) break;
  }
  const created = await gh('/gists', {
    method: 'POST',
    token,
    body: {
      description: '수능 단어 앱 동기화 데이터 (지우지 마세요)',
      public: false,
      files: { [SYNC_FILE]: { content: JSON.stringify({ app: 'suneung-vocab', words: [], daily: [], tombstones: {} }) } },
    },
  });
  ls.set(GIST_KEY, created.id);
  return created.id;
}

async function readGist(id, token) {
  let gist;
  try {
    gist = await gh(`/gists/${id}`, { token });
  } catch (e) {
    ls.set(GIST_KEY, ''); // 지워진 Gist면 다음에 다시 찾기
    throw e;
  }
  const file = gist.files?.[SYNC_FILE];
  if (!file) return { words: [], daily: [], tombstones: {} };
  // 1MB가 넘으면 API 응답에서 잘리므로 원본 주소에서 받는다
  const text = file.truncated ? await (await fetch(file.raw_url, { cache: 'no-store' })).text() : file.content;
  try {
    const data = JSON.parse(text || '{}');
    return { words: data.words || [], daily: data.daily || [], tombstones: data.tombstones || {} };
  } catch {
    throw new SyncError('동기화 파일이 손상됐어요. GitHub Gist에서 suneung-vocab-sync.json을 확인해 주세요.');
  }
}

async function writeGist(id, token, data) {
  await gh(`/gists/${id}`, {
    method: 'PATCH',
    token,
    body: { files: { [SYNC_FILE]: { content: JSON.stringify({ app: 'suneung-vocab', version: 1, syncedAt: new Date().toISOString(), ...data }) } } },
  });
}

// 토큰 확인용
export async function testToken(token) {
  const user = await gh('/user', { token });
  return user.login;
}

/**
 * 한 번 동기화. getLocal()로 현재 데이터를 받고, 바뀐 게 있으면 applyLocal(merged)로 반영.
 * @returns {{ changedLocal: boolean, changedRemote: boolean }}
 */
export async function syncOnce({ getLocal, applyLocal }) {
  const token = getToken();
  if (!token) throw new SyncError('GitHub 토큰이 없어요.');
  let id = await findOrCreateGist(token);
  let remote;
  try {
    remote = await readGist(id, token);
  } catch (e) {
    if (e.status !== 404) throw e;
    // Gist가 지워졌으면 다시 찾거나 새로 만든다
    id = await findOrCreateGist(token);
    remote = await readGist(id, token);
  }
  const local = getLocal();
  const merged = mergeData(local, remote);
  const changedLocal = !sameData(merged, local);
  const changedRemote = !sameData(merged, remote);
  if (changedLocal) await applyLocal(merged);
  if (changedRemote) await writeGist(id, token, merged);
  return { changedLocal, changedRemote };
}
