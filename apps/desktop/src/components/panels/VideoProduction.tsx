import type { VideoProductionPanel } from '@vigent/core';

export function VideoProduction({ panel }: { panel: VideoProductionPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🎬</span>
        <span style={styles.title}>Video Generation</span>
        <StatusBadge status={panel.status} />
      </div>
      {panel.prompt && <p style={styles.prompt}>{panel.prompt}</p>}
      {panel.status === 'generating' && <ProgressBar />}
      {panel.status === 'done' && panel.url && (
        <div style={styles.videoSection}>
          <video
            src={panel.localPath ?? panel.url}
            controls
            style={styles.video}
          />
          <a href={panel.url} target="_blank" rel="noreferrer" style={styles.link}>
            Open URL ↗
          </a>
        </div>
      )}
      {panel.status === 'failed' && (
        <p style={styles.errorMsg}>Generation failed. Try again with a different prompt.</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    generating: { color: '#d97706', bg: '#fffbeb', label: '⏳ Generating...' },
    done:       { color: '#16a34a', bg: '#f0fdf4', label: '✓ Done' },
    failed:     { color: '#dc2626', bg: '#fff5f5', label: '✗ Failed' },
  };
  const s = map[status] ?? { color: '#888', bg: '#f5f5f5', label: status };
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, color: s.color, background: s.bg,
      padding: '2px 8px', borderRadius: 4,
      border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

function ProgressBar() {
  return (
    <div style={styles.progressWrap}>
      <div style={styles.progressTrack}>
        <div style={styles.progressFill} />
      </div>
      <span style={styles.progressLabel}>Working...</span>
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
  prompt: { fontSize: 13, color: '#666', margin: '12px 14px 0', lineHeight: 1.5 },
  progressWrap: { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 },
  progressTrack: {
    flex: 1, height: 4, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', width: '60%', background: '#5b9cf6',
    borderRadius: 2, animation: 'pulse 1.5s ease-in-out infinite',
  },
  progressLabel: { fontSize: 11, color: '#aaa' },
  videoSection: { padding: 14, display: 'flex', flexDirection: 'column' as const, gap: 8 },
  video: { width: '100%', borderRadius: 8, background: '#000' },
  link: { fontSize: 12, color: '#5b9cf6', textDecoration: 'none', alignSelf: 'flex-start' },
  errorMsg: { color: '#dc2626', fontSize: 13, margin: '10px 14px' },
};
