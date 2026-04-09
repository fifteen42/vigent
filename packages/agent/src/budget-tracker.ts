import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { estimateTokens } from './context-manager.js';
import { AUTOCOMPACT_BUFFER_TOKENS } from './constants.js';

export interface BudgetStatus {
  usedTokens: number;
  maxTokens: number;
  usedPercent: number;
  isApproachingLimit: boolean; // > 90%
  isDiminishing: boolean;      // < 500 tokens remaining
}

export class BudgetTracker {
  private maxTokens: number;

  constructor(contextWindow: number, bufferTokens = AUTOCOMPACT_BUFFER_TOKENS) {
    this.maxTokens = contextWindow - bufferTokens;
  }

  check(messages: AgentMessage[]): BudgetStatus {
    const usedTokens = estimateTokens(messages);
    const usedPercent = usedTokens / this.maxTokens;
    const remaining = this.maxTokens - usedTokens;
    return {
      usedTokens,
      maxTokens: this.maxTokens,
      usedPercent,
      isApproachingLimit: usedPercent > 0.9,
      isDiminishing: remaining < 500,
    };
  }
}
