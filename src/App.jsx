import { useRoute } from './lib/router.js';
import { useVocab } from './store/VocabContext.jsx';
import TabBar from './components/TabBar.jsx';
import Home from './screens/Home.jsx';
import Study from './screens/Study.jsx';
import AddWord from './screens/AddWord.jsx';
import BulkAdd from './screens/BulkAdd.jsx';
import WordList from './screens/WordList.jsx';
import EditWord from './screens/EditWord.jsx';
import WrongNote from './screens/WrongNote.jsx';
import Settings from './screens/Settings.jsx';
import AutoFillBatch from './screens/AutoFillBatch.jsx';

export default function App() {
  const { path, query } = useRoute();
  const { ready, error } = useVocab();

  if (!ready) return <div className="center-msg">불러오는 중…</div>;
  if (error)
    return (
      <div className="center-msg">
        저장소를 열 수 없습니다. 시크릿 모드에서는 저장이 안 될 수 있어요.
        <br />
        <small>{String(error)}</small>
      </div>
    );

  if (path === '/study') return <Study mode={query.mode === 'note' ? 'note' : 'normal'} />;

  const [, section, id] = path.split('/');
  let screen;
  let tab = section || 'home';
  switch (section) {
    case 'add':
      screen = <AddWord />;
      tab = 'words';
      break;
    case 'bulk':
      screen = <BulkAdd />;
      tab = 'words';
      break;
    case 'words':
      screen = id ? <EditWord id={id} /> : <WordList />;
      break;
    case 'autofill':
      screen = <AutoFillBatch />;
      tab = 'words';
      break;
    case 'note':
      screen = <WrongNote />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    default:
      screen = <Home />;
      tab = 'home';
  }
  return (
    <div className="app">
      <main className="page">{screen}</main>
      <TabBar active={tab} />
    </div>
  );
}
