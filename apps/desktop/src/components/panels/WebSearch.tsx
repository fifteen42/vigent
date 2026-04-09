import type { WebSearchPanel } from '@vigent/core';

export function WebSearch({ panel }: { panel: WebSearchPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🔍</span>
        <span style={styles.title}>Search Results</span>
        <span style={styles.count}>{panel.results.length} results</span>
      </div>
      <div style={styles.queryRow}>
        <span style={styles.queryLabel}>Query:</span>
        <span style={styles.query}>{panel.query}</span>
      </div>
      <div style={styles.results}>
        {panel.results.map((r: { title: string; url: string; snippet: string }, i: number) => (
          <div key={i} style={styles.result}>
            <a href={r.url} target="_blank" rel="noreferrer" style={styles.resultTitle}>
              {r.title}
            </a>
            <div style={styles.resultUrl}>{r.url}</div>
            {r.snippet && <div style={styles.snippet}>{r.snippet}</div>}
          </div>
        ))}
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
  title: { fontSize: 13, color: '#111', fontWeight: 600, flex: 1 },
  count: { fontSize: 11, color: '#aaa' },
  queryRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0',
  },
  queryLabel: { fontSize: 11, color: '#aaa', fontWeight: 500 },
  query: { fontSize: 13, color: '#333' },
  results: { display: 'flex', flexDirection: 'column', maxHeight: 480, overflowY: 'auto' as const },
  result: {
    padding: '10px 14px', borderBottom: '1px solid #f5f5f5',
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  resultTitle: { fontSize: 13, color: '#5b9cf6', textDecoration: 'none', fontWeight: 500, lineHeight: 1.4 },
  resultUrl: { fontSize: 11, color: '#22c55e', fontFamily: 'monospace' },
  snippet: { fontSize: 12, color: '#666', lineHeight: 1.5, marginTop: 2 },
};
