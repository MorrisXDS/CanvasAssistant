import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './layers/l6-ui/App';
import './layers/l6-ui/styles/global.css';
import { createLogger } from './layers/l6-ui/utils/rendererLogger';

const log = createLogger('renderer');

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

log.info('Canvas Integration Dashboard renderer loaded');
