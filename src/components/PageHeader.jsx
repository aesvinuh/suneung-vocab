import { goBack } from '../lib/router.js';

export default function PageHeader({ title, back, right }) {
  return (
    <header className="page-header">
      {back && (
        <button type="button" className="icon-btn" onClick={() => goBack(back)} aria-label="뒤로">
          ←
        </button>
      )}
      <h1>{title}</h1>
      <div className="page-header-right">{right}</div>
    </header>
  );
}
