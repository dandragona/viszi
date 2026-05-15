import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppRoutes } from './router';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { ProgressBanner } from './components/ProgressBanner';
import { fetchIndex, STATIC_MODE } from './api';
import type { DiagramIndex } from '../model/types.js';

export function App() {
  const [index, setIndex] = useState<DiagramIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const location = useLocation();

  useEffect(() => {
    fetchIndex()
      .then((idx) => {
        setIndex(idx);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [reloadTick]);

  // Show a friendlier message when there's no analysis yet AND we're in
  // server mode (live progress will refill it).
  if (error && STATIC_MODE) {
    return (
      <div className="app">
        <div className="empty-state">
          <h2>No analysis found</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!index) {
    return (
      <div className="app">
        {!STATIC_MODE && <ProgressBanner onComplete={() => setReloadTick((t) => t + 1)} />}
        <div className="loading"><span className="spinner" /> {error ? 'Waiting for analysis…' : 'Loading…'}</div>
      </div>
    );
  }
  return (
    <div className="app">
      <Topbar index={index} location={location} />
      <div className="layout">
        <Sidebar index={index} />
        <AppRoutes />
      </div>
      <CommandPalette />
      {!STATIC_MODE && <ProgressBanner onComplete={() => setReloadTick((t) => t + 1)} />}
    </div>
  );
}
