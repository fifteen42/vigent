import type { ImageGalleryPanel } from '@vigent/core';

export function ImageGallery({ panel }: { panel: ImageGalleryPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🖼️</span>
        <span style={styles.title}>Generated Images</span>
        <span style={styles.count}>{panel.urls.length}</span>
      </div>
      <p style={styles.prompt}>{panel.prompt}</p>
      <div style={styles.grid}>
        {panel.urls.map((url, i) => (
          <a key={i} href={url} target="_blank" rel="noreferrer" style={styles.imgWrap}>
            <img src={url} alt={`Generated ${i + 1}`} style={styles.img} />
          </a>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { borderRadius: 10, background: '#111', border: '1px solid #2a2a2a', padding: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  icon: { fontSize: 16 },
  title: { fontSize: 14, color: '#eee', fontWeight: 600, flex: 1 },
  count: { fontSize: 12, color: '#888' },
  prompt: { fontSize: 13, color: '#888', margin: '0 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 },
  imgWrap: { display: 'block', borderRadius: 6, overflow: 'hidden' },
  img: { width: '100%', display: 'block', aspectRatio: '1', objectFit: 'cover' as const },
};
