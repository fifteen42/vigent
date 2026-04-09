import type { TranscriptPanel } from '@vigent/core';

export function Transcript({ panel }: { panel: TranscriptPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>📝</span>
        <span style={styles.title}>Transcript</span>
        {panel.language && <span style={styles.lang}>{panel.language}</span>}
        {panel.sourceFile && <span style={styles.source}>{panel.sourceFile}</span>}
      </div>
      <div style={styles.body}>
        <pre style={styles.text}>{panel.text}</pre>
      </div>
      <button
        style={styles.copy}
        onClick={() => navigator.clipboard.writeText(panel.text)}
      >
        Copy
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { borderRadius: 10, background: '#111', border: '1px solid #2a2a2a', padding: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  icon: { fontSize: 16 },
  title: { fontSize: 14, color: '#eee', fontWeight: 600, flex: 1 },
  lang: { fontSize: 11, color: '#5b9cf6', background: '#1a2a4a', padding: '2px 8px', borderRadius: 4 },
  source: { fontSize: 11, color: '#666', fontFamily: 'monospace' },
  body: { maxHeight: 320, overflowY: 'auto' as const, marginBottom: 10 },
  text: { margin: 0, fontSize: 13, color: '#ccc', lineHeight: 1.7, whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit' },
  copy: {
    fontSize: 12, color: '#5b9cf6', background: 'transparent',
    border: '1px solid #2a4a6a', borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
  },
};
