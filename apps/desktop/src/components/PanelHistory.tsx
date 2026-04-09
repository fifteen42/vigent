import type { AgentPanel } from '@vigent/core';

const PANEL_KIND_LABELS: Record<string, string> = {
  screen_mirror: '🖥 Screen',
  video_production: '🎬 Video',
  transcript: '📝 Transcript',
  image_gallery: '🖼 Images',
  audio_player: '🔊 Audio',
  shell_output: '$ Shell',
  file_output: '📄 File',
};

interface PanelEntry {
  panel: AgentPanel;
  ts: number;
}

interface PanelHistoryProps {
  panels: PanelEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function PanelHistory({ panels, selectedIndex, onSelect }: PanelHistoryProps) {
  if (panels.length <= 1) return null;

  return (
    <div style={styles.root}>
      {panels.map((entry, i) => (
        <button
          key={entry.ts}
          style={{
            ...styles.chip,
            background: i === selectedIndex ? '#5b9cf6' : '#f0f0f0',
            color: i === selectedIndex ? '#fff' : '#555',
            border: i === selectedIndex ? '1px solid #5b9cf6' : '1px solid #e0e0e0',
          }}
          onClick={() => onSelect(i)}
        >
          {PANEL_KIND_LABELS[entry.panel.kind] ?? entry.panel.kind}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexWrap: 'wrap', gap: 4,
    padding: '8px 16px', borderBottom: '1px solid #e8e8e8',
    background: '#fff',
  },
  chip: {
    fontSize: 11, fontWeight: 500, borderRadius: 6,
    padding: '3px 10px', cursor: 'pointer', border: 'none',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap',
  },
};
