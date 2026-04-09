import type { ShellOutputPanel } from '@vigent/core';

export function ShellOutput({ panel }: { panel: ShellOutputPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>$</span>
        <code style={styles.cmd}>{panel.command}</code>
      </div>
      {panel.stdout && <pre style={styles.out}>{panel.stdout}</pre>}
      {panel.stderr && <pre style={{ ...styles.out, color: '#f87171' }}>{panel.stderr}</pre>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { borderRadius: 10, background: '#0a0a0a', border: '1px solid #2a2a2a', padding: 12 },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  icon: { color: '#22c55e', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 },
  cmd: { fontSize: 12, color: '#ccc', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' as const },
  out: { margin: 0, fontSize: 12, color: '#aaa', fontFamily: 'monospace', whiteSpace: 'pre-wrap' as const, lineHeight: 1.5 },
};
