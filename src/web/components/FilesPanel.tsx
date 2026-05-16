import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export interface FilesPanelData {
  label: string;
  files: string[];
}

export function FilesPanel({ data, onClose }: { data: FilesPanelData; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(data.files.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort — Firefox + http://localhost works, secure context only otherwise.
    }
  };

  return (
    <div className="files-panel" role="dialog" aria-label={`Files in ${data.label}`}>
      <div className="files-panel-head">
        <div className="files-panel-title">
          <Icon name="folder" size={12} /> <strong>{data.label}</strong>
          <span className="files-panel-count">{data.files.length}</span>
        </div>
        <div className="files-panel-actions">
          <button
            type="button"
            onClick={copyAll}
            title="Copy all paths to clipboard"
            disabled={data.files.length === 0}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close">
            ×
          </button>
        </div>
      </div>
      {data.files.length === 0 ? (
        <div className="files-panel-empty">No files attributed to this component.</div>
      ) : (
        <ol className="files-panel-list">
          {data.files.map((f) => (
            <li key={f} title={f}>
              <code>{f}</code>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
