import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import 'reactflow/dist/style.css';
import './styles.css';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
