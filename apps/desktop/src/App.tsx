import { useState, useRef, useEffect } from 'react';
import type { AgentPanel } from '@vigent/core';
import { useAgent, type AgentMessage } from './hooks/useAgent';
import { ScreenMirror } from './components/panels/ScreenMirror';
import { VideoProduction } from './components/panels/VideoProduction';
import { Transcript } from './components/panels/Transcript';
import { ImageGallery } from './components/panels/ImageGallery';
import { ShellOutput } from './components/panels/ShellOutput';
import { Settings } from './components/Settings';
import { PanelHistory } from './components/PanelHistory';
import { RunningIndicator } from './components/RunningIndicator';

export default function App() {
  const { messages, running, error, actionCount, activeTool, panelHistory, run, stop, clear } = useAgent();
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState<number>(-1);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-select the latest panel when new ones arrive
  useEffect(() => {
    if (panelHistory.length > 0) {
      setSelectedPanelIndex(panelHistory.length - 1);
    }
  }, [panelHistory.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cmd+K to clear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!running) clear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [running, clear]);

  const submit = () => {
    const task = input.trim();
    if (!task || running) return;
    setInput('');
    run(task);
  };

  if (showSettings) {
    return <Settings onClose={() => setShowSettings(false)} />;
  }

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.header}>
          <span style={styles.logo}>Vigent</span>
          <div style={styles.headerActions}>
            {messages.length > 0 && (
              <button style={styles.iconBtn} onClick={clear} title="Clear conversation">✕</button>
            )}
            <button style={styles.iconBtn} onClick={() => setShowSettings(true)} title="Settings">⚙</button>
          </div>
        </div>

        <div style={styles.msgList}>
          {messages.length === 0 && (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>What do you want to do?</p>
              <div style={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button key={s} style={styles.suggestion} onClick={() => setInput(s)}>
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

        {/* Active tool indicator */}
        {running && activeTool && (
          <div style={styles.toolActivity}>
            <span style={styles.dot} />
            <span style={styles.toolName}>{TOOL_LABELS[activeTool.name] ?? activeTool.label}</span>
          </div>
        )}

        {/* Action counter */}
        {running && !activeTool && (
          <div style={styles.status}>
            <span style={styles.dot} />
            <span>{actionCount} actions taken...</span>
          </div>
        )}

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
            style={{ ...styles.sendBtn, opacity: running ? 0.85 : 1, background: running ? '#ef4444' : '#5b9cf6' }}
            onClick={running ? stop : submit}
          >
            {running ? '■ Stop' : '▶ Run'}
          </button>
        </div>
      </div>

      {/* Main panel: Gen UI */}
      <div style={styles.main}>
        {running && (
          <RunningIndicator
            toolName={activeTool?.name ?? null}
            toolLabel={TOOL_LABELS[activeTool?.name ?? ''] ?? activeTool?.label ?? null}
            actionCount={actionCount}
          />
        )}
        <PanelHistory
          panels={panelHistory}
          selectedIndex={selectedPanelIndex}
          onSelect={setSelectedPanelIndex}
        />
        {panelHistory.length > 0 && selectedPanelIndex >= 0
          ? <div style={styles.panelContent}>
              <Panel panel={panelHistory[selectedPanelIndex].panel} />
            </div>
          : <ActivePanel messages={messages} />
        }
      </div>
    </div>
  );
}

// Human-readable tool labels for the activity indicator
const TOOL_LABELS: Record<string, string> = {
  screenshot: 'Taking screenshot...',
  screenshot_marked: 'Capturing screen elements...',
  click: 'Clicking...',
  click_element: 'Clicking element...',
  type_text: 'Typing...',
  press_key: 'Pressing key...',
  press_keys: 'Pressing keys...',
  scroll: 'Scrolling...',
  drag: 'Dragging...',
  open_app: 'Opening app...',
  focus_app: 'Focusing app...',
  run_applescript: 'Running AppleScript...',
  run_shell: 'Running command...',
  get_screen_info: 'Getting screen info...',
  get_clipboard: 'Reading clipboard...',
  set_clipboard: 'Writing clipboard...',
  read_file: 'Reading file...',
  write_file: 'Writing file...',
  list_files: 'Listing files...',
  open_file: 'Opening file...',
  transcribe_audio: 'Transcribing audio...',
  generate_video: 'Generating video...',
  generate_image: 'Generating image...',
  tts: 'Synthesizing speech...',
  wait: 'Waiting...',
};

// ── Gen UI dispatcher ──────────────────────────────────────────────────────────

function ActivePanel({ messages }: { messages: AgentMessage[] }) {
  const panelMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.panel);
  const panel = panelMsg?.panel;

  if (!panel) {
    return (
      <div style={styles.panelEmpty}>
        <p style={{ color: '#333', fontSize: 14 }}>
          The panel appears here when the agent takes action.
        </p>
      </div>
    );
  }

  return <Panel panel={panel} />;
}

function Panel({ panel }: { panel: AgentPanel }) {
  switch (panel.kind) {
    case 'screen_mirror':    return <ScreenMirror panel={panel} />;
    case 'video_production': return <VideoProduction panel={panel} />;
    case 'transcript':       return <Transcript panel={panel} />;
    case 'image_gallery':    return <ImageGallery panel={panel} />;
    case 'shell_output':     return <ShellOutput panel={panel} />;
    case 'audio_player': return (
      <div style={{ padding: 20 }}>
        <div style={styles.panelHeader}>
          <span style={{ fontSize: 18 }}>🔊</span>
          <span style={styles.panelTitle}>Audio Output</span>
        </div>
        <audio controls src={panel.localPath} style={{ width: '100%', marginTop: 12 }} />
        {panel.text && <p style={{ color: '#888', fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{panel.text}</p>}
      </div>
    );
    case 'file_output': return (
      <div style={{ padding: 20 }}>
        <div style={styles.panelHeader}>
          <span style={{ fontSize: 18 }}>📄</span>
          <span style={styles.panelTitle}>File Saved</span>
        </div>
        <div style={styles.fileCard}>
          <span style={{ color: '#5b9cf6', fontFamily: 'monospace', fontSize: 13 }}>{panel.localPath}</span>
          {panel.sizeBytes != null && (
            <span style={{ color: '#555', fontSize: 12, marginLeft: 8 }}>
              ({(panel.sizeBytes / 1024).toFixed(1)} KB)
            </span>
          )}
        </div>
      </div>
    );
  }
}

// ── Message row ────────────────────────────────────────────────────────────────

function MessageRow({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ ...styles.msgRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={isUser ? styles.userBubble : styles.assistantBubble}>
        {message.text || (message.role === 'assistant'
          ? <span style={{ color: '#333', fontStyle: 'italic', fontSize: 12 }}>thinking...</span>
          : null)}
      </div>
    </div>
  );
}

// ── Suggestions ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Take a screenshot and describe what you see',
  'Transcribe this audio file: ~/Desktop/recording.m4a',
  'Open Safari and search for "TypeScript 2025 news"',
  'List all files on my Desktop and summarize what I have',
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#f5f5f5',
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  sidebar: {
    width: 320,
    minWidth: 260,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #e0e0e0',
    background: '#ffffff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px',
    borderBottom: '1px solid #e8e8e8',
  },
  logo: { fontSize: 16, fontWeight: 700, letterSpacing: -0.5, flex: 1, color: '#111' },
  headerActions: { display: 'flex', gap: 4 },
  iconBtn: {
    fontSize: 14, color: '#888', background: 'transparent',
    border: 'none', cursor: 'pointer', padding: '4px 8px',
    borderRadius: 6, lineHeight: 1,
  },
  msgList: { flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  msgRow: { display: 'flex' },
  userBubble: {
    background: '#5b9cf6',
    color: '#fff',
    fontSize: 13,
    lineHeight: 1.5,
    padding: '8px 12px',
    borderRadius: '12px 12px 2px 12px',
    maxWidth: '85%',
    whiteSpace: 'pre-wrap',
  },
  assistantBubble: {
    background: '#f0f0f0',
    color: '#1a1a1a',
    fontSize: 13,
    lineHeight: 1.5,
    padding: '8px 12px',
    borderRadius: '12px 12px 12px 2px',
    maxWidth: '90%',
    whiteSpace: 'pre-wrap',
  },
  empty: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  emptyTitle: { fontSize: 13, color: '#888', marginBottom: 14, textAlign: 'center' },
  suggestions: { display: 'flex', flexDirection: 'column', gap: 6, width: '100%' },
  suggestion: {
    fontSize: 12, color: '#555', background: '#f5f5f5',
    border: '1px solid #e0e0e0', borderRadius: 8, padding: '7px 12px',
    textAlign: 'left', cursor: 'pointer', lineHeight: 1.4,
  },
  inputRow: {
    display: 'flex', gap: 8, padding: 10,
    borderTop: '1px solid #e8e8e8', alignItems: 'flex-end',
  },
  input: {
    flex: 1, background: '#f8f8f8', border: '1px solid #e0e0e0',
    borderRadius: 10, padding: '8px 12px', color: '#1a1a1a',
    fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5,
    fontFamily: 'inherit',
  },
  sendBtn: {
    color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  },
  toolActivity: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 12px 6px', fontSize: 11, color: '#5b9cf6',
  },
  toolName: { fontWeight: 500 },
  status: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 12px 6px', fontSize: 11, color: '#999',
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%', background: '#5b9cf6',
    flexShrink: 0,
    animation: 'pulse 1s ease-in-out infinite',
  },
  error: {
    margin: '0 10px 6px', padding: '8px 12px',
    background: '#fff5f5', color: '#dc2626',
    borderRadius: 8, fontSize: 12, border: '1px solid #fecaca',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    background: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
  },
  panelContent: {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
  },
  panelEmpty: {
    flex: 1, display: 'flex', alignItems: 'center',
    justifyContent: 'center',
  },
  panelHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  panelTitle: { fontSize: 14, color: '#111', fontWeight: 600, flex: 1 },
  fileCard: {
    background: '#f0f7ff', border: '1px solid #dbeafe', borderRadius: 8,
    padding: '10px 14px', marginTop: 10,
  },
};
