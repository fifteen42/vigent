import { useState } from 'react';
import type { TranscriptPanel } from '@vigent/core';

export function Transcript({ panel }: { panel: TranscriptPanel }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(panel.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>📝</span>
        <span style={styles.title}>Transcript</span>
        {panel.language && <span style={styles.lang}>{panel.language}</span>}
        {panel.sourceFile && <span style={styles.source}>{panel.sourceFile}</span>}
        <button style={styles.copy} onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div style={styles.body}>
        <pre style={styles.text}>{panel.text}</pre>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: 10, background: '#fff', border: '1px solid #e0e0e0',
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', background: '#f8f8f8', borderBottom: '1px solid #e8e8e8',
  },
  icon: { fontSize: 16 },
  title: { fontSize: 13, color: '#111', fontWeight: 600, flex: 1 },
  lang: {
    fontSize: 11, color: '#5b9cf6', background: '#eff6ff',
    border: '1px solid #dbeafe', padding: '2px 8px', borderRadius: 4,
  },
  source: { fontSize: 11, color: '#aaa', fontFamily: 'monospace' },
  body: { maxHeight: 440, overflowY: 'auto' as const },
  text: {
    margin: 0, padding: '14px 16px',
    fontSize: 13, color: '#333', lineHeight: 1.8,
    whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit',
  },
  copy: {
    fontSize: 11, color: '#5b9cf6', background: 'transparent',
    border: '1px solid #dbeafe', borderRadius: 6,
    padding: '3px 10px', cursor: 'pointer',
    transition: 'all 0.1s',
  },
};
