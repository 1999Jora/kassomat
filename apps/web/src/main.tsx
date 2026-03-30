import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initNative } from './lib/capacitor';
import { initPushNotifications } from './lib/push-notifications';

initNative();
void initPushNotifications();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
