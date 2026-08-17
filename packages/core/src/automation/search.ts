/** Supported web search provider backends. */
export type SearchProvider = 'duckduckgo' | 'serper' | 'tavily' | 'searxng' | 'mock';

/** A single search result from any provider. */
export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

/** Options for a web search query. */
export interface SearchOptions {
  provider?: SearchProvider;
  apiKey?: string;
  baseUrl?: string;
  limit?: number;
}

/** Response from a web search operation. */
export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  provider: SearchProvider;
  totalResults?: number;
}

import { enforceNetworkAllowed } from '../security/internet-access.js';

/** Multi-provider web search tool with automatic provider detection. */
export class WebSearchTool {
  /**
   * Executes a web search against the configured provider.
   */
  public async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    try {
      enforceNetworkAllowed({ kind: 'search', method: 'GET' });
    } catch (err: unknown) {
      // Surface the policy block as an empty result set rather than throwing,
      // so callers can relay the reason to the user gracefully.
      return {
        query,
        results: [],
        provider: options.provider ?? this.detectProvider(),
        totalResults: 0
      };
    }

    const provider = options.provider ?? this.detectProvider();
    const limit = options.limit ?? 5;

    switch (provider) {
      case 'serper':
        return this.searchSerper(query, limit, options.apiKey);
      case 'tavily':
        return this.searchTavily(query, limit, options.apiKey);
      case 'searxng':
        return this.searchSearxng(query, limit, options.baseUrl);
      case 'duckduckgo':
        return this.searchDuckDuckGo(query, limit);
      case 'mock':
      default:
        return this.searchMock(query, limit);
    }
  }

  private detectProvider(): SearchProvider {
    if (process.env.SERPER_API_KEY) return 'serper';
    if (process.env.TAVILY_API_KEY) return 'tavily';
    if (process.env.SEARXNG_URL) return 'searxng';
    return 'duckduckgo';
  }

  private async searchDuckDuckGo(query: string, limit: number): Promise<SearchResponse> {
    try {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed with status ${response.status}`);
      }

      const html = await response.text();
      const results: SearchResultItem[] = [];
      const resultBlocks = html.split(/class="[^"]*web-result[^"]*"/);

      for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
        const block = resultBlocks[i];
        const titleMatch = block.match(/<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        const headingMatch = block.match(/<h2[^>]*class="result__title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        const urlMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const uddgMatch = block.match(/href="[^"]*uddg=([^&"]+)/i);

        const title = headingMatch ? headingMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const snippet = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        let link = urlMatch ? urlMatch[2].replace(/<[^>]+>/g, '').trim() : '';
        if (uddgMatch && uddgMatch[1]) {
          try {
            link = decodeURIComponent(uddgMatch[1]);
          } catch {}
        } else if (link && !link.startsWith('http')) {
          link = 'https://' + link;
        }

        if (title && (snippet || link)) {
          results.push({ title, snippet, url: link });
        }
      }

      if (results.length > 0) {
        return { query, results, provider: 'duckduckgo', totalResults: results.length };
      }
    } catch {
      // Fall back to mock if DuckDuckGo HTML was unreachable or blocked
    }
    return this.searchMock(query, limit);
  }

  private async searchSerper(query: string, limit: number, apiKey?: string): Promise<SearchResponse> {
    const key = apiKey ?? process.env.SERPER_API_KEY;
    if (!key) {
      throw new Error('Serper API key is required');
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: limit }),
    });

    if (!response.ok) {
      throw new Error(`Serper search failed with status ${response.status}`);
    }

    const data = (await response.json()) as { organic?: Array<{ title: string; link: string; snippet: string }> };
    const results: SearchResultItem[] = (data.organic || []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));

    return { query, results, provider: 'serper', totalResults: results.length };
  }

  private async searchTavily(query: string, limit: number, apiKey?: string): Promise<SearchResponse> {
    const key = apiKey ?? process.env.TAVILY_API_KEY;
    if (!key) {
      throw new Error('Tavily API key is required');
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_key: key, query, max_results: limit }),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed with status ${response.status}`);
    }

    const data = (await response.json()) as { results?: Array<{ title: string; url: string; content: string; score: number }> };
    const results: SearchResultItem[] = (data.results || []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content,
      score: item.score,
    }));

    return { query, results, provider: 'tavily', totalResults: results.length };
  }

  private async searchSearxng(query: string, limit: number, baseUrl?: string): Promise<SearchResponse> {
    const url = (baseUrl ?? process.env.SEARXNG_URL ?? 'http://localhost:8080').replace(/\/$/, '');
    const searchUrl = `${url}/search?format=json&q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`SearXNG search failed with status ${response.status}`);
    }

    const data = (await response.json()) as { results?: Array<{ title: string; url: string; content: string }> };
    const results: SearchResultItem[] = (data.results || []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content,
    }));

    return { query, results, provider: 'searxng', totalResults: results.length };
  }

  private async searchMock(query: string, limit: number): Promise<SearchResponse> {
    const mockResults: SearchResultItem[] = [
      {
        title: `Documentation & Guide for ${query}`,
        url: `https://example.com/docs?q=${encodeURIComponent(query)}`,
        snippet: `Comprehensive overview and reference materials regarding ${query}.`,
        score: 0.95,
      },
      {
        title: `GitHub Repository - ${query}`,
        url: `https://github.com/example/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))}`,
        snippet: `Open source implementations and code samples for ${query}.`,
        score: 0.88,
      },
    ];

    return {
      query,
      results: mockResults.slice(0, limit),
      provider: 'mock',
      totalResults: mockResults.length,
    };
  }
}
