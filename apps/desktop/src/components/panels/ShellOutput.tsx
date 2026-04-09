import type { ShellOutputPanel } from '@vigent/core';

export function ShellOutput({ panel }: { panel: ShellOutputPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>$</span>
        <code style={styles.cmd}>{panel.command}</code>
      </div>
      {panel.stdout && <pre style={styles.out}>{panel.stdout}</pre>}
      {panel.stderr && <pre style={{ ...styles.out, color: '#dc2626', background: '#fff5f5' }}>{panel.stderr}</pre>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: 10, background: '#1a1a2e', border: '1px solid #2d2d4a',
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', background: '#141426', borderBottom: '1px solid #2d2d4a',
  },
  icon: { color: '#22c55e', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 },
  cmd: { fontSize: 12, color: '#a5b4fc', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' as const },
  out: {
    margin: 0, padding: '10px 12px',
    fontSize: 12, color: '#c8d6ea', fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const, lineHeight: 1.6,
  },
};
