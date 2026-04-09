import type { VideoProductionPanel } from '@vigent/core';

export function VideoProduction({ panel }: { panel: VideoProductionPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🎬</span>
        <span style={styles.title}>Video Generation</span>
        <StatusBadge status={panel.status} />
      </div>
      <p style={styles.prompt}>{panel.prompt}</p>
      {panel.status === 'generating' && <ProgressBar />}
      {panel.status === 'done' && panel.url && (
        <div style={styles.actions}>
          <video src={panel.localPath ?? panel.url} controls style={styles.video} />
          <a href={panel.url} target="_blank" rel="noreferrer" style={styles.link}>
            Open URL ↗
          </a>
        </div>
      )}
      {panel.status === 'failed' && (
        <p style={styles.error}>Generation failed</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    generating: '#f59e0b',
    done: '#22c55e',
    failed: '#ef4444',
  };
  return (
    <span style={{ ...styles.badge, color: colors[status] ?? '#888' }}>
      {status === 'generating' ? '⏳ generating' : status === 'done' ? '✓ done' : '✗ failed'}
    </span>
  );
}

function ProgressBar() {
  return (
    <div style={styles.progressTrack}>
      <div style={styles.progressFill} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { borderRadius: 10, background: '#111', border: '1px solid #2a2a2a', padding: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  icon: { fontSize: 18 },
  title: { fontSize: 14, color: '#eee', fontWeight: 600, flex: 1 },
  badge: { fontSize: 12, fontFamily: 'monospace' },
  prompt: { fontSize: 13, color: '#888', margin: '0 0 12px', lineHeight: 1.5 },
  progressTrack: { height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' },
  progressFill: {
    height: '100%', width: '60%', background: '#5b9cf6',
    borderRadius: 2,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  video: { width: '100%', borderRadius: 6, marginBottom: 8 },
  actions: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  link: { fontSize: 12, color: '#5b9cf6', textDecoration: 'none' },
  error: { color: '#ef4444', fontSize: 13 },
};
