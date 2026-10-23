import { SOURCE_LABEL } from '../lib/autofill.js';

// 칸 옆에 붙는 출처 표시 (Merriam-Webster / Free Dictionary / AI 생성 / 직접 입력)
export default function SourceTag({ source }) {
  if (!source) return null;
  return <span className={'src-tag src-' + source}>{SOURCE_LABEL[source] || source}</span>;
}
