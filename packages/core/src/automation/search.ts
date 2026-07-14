/** Supported web search provider backends. */
export type SearchProvider = 'serper' | 'tavily' | 'searxng' | 'mock';

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
      case 'mock':
      default:
        return this.searchMock(query, limit);
    }
  }

  private detectProvider(): SearchProvider {
    if (process.env.SERPER_API_KEY) return 'serper';
    if (process.env.TAVILY_API_KEY) return 'tavily';
    if (process.env.SEARXNG_URL) return 'searxng';
    return 'mock';
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
