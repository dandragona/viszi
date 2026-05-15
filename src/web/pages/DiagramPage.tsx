import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchDiagram } from '../api';
import type { AnyDiagram } from '../../model/types.js';
import { DiagramCanvas } from '../components/DiagramCanvas';

export function DiagramPage() {
  const { id } = useParams<{ id: string }>();
  const [diagram, setDiagram] = useState<AnyDiagram | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setDiagram(null);
    setError(null);
    fetchDiagram(id)
      .then(setDiagram)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="empty-state">
        <h2>Could not load diagram</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (!diagram) {
    return <div className="loading"><span className="spinner" /> Loading diagram…</div>;
  }
  return <DiagramCanvas diagram={diagram} />;
}
