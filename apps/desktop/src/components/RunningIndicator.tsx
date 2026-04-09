interface RunningIndicatorProps {
  toolName: string | null;
  toolLabel: string | null;
  actionCount: number;
}

export function RunningIndicator({ toolName, toolLabel, actionCount }: RunningIndicatorProps) {
  return (
    <div style={styles.bar}>
      <div style={styles.spinner} />
      <span style={styles.text}>
        {toolLabel ?? 'Thinking...'}
      </span>
      {actionCount > 0 && (
        <span style={styles.count}>{actionCount} actions</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 16px',
    background: '#eff6ff',
    borderBottom: '1px solid #dbeafe',
    flexShrink: 0,
  },
  spinner: {
    width: 10, height: 10,
    borderRadius: '50%',
    border: '2px solid #93c5fd',
    borderTopColor: '#3b82f6',
    animation: 'spin 0.7s linear infinite',
    flexShrink: 0,
  },
  text: { fontSize: 12, color: '#2563eb', fontWeight: 500, flex: 1 },
  count: { fontSize: 11, color: '#93c5fd' },
};
