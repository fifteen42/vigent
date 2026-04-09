import type { WebContentPanel } from '@vigent/core';

export function WebContent({ panel }: { panel: WebContentPanel }) {
  const domain = (() => {
    try { return new URL(panel.url).hostname; } catch { return panel.url; }
  })();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🌐</span>
        <span style={styles.domain}>{domain}</span>
        <a href={panel.url} target="_blank" rel="noreferrer" style={styles.link}>
          Open ↗
        </a>
      </div>
      <div style={styles.url}>{panel.url}</div>
      <div style={styles.body}>
        <pre style={styles.text}>{panel.content}</pre>
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
  icon: { fontSize: 14 },
  domain: { fontSize: 13, color: '#111', fontWeight: 600, flex: 1 },
  link: { fontSize: 12, color: '#5b9cf6', textDecoration: 'none' },
  url: {
    fontSize: 11, color: '#22c55e', fontFamily: 'monospace',
    padding: '4px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0',
  },
  body: { maxHeight: 480, overflowY: 'auto' as const },
  text: {
    margin: 0, padding: '12px 14px',
    fontSize: 12, color: '#444', lineHeight: 1.7,
    whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit',
  },
};
