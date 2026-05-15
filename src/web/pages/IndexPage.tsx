import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { fetchIndex } from '../api';
import type { DiagramIndex } from '../../model/types.js';

export function IndexPage() {
  const [index, setIndex] = useState<DiagramIndex | null>(null);
  useEffect(() => {
    fetchIndex().then(setIndex).catch(() => setIndex(null));
  }, []);

  if (!index) {
    return <div className="loading"><span className="spinner" /> Loading…</div>;
  }
  return <Navigate to={`/d/${encodeURIComponent(index.rootSystemId)}`} replace />;
}
