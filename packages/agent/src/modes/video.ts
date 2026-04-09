import { Agent } from '@mariozechner/pi-agent-core';
import { VIDEO_ANALYSIS_SYSTEM_PROMPT } from '../prompts.js';
import { GEMINI_25_PRO, CLAUDE_SONNET } from '../models.js';
import type { VigentConfig } from '../config.js';
import { isShortVideo, videoToImageContents, uploadVideoToGemini, waitForFileActive } from '@vigent/video';

export async function runVideoAnalysis(
  videoPath: string,
  question: string,
  config: VigentConfig,
  forceModel?: 'gemini' | 'claude'
) {
  const shortVideo = await isShortVideo(videoPath);

  if (!shortVideo || forceModel === 'gemini') {
    // Long video or forced Gemini: upload to File API, call Gemini directly
    if (!config.googleApiKey) {
      throw new Error('GOOGLE_API_KEY required for Gemini video analysis.');
    }

    process.stderr.write('[Upload] Uploading video to Gemini File API...\n');
    const uploaded = await uploadVideoToGemini(videoPath, config.googleApiKey, (pct) => {
      process.stderr.write(`[Upload] ${pct}%\r`);
    });
    process.stderr.write('\n[Upload] Waiting for processing...\n');
    const file = await waitForFileActive(uploaded.uri, config.googleApiKey);
    process.stderr.write('[Upload] Ready.\n');

    process.stderr.write(`\n[Model: ${GEMINI_25_PRO.name}]\n\n`);
    await callGeminiDirect(file.uri, file.mimeType, question, config.googleApiKey);
  } else {
    // Short video: extract frames, use Claude
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY required for short video analysis. Use --gemini to force Gemini.');
    }

    process.stderr.write('[Frames] Extracting frames from short video...\n');
    const frames = await videoToImageContents(videoPath, 12);
    process.stderr.write(`[Frames] Extracted ${frames.length} frames.\n`);

    const userContent: any[] = [
      { type: 'text', text: `Video: ${videoPath} (${frames.length} frames extracted)` },
      ...frames,
      { type: 'text', text: question },
    ];

    const agent = new Agent({
      initialState: {
        systemPrompt: VIDEO_ANALYSIS_SYSTEM_PROMPT,
        model: CLAUDE_SONNET,
        tools: [],
        messages: [],
      },
      getApiKey: async (provider: string) => {
        if (provider === 'anthropic') return config.anthropicApiKey;
        return undefined;
      },
    });

    agent.subscribe((event: any) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.type === 'agent_end') {
        process.stdout.write('\n');
      }
    });

    process.stderr.write(`\n[Model: ${CLAUDE_SONNET.name}]\n\n`);
    await agent.prompt({ role: 'user', content: userContent, timestamp: Date.now() } as any);
  }
}

/**
 * Call Gemini generateContent API directly with a File API fileUri.
 * pi-ai doesn't support fileData parts, so we call the REST API directly.
 */
async function callGeminiDirect(
  fileUri: string,
  mimeType: string,
  question: string,
  apiKey: string
) {
  const model = 'gemini-2.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: VIDEO_ANALYSIS_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri, mimeType } },
          { text: question },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  // Parse SSE stream
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) process.stdout.write(text);
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }

  process.stdout.write('\n');
}
