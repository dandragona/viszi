import { useEffect, useState } from 'react';
import type { ProgressEvent } from '../../ai/orchestrator';
import type { BusMessage, BusState } from '../../server/eventBus';

export function ProgressBanner({ onComplete }: { onComplete: () => void }) {
  const [state, setState] = useState<BusState | null>(null);
  const [latest, setLatest] = useState<ProgressEvent | null>(null);
  const [phase, setPhase] = useState<'connecting' | 'live' | 'idle' | 'closed'>('connecting');

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws/progress`;
    let socket: WebSocket | null = null;
    let cancelled = false;

    const connect = () => {
      socket = new WebSocket(url);
      socket.onopen = () => setPhase('live');
      socket.onclose = () => {
        if (cancelled) return;
        setPhase('closed');
        // gentle reconnect after 2s, helps if the server cycles
        setTimeout(() => {
          if (!cancelled) connect();
        }, 2000);
      };
      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as BusMessage;
          handle(msg);
        } catch {
          /* ignore malformed */
        }
      };
    };

    const handle = (msg: BusMessage) => {
      switch (msg.type) {
        case 'state':
          setState(msg.state);
          if (msg.state.lastProgress) setLatest(msg.state.lastProgress);
          if (msg.state.state === 'done') onComplete();
          break;
        case 'progress':
          setLatest(msg.progress);
          break;
        case 'diagram-added':
          setState((s) => (s ? { ...s, diagrams: [...s.diagrams, msg.diagram] } : s));
          break;
        case 'done':
          setState((s) => (s ? { ...s, state: 'done' } : s));
          onComplete();
          break;
        case 'error':
          setState((s) => (s ? { ...s, state: 'error', errorMessage: msg.message } : s));
          break;
      }
    };

    connect();
    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [onComplete]);

  // Don't render if we're idle or finished and have no useful info to show.
  if (!state || state.state === 'done' || state.state === 'idle') return null;

  const label = describe(latest);
  const callsText =
    typeof state.aiCallTotal === 'number' && state.aiCallTotal > 0
      ? `${state.aiCallCount}/${state.aiCallTotal} AI calls`
      : `${state.aiCallCount} AI calls`;
  const cacheSplit =
    state.cacheHits > 0 || state.cacheMisses > 0
      ? `${state.cacheHits} cached · ${state.cacheMisses} fresh`
      : null;
  const costNow =
    state.costSoFar > 0
      ? state.estimatedCostUsd > state.costSoFar
        ? `$${state.costSoFar.toFixed(2)} spent · ~$${state.estimatedCostUsd.toFixed(2)} total`
        : `$${state.costSoFar.toFixed(2)} spent`
      : state.estimatedCostUsd > 0
        ? `~$${state.estimatedCostUsd.toFixed(2)} estimated`
        : null;

  return (
    <div className="progress-banner">
      <span className="spinner" />
      <span className="label">{label}</span>
      <span className="stat">{state.diagrams.length > 0 ? `${state.diagrams.length} diagrams · ${callsText}` : callsText}</span>
      {cacheSplit && <span className="stat">·  {cacheSplit}</span>}
      {costNow && <span className="stat">·  {costNow}</span>}
      {phase !== 'live' && <span className="stat">·  {phase}</span>}
    </div>
  );
}

function describe(p: ProgressEvent | null): string {
  if (!p) return 'Starting analysis…';
  switch (p.phase) {
    case 'scan':
      return p.message;
    case 'parse':
      return `Parsing files… ${p.processed}/${p.total}`;
    case 'cluster':
      return `Clustered into ${p.moduleCount} modules`;
    case 'plan':
      return `Plan: ~${p.aiCallTotal} AI calls, est. ≤ $${p.estimatedCostUsd.toFixed(2)}`;
    case 'ai':
      return `${p.cached ? '↺ cache' : '✦ Claude'} ${p.kind} L${p.level} ${p.scope || '/'}`;
    case 'write':
      return `Writing ${p.diagrams} diagrams`;
    case 'hint':
      return p.message.split('\n')[0];
    case 'done':
      return 'Done';
  }
}
