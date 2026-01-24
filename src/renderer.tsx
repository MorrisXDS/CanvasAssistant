import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './layers/l6-ui/App';
import './layers/l6-ui/styles/global.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('Canvas Integration Dashboard renderer loaded');
