import { EventEmitter } from 'node:events';
import type { ProgressEvent } from '../ai/orchestrator.js';
import type { AnyDiagram, DiagramKind } from '../model/types.js';

export interface DiagramAddedEvent {
  id: string;
  kind: DiagramKind;
  level: number;
  title: string;
  parentId?: string;
}

export interface DoneEvent {
  rootSystemId: string;
  diagramCount: number;
  aiCallCount: number;
  estimatedCostUsd: number;
}

export interface BusState {
  state: 'idle' | 'running' | 'done' | 'error';
  startedAt?: string;
  doneAt?: string;
  lastProgress?: ProgressEvent;
  errorMessage?: string;
  diagrams: DiagramAddedEvent[];
  aiCallCount: number;
  estimatedCostUsd: number;
  rootSystemId?: string;
}

export type BusMessage =
  | { type: 'state'; state: BusState }
  | { type: 'progress'; progress: ProgressEvent }
  | { type: 'diagram-added'; diagram: DiagramAddedEvent }
  | { type: 'done'; result: DoneEvent }
  | { type: 'error'; message: string };

/**
 * Central event hub between the analyzer (publisher) and the WebSocket
 * subscribers (the browser). Holds the current state so newly-connected
 * clients can be brought up to date immediately.
 */
export class EventBus extends EventEmitter {
  state: BusState = {
    state: 'idle',
    diagrams: [],
    aiCallCount: 0,
    estimatedCostUsd: 0,
  };

  start(): void {
    this.state = {
      state: 'running',
      startedAt: new Date().toISOString(),
      diagrams: [],
      aiCallCount: 0,
      estimatedCostUsd: 0,
    };
    this.emitMessage({ type: 'state', state: this.state });
  }

  publishProgress(e: ProgressEvent): void {
    this.state.lastProgress = e;
    this.emitMessage({ type: 'progress', progress: e });
  }

  diagramAdded(d: AnyDiagram): void {
    const evt: DiagramAddedEvent = {
      id: d.id,
      kind: d.kind,
      level: d.level,
      title: d.title,
      parentId: d.parentId,
    };
    this.state.diagrams.push(evt);
    this.emitMessage({ type: 'diagram-added', diagram: evt });
  }

  recordAiCall(costUsd: number = 0): void {
    this.state.aiCallCount += 1;
    this.state.estimatedCostUsd += costUsd;
  }

  done(result: DoneEvent): void {
    this.state.state = 'done';
    this.state.doneAt = new Date().toISOString();
    this.state.rootSystemId = result.rootSystemId;
    this.state.aiCallCount = result.aiCallCount;
    this.state.estimatedCostUsd = result.estimatedCostUsd;
    this.emitMessage({ type: 'done', result });
  }

  error(message: string): void {
    this.state.state = 'error';
    this.state.errorMessage = message;
    this.emitMessage({ type: 'error', message });
  }

  private emitMessage(msg: BusMessage): void {
    this.emit('message', msg);
  }

  /** Subscribe to all messages; returns an unsubscribe handle. */
  subscribe(handler: (msg: BusMessage) => void): () => void {
    this.on('message', handler);
    return () => this.off('message', handler);
  }
}
