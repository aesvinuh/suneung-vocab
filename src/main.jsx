import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { VocabProvider } from './store/VocabContext.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <VocabProvider>
      <App />
    </VocabProvider>
  </StrictMode>,
);
