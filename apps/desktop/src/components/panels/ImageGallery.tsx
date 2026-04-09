import type { ImageGalleryPanel } from '@vigent/core';

export function ImageGallery({ panel }: { panel: ImageGalleryPanel }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🖼</span>
        <span style={styles.title}>Generated Images</span>
        <span style={styles.count}>{panel.urls.length} image{panel.urls.length !== 1 ? 's' : ''}</span>
      </div>
      {panel.prompt && <p style={styles.prompt}>{panel.prompt}</p>}
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
  container: {
    borderRadius: 10, background: '#fff', border: '1px solid #e0e0e0',
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', background: '#f8f8f8', borderBottom: '1px solid #e8e8e8',
  },
  icon: { fontSize: 15 },
  title: { fontSize: 13, color: '#111', fontWeight: 600, flex: 1 },
  count: { fontSize: 11, color: '#aaa' },
  prompt: { fontSize: 13, color: '#666', margin: '10px 14px 0', lineHeight: 1.5 },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 8, padding: 14,
  },
  imgWrap: { display: 'block', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  img: { width: '100%', display: 'block', aspectRatio: '1', objectFit: 'cover' as const },
};
