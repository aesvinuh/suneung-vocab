import { useVocab } from '../store/VocabContext.jsx';

const TABS = [
  { key: 'home', label: '홈', href: '#/' },
  { key: 'words', label: '단어', href: '#/words' },
  { key: 'note', label: '오답 노트', href: '#/note' },
  { key: 'settings', label: '설정', href: '#/settings' },
];

export default function TabBar({ active }) {
  const { words } = useVocab();
  const noteCount = words.filter((w) => w.note.inNote).length;
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <a key={t.key} href={t.href} className={'tab' + (active === t.key ? ' active' : '')}>
          {t.label}
          {t.key === 'note' && noteCount > 0 && <span className="badge">{noteCount}</span>}
        </a>
      ))}
    </nav>
  );
}
