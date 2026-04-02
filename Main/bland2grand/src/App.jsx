// App.jsx
// Root application component. Sets up routing and the app shell.

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';

import SplashPage     from './components/pages/SplashPage';
import SearchPage     from './components/pages/SearchPage';
import BlendDetailPage from './components/pages/BlendDetailPage';
import DispensingPage from './components/pages/DispensingPage';
import CompletionPage from './components/pages/CompletionPage';
import SettingsPage   from './components/pages/SettingsPage';

import './styles/globals.css';
import './styles/components.css';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Routes>
            <Route path="/"          element={<SplashPage />} />
            <Route path="/search"    element={<SearchPage />} />
            <Route path="/blend"     element={<BlendDetailPage />} />
            <Route path="/dispense"  element={<DispensingPage />} />
            <Route path="/complete"  element={<CompletionPage />} />
            <Route path="/settings"  element={<SettingsPage />} />
            {/* Fallback */}
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
