import type { ScreenMirrorPanel } from '@vigent/core';

export function ScreenMirror({ panel }: { panel: ScreenMirrorPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Screen</span>
        {panel.elements && panel.elements.length > 0 && (
          <span style={styles.badge}>{panel.elements.length} elements</span>
        )}
      </div>
      <img
        src={`data:image/jpeg;base64,${panel.base64}`}
        style={styles.image}
        alt="Current screen"
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    background: '#111',
    border: '1px solid #2a2a2a',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#1a1a1a',
    borderBottom: '1px solid #2a2a2a',
  },
  label: { fontSize: 12, color: '#888', fontFamily: 'monospace' },
  badge: {
    fontSize: 11,
    color: '#5b9cf6',
    background: '#1a2a4a',
    padding: '2px 8px',
    borderRadius: 4,
  },
  image: { width: '100%', display: 'block' },
};
