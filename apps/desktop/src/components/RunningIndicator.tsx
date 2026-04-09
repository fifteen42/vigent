interface RunningIndicatorProps {
  toolName: string | null;
  toolLabel: string | null;
  actionCount: number;
  contextUsedPercent: number;
}

export function RunningIndicator({ toolName, toolLabel, actionCount, contextUsedPercent }: RunningIndicatorProps) {
  const pct = Math.round(contextUsedPercent * 100);
  const isHigh = pct > 75;
  const barColor = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#5b9cf6';

  return (
    <div style={styles.bar}>
      <div style={styles.spinner} />
      <span style={styles.text}>
        {toolLabel ?? 'Thinking...'}
      </span>
      {actionCount > 0 && (
        <span style={styles.count}>{actionCount} actions</span>
      )}
      {pct > 0 && (
        <div style={styles.budgetWrap} title={`Context: ${pct}% used`}>
          <div style={{ ...styles.budgetBar, width: `${pct}%`, background: barColor }} />
          {isHigh && <span style={{ ...styles.budgetPct, color: barColor }}>{pct}%</span>}
        </div>
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
  budgetWrap: {
    width: 60, height: 4, background: '#dbeafe',
    borderRadius: 2, overflow: 'hidden', position: 'relative', flexShrink: 0,
  },
  budgetBar: { height: '100%', borderRadius: 2, transition: 'width 0.5s ease' },
  budgetPct: { fontSize: 9, position: 'absolute', right: -22, top: -3, fontWeight: 600 },
};
