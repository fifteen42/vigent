import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { VigentNativeBridge } from '@vigent/native-swift';
import type { VigentConfig } from '../config.js';
import { MinimaxClient } from '../client/minimax.js';
import { createVisionTools } from './vision.js';
import { createInputTools } from './input.js';
import { createSystemTools } from './system.js';
import { createTimingTools } from './timing.js';
import { createGenerateVideoTool } from './generate-video.js';
import { createGenerateImageTool } from './generate-image.js';
import { createTtsTool } from './tts.js';
import { createTranscribeTool } from './transcribe.js';
import { createFileTools } from './files.js';
import { createNotesTool } from './notes.js';

export interface NativeModules {
  input: typeof import('@vigent/native-input');
  bridge: VigentNativeBridge;
}

export function createAllTools(native: NativeModules, config: VigentConfig): AgentTool[] {
  const tools: AgentTool[] = [
    ...createVisionTools(native.bridge, config),
    ...createInputTools(native.input),
    ...createSystemTools(native.bridge),
    ...createTimingTools(native.bridge),
    ...createFileTools(),
  ];

  // Transcription requires Google API key
  const transcribeTool = createTranscribeTool(config.googleApiKey);
  if (transcribeTool) tools.push(transcribeTool);

  // Generation tools require MiniMax API key
  if (config.minimaxApiKey) {
    const minimax = new MinimaxClient({
      apiKey: config.minimaxApiKey,
      baseUrl: config.minimaxBaseUrl,
    });
    tools.push(
      createGenerateVideoTool(minimax),
      createGenerateImageTool(minimax),
      createTtsTool(minimax),
    );
  }

  return tools;
}

// Computer Use tools — includes file tools, transcription, and notes
export function createComputerUseTools(native: NativeModules, config: VigentConfig): AgentTool[] {
  const tools: AgentTool[] = [
    ...createVisionTools(native.bridge, config),
    ...createInputTools(native.input),
    ...createSystemTools(native.bridge),
    ...createTimingTools(native.bridge),
    ...createFileTools(),
    ...createNotesTool(),
  ];

  // Transcription if Google API key available
  const transcribeTool = createTranscribeTool(config.googleApiKey);
  if (transcribeTool) tools.push(transcribeTool);

  // Generation tools if MiniMax key available
  if (config.minimaxApiKey) {
    const minimax = new MinimaxClient({
      apiKey: config.minimaxApiKey,
      baseUrl: config.minimaxBaseUrl,
    });
    tools.push(
      createGenerateVideoTool(minimax),
      createGenerateImageTool(minimax),
      createTtsTool(minimax),
    );
  }

  return tools;
}

export {
  createVisionTools,
  createInputTools,
  createSystemTools,
  createTimingTools,
  createGenerateVideoTool,
  createGenerateImageTool,
  createTtsTool,
  createTranscribeTool,
  createFileTools,
};
