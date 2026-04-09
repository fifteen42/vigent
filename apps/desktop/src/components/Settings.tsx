import { useState, useEffect } from 'react';

const AGENT_URL = 'http://localhost:3457';

interface HealthInfo {
  status: string;
  model: string;
  version: string;
  busy: boolean;
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${AGENT_URL}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(e => setHealthError(String(e)));
  }, []);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onClose}>← Back</button>
        <span style={styles.title}>Settings</span>
      </div>

      <div style={styles.content}>
        {/* Agent Status */}
        <Section title="Agent Status">
          {healthError ? (
            <StatusRow label="Connection" value="Cannot connect to agent" error />
          ) : health ? (
            <>
              <StatusRow label="Status" value={health.busy ? 'Busy' : 'Ready'} ok={!health.busy} />
              <StatusRow label="Version" value={health.version} />
              <StatusRow label="Model" value={health.model} />
            </>
          ) : (
            <StatusRow label="Status" value="Checking..." />
          )}
        </Section>

        {/* API Keys */}
        <Section title="API Keys">
          <p style={styles.hint}>
            API keys are read from environment variables when the agent starts. Set them in your shell profile
            and restart the app.
          </p>
          <EnvVar name="ANTHROPIC_API_KEY" description="Claude — used for computer use tasks" required />
          <EnvVar name="GOOGLE_API_KEY" description="Gemini — used for audio/video transcription" />
          <EnvVar name="MINIMAX_API_KEY" description="MiniMax — used for video/image generation and TTS" />
        </Section>

        {/* Model Selection */}
        <Section title="Model Presets">
          <p style={styles.hint}>
            Set <code style={styles.code}>VIGENT_MODEL</code> environment variable to one of:
          </p>
          <ModelRow name="balanced" desc="claude-3-5-sonnet — fast and capable (default)" />
          <ModelRow name="best" desc="claude-opus-4-5 — most capable, slower" />
          <ModelRow name="fast" desc="claude-haiku-4-5 — fastest, lower cost" />
          <ModelRow name="gemini" desc="gemini-2.5-pro — Google's best model" />
          <ModelRow name="local" desc="gemma3 via Ollama — runs entirely locally" />
        </Section>

        {/* Shortcuts */}
        <Section title="Keyboard Shortcuts">
          <ShortcutRow keys="Enter" desc="Send message" />
          <ShortcutRow keys="Shift + Enter" desc="New line in input" />
          <ShortcutRow keys="⌘ K" desc="Clear conversation" />
        </Section>

        <Section title="CLI Commands">
          <p style={styles.hint}>Use the <code style={styles.code}>vigent</code> CLI from your terminal:</p>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#555', background: '#f5f5f5', padding: 12, borderRadius: 8, lineHeight: 2, marginTop: 8 }}>
            <div>vigent run "take screenshot and describe it"</div>
            <div>vigent transcribe ~/Desktop/recording.m4a</div>
            <div>vigent generate image "futuristic Tokyo"</div>
            <div>vigent sessions   <span style={{ color: '#aaa' }}># list recent runs</span></div>
            <div>vigent info       <span style={{ color: '#aaa' }}># check config</span></div>
          </div>
        </Section>

        {/* About */}
        <Section title="About Vigent">
          <p style={styles.hint}>
            Vigent is an open-source multimodal agent for macOS. It can see your screen, control
            your computer, generate images and video, and transcribe audio — all orchestrated by a
            large language model.
          </p>
          <p style={styles.hint}>
            <a
              href="https://github.com/fifteen42/vigent"
              target="_blank"
              rel="noreferrer"
              style={styles.link}
            >
              github.com/fifteen42/vigent ↗
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

function StatusRow({ label, value, ok, error }: { label: string; value: string; ok?: boolean; error?: boolean }) {
  const color = error ? '#dc2626' : ok === true ? '#16a34a' : ok === false ? '#f59e0b' : '#666';
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={{ ...styles.rowValue, color }}>{value}</span>
    </div>
  );
}

function EnvVar({ name, description, required }: { name: string; description: string; required?: boolean }) {
  return (
    <div style={styles.envRow}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <code style={styles.code}>{name}</code>
        {required && <span style={styles.badge}>required</span>}
      </div>
      <p style={styles.envDesc}>{description}</p>
    </div>
  );
}

function ModelRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div style={styles.row}>
      <code style={{ ...styles.code, color: '#5b9cf6' }}>{name}</code>
      <span style={{ ...styles.rowValue, color: '#666' }}>{desc}</span>
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div style={styles.row}>
      <code style={styles.kbd}>{keys}</code>
      <span style={{ ...styles.rowValue, color: '#666' }}>{desc}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', background: '#ffffff', color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px', borderBottom: '1px solid #e8e8e8',
  },
  backBtn: {
    fontSize: 13, color: '#5b9cf6', background: 'transparent',
    border: 'none', cursor: 'pointer', padding: '4px 0',
  },
  title: { fontSize: 15, fontWeight: 600, flex: 1 },
  content: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 24 },
  section: {},
  sectionTitle: { fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sectionBody: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' },
  rowLabel: { fontSize: 13, color: '#555', width: 80, flexShrink: 0 },
  rowValue: { fontSize: 13, flex: 1 },
  hint: { fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 },
  link: { color: '#5b9cf6', textDecoration: 'none' },
  envRow: { display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0', borderBottom: '1px solid #f0f0f0' },
  envDesc: { fontSize: 12, color: '#888', margin: '2px 0 0 0' },
  code: { fontFamily: 'monospace', fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4, color: '#333' },
  badge: {
    fontSize: 10, color: '#dc2626', background: '#fff5f5',
    border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px',
  },
  kbd: {
    fontFamily: 'monospace', fontSize: 12, background: '#f0f0f0',
    padding: '2px 8px', borderRadius: 4, color: '#333',
    border: '1px solid #e0e0e0', boxShadow: '0 1px 0 #ccc',
  },
};
