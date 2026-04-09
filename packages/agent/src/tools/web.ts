import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const MAX_CONTENT = 6_000;

/**
 * Strip HTML tags and collapse whitespace for readable text extraction.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function createWebTools(): AgentTool<any>[] {
  // ── fetch_url ──────────────────────────────────────────────────────────────
  const fetchUrlTool: AgentTool<any> = {
    name: 'fetch_url',
    label: 'Fetch URL',
    description: [
      'Fetch the text content of a web page or URL.',
      'HTML is stripped to plain text. Good for reading articles, documentation, or API responses.',
      'Use this when the user provides a URL or you need to read web content during a task.',
    ].join(' '),
    parameters: Type.Object({
      url: Type.String({ description: 'URL to fetch (must start with http:// or https://)' }),
      selector: Type.Optional(Type.String({
        description: 'Optional: CSS selector to extract a specific section (e.g. "main", "article", "#content")',
      })),
    }),
    execute: async (_id: string, params: any) => {
      const url = params.url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return {
          content: [{ type: 'text' as const, text: 'URL must start with http:// or https://' }],
          details: { error: 'invalid_url' },
        };
      }

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Vigent/0.2',
            'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          return {
            content: [{ type: 'text' as const, text: `HTTP ${response.status}: ${response.statusText}` }],
            details: { status: response.status, url },
          };
        }

        const contentType = response.headers.get('content-type') ?? '';
        const rawText = await response.text();

        let text: string;
        if (contentType.includes('json')) {
          try {
            const json = JSON.parse(rawText);
            text = JSON.stringify(json, null, 2);
          } catch {
            text = rawText;
          }
        } else {
          text = stripHtml(rawText);
        }

        const truncated = text.length > MAX_CONTENT;
        const output = text.slice(0, MAX_CONTENT) + (truncated ? '\n\n...(content truncated)' : '');

        return {
          content: [{ type: 'text' as const, text: output }],
          details: { url, contentType, length: text.length, truncated },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Fetch failed: ${msg}` }],
          details: { error: msg, url },
        };
      }
    },
  };

  // ── search_web ─────────────────────────────────────────────────────────────
  // Uses DuckDuckGo's HTML search (no API key needed)
  const searchWebTool: AgentTool<any> = {
    name: 'search_web',
    label: 'Search Web',
    description: [
      'Search the web using DuckDuckGo. Returns a list of result titles, URLs, and snippets.',
      'Use this to find information, documentation, news, or any web content.',
      'After getting results, use fetch_url to read the full content of a specific page.',
    ].join(' '),
    parameters: Type.Object({
      query: Type.String({ description: 'Search query' }),
      maxResults: Type.Optional(Type.Number({ description: 'Maximum number of results to return (default: 8)' })),
    }),
    execute: async (_id: string, params: any) => {
      const query = encodeURIComponent(params.query);
      const max = Math.min(params.maxResults ?? 8, 15);

      try {
        // DuckDuckGo HTML search
        const response = await fetch(
          `https://html.duckduckgo.com/html/?q=${query}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Vigent/0.2',
              'Accept': 'text/html',
            },
            signal: AbortSignal.timeout(10_000),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extract results from DuckDuckGo HTML
        const results: Array<{ title: string; url: string; snippet: string }> = [];

        // DDG HTML: each result block contains result__a with uddg= redirect URL
        // Pattern: href="//duckduckgo.com/l/?uddg=ENCODED_URL&..."
        const resultBlockPattern = /<h2 class="result__title">\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let match;

        while ((match = resultBlockPattern.exec(html)) !== null && results.length < max) {
          const rawHref = match[1];
          const title = stripHtml(match[2]).trim();
          const snippet = stripHtml(match[3]).trim();

          // Decode the uddg= redirect parameter
          let url = rawHref;
          const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch) {
            try { url = decodeURIComponent(uddgMatch[1]); } catch { continue; }
          } else if (rawHref.startsWith('//')) {
            url = 'https:' + rawHref;
          }

          if (url.startsWith('http') && title) {
            results.push({ title, url, snippet });
          }
        }

        // Fallback: try simpler title-only extraction if snippet pattern didn't match
        if (results.length === 0) {
          const titlePattern = /<a[^>]+href="([^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
          while ((match = titlePattern.exec(html)) !== null && results.length < max) {
            const rawHref = match[1];
            const title = stripHtml(match[2]).trim();
            let url = rawHref;
            const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
            if (uddgMatch) {
              try { url = decodeURIComponent(uddgMatch[1]); } catch { continue; }
            }
            if (url.startsWith('http') && title) {
              results.push({ title, url, snippet: '' });
            }
          }
        }

        if (results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No results found for: ${params.query}` }],
            details: { query: params.query, count: 0 },
          };
        }

        const formatted = results
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}${r.snippet ? '\n   ' + r.snippet : ''}`)
          .join('\n\n');

        return {
          content: [{ type: 'text' as const, text: formatted }],
          details: { query: params.query, count: results.length, results },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Search failed: ${msg}` }],
          details: { error: msg, query: params.query },
        };
      }
    },
  };

  return [fetchUrlTool, searchWebTool];
}
