import { useState, useRef, useEffect } from 'react';
import type { AgentPanel } from '@vigent/core';
import { useAgent, type AgentMessage } from './hooks/useAgent';
import { ScreenMirror } from './components/panels/ScreenMirror';
import { VideoProduction } from './components/panels/VideoProduction';
import { Transcript } from './components/panels/Transcript';
import { ImageGallery } from './components/panels/ImageGallery';
import { ShellOutput } from './components/panels/ShellOutput';

export default function App() {
  const { messages, running, error, actionCount, run, stop, clear } = useAgent();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const task = input.trim();
    if (!task || running) return;
    setInput('');
    run(task);
  };

  return (
    <div style={styles.root}>
      {/* Sidebar: messages / activity log */}
      <div style={styles.sidebar}>
        <div style={styles.header}>
          <span style={styles.logo}>Vigent</span>
          {messages.length > 0 && (
            <button style={styles.clearBtn} onClick={clear}>Clear</button>
          )}
        </div>

        <div style={styles.msgList}>
          {messages.length === 0 && (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>What do you want to do?</p>
              <div style={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button key={s} style={styles.suggestion} onClick={() => { setInput(s); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <MessageRow key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Input */}
        <div style={styles.inputRow}>
          <textarea
            style={styles.input}
            value={input}
            placeholder="Describe what you want to do..."
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={2}
          />
          <button
            style={{ ...styles.sendBtn, opacity: running ? 0.5 : 1 }}
            onClick={running ? stop : submit}
          >
            {running ? '■ Stop' : '▶ Run'}
          </button>
        </div>

        {running && (
          <div style={styles.status}>
            <span style={styles.dot} />
            <span>{actionCount} actions taken...</span>
          </div>
        )}
      </div>

      {/* Main panel: Gen UI — shows last panel from the last assistant message */}
      <div style={styles.main}>
        <ActivePanel messages={messages} />
      </div>
    </div>
  );
}

// ── Gen UI dispatcher ──────────────────────────────────────────────────────────

function ActivePanel({ messages }: { messages: AgentMessage[] }) {
  // Find the last assistant message that has a panel
  const panelMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.panel);
  const panel = panelMsg?.panel;

  if (!panel) {
    return (
      <div style={styles.panelEmpty}>
        <p style={{ color: '#444', fontSize: 14 }}>
          The panel appears here when the agent takes action.
        </p>
      </div>
    );
  }

  return <Panel panel={panel} />;
}

function Panel({ panel }: { panel: AgentPanel }) {
  switch (panel.kind) {
    case 'screen_mirror':  return <ScreenMirror panel={panel} />;
    case 'video_production': return <VideoProduction panel={panel} />;
    case 'transcript': return <Transcript panel={panel} />;
    case 'image_gallery': return <ImageGallery panel={panel} />;
    case 'shell_output': return <ShellOutput panel={panel} />;
    case 'audio_player': return (
      <div style={{ padding: 16 }}>
        <audio controls src={panel.localPath} style={{ width: '100%' }} />
        {panel.text && <p style={{ color: '#888', fontSize: 13, marginTop: 10 }}>{panel.text}</p>}
      </div>
    );
    case 'file_output': return (
      <div style={{ padding: 16, color: '#ccc', fontSize: 13 }}>
        <span>📄 {panel.localPath}</span>
        {panel.sizeBytes && <span style={{ color: '#666', marginLeft: 8 }}>({(panel.sizeBytes / 1024).toFixed(1)} KB)</span>}
      </div>
    );
  }
}

// ── Message row ────────────────────────────────────────────────────────────────

function MessageRow({ message }: { message: AgentMessage }) {
  return (
    <div style={{ ...styles.msgRow, justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
      <div style={message.role === 'user' ? styles.userBubble : styles.assistantBubble}>
        {message.text || (message.role === 'assistant' ? <span style={{ color: '#444' }}>thinking...</span> : null)}
      </div>
    </div>
  );
}

// ── Suggestions ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Take a screenshot and describe what you see',
  'Transcribe this audio file: ~/Desktop/recording.m4a',
  'Open Safari and search for "TypeScript 2025 news"',
  'Generate an image of a futuristic Tokyo skyline at night',
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#0d0d0d',
    color: '#eee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  sidebar: {
    width: 340,
    minWidth: 260,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #1e1e1e',
    background: '#0d0d0d',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid #1e1e1e',
  },
  logo: { fontSize: 16, fontWeight: 700, letterSpacing: -0.5, flex: 1, color: '#fff' },
  clearBtn: {
    fontSize: 12, color: '#666', background: 'transparent',
    border: 'none', cursor: 'pointer', padding: '2px 8px',
  },
  msgList: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  msgRow: { display: 'flex' },
  userBubble: {
    background: '#1a1a2e',
    color: '#c7d2fe',
    fontSize: 13,
    lineHeight: 1.5,
    padding: '8px 12px',
    borderRadius: '12px 12px 2px 12px',
    maxWidth: '85%',
    whiteSpace: 'pre-wrap',
  },
  assistantBubble: {
    background: '#141414',
    color: '#ccc',
    fontSize: 13,
    lineHeight: 1.5,
    padding: '8px 12px',
    borderRadius: '12px 12px 12px 2px',
    maxWidth: '90%',
    whiteSpace: 'pre-wrap',
    border: '1px solid #1e1e1e',
  },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 14, color: '#555', marginBottom: 16, textAlign: 'center' },
  suggestions: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  suggestion: {
    fontSize: 12, color: '#888', background: '#161616',
    border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px',
    textAlign: 'left', cursor: 'pointer', lineHeight: 1.4,
  },
  inputRow: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #1e1e1e', alignItems: 'flex-end' },
  input: {
    flex: 1, background: '#141414', border: '1px solid #2a2a2a',
    borderRadius: 10, padding: '8px 12px', color: '#eee',
    fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5,
    fontFamily: 'inherit',
  },
  sendBtn: {
    background: '#5b9cf6', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },
  status: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 16px 10px', fontSize: 12, color: '#666',
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%', background: '#5b9cf6',
    animation: 'pulse 1s ease-in-out infinite',
  },
  error: {
    margin: '0 12px 8px', padding: '8px 12px',
    background: '#1a0a0a', color: '#f87171',
    borderRadius: 8, fontSize: 12, border: '1px solid #3a1a1a',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  panelEmpty: {
    flex: 1, display: 'flex', alignItems: 'center',
    justifyContent: 'center',
  },
};
