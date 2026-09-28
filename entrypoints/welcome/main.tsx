import React from 'react';
import ReactDOM from 'react-dom/client';
import { WelcomeView } from '@/components/WelcomeView';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WelcomeView />
  </React.StrictMode>,
);
