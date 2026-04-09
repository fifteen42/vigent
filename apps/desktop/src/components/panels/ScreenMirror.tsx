import { useState } from 'react';
import type { ScreenMirrorPanel } from '@vigent/core';

export function ScreenMirror({ panel }: { panel: ScreenMirrorPanel }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🖥</span>
        <span style={styles.label}>Screen Capture</span>
        {panel.width > 0 && (
          <span style={styles.dim}>{panel.width}×{panel.height}</span>
        )}
        {panel.elements && panel.elements.length > 0 && (
          <span style={styles.badge}>{panel.elements.length} elements</span>
        )}
        <button style={styles.zoomBtn} onClick={() => setZoomed(z => !z)}>
          {zoomed ? '⊖ Fit' : '⊕ Zoom'}
        </button>
      </div>
      <div style={{ ...styles.imageWrap, overflowX: zoomed ? 'auto' : 'hidden' }}>
        <img
          src={`data:image/jpeg;base64,${panel.base64}`}
          style={{
            ...styles.image,
            width: zoomed ? 'auto' : '100%',
            maxWidth: zoomed ? 'none' : '100%',
            cursor: zoomed ? 'zoom-out' : 'zoom-in',
          }}
          alt="Current screen"
          onClick={() => setZoomed(z => !z)}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    background: '#fff',
    border: '1px solid #e0e0e0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#f8f8f8',
    borderBottom: '1px solid #e8e8e8',
  },
  icon: { fontSize: 13 },
  label: { fontSize: 12, color: '#555', fontWeight: 500, flex: 1 },
  dim: { fontSize: 11, color: '#aaa', fontFamily: 'monospace' },
  badge: {
    fontSize: 11,
    color: '#5b9cf6',
    background: '#eff6ff',
    border: '1px solid #dbeafe',
    padding: '1px 7px',
    borderRadius: 4,
  },
  zoomBtn: {
    fontSize: 11, color: '#888', background: 'transparent',
    border: '1px solid #e0e0e0', borderRadius: 4,
    padding: '1px 6px', cursor: 'pointer',
  },
  imageWrap: { width: '100%' },
  image: { display: 'block' },
};
