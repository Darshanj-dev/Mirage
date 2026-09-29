import React from 'react';
import ReactDOM from 'react-dom/client';
import { ComposeView } from '@/components/ComposeView';
import '../popup/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ComposeView />
  </React.StrictMode>,
);
