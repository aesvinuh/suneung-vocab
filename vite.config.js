import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' → GitHub Pages(https://아이디.github.io/저장소명/)처럼 하위 경로에 올려도 동작.
// 화면 이동은 해시(#/words) 방식이라 서버 라우팅 설정이 필요 없음.
export default defineConfig({
  base: './',
  plugins: [react()],
});
