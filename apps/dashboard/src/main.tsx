import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0e1115',
            color: '#e2e8f0',
            border: '1px solid #1e2530',
          },
          success: {
            iconTheme: {
              primary: '#00e87a',
              secondary: '#080a0c',
            },
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
