// 해시 라우터 (#/words/abc?x=1). GitHub Pages에서 새로고침해도 404가 나지 않음.
import { useEffect, useState } from 'react';

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to, { replace = false } = {}) {
  if (replace) window.location.replace('#' + to);
  else window.location.hash = to;
}

export function goBack(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}
