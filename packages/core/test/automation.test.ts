import { describe, it, expect, beforeEach } from 'vitest';
import {
  PlaywrightBrowserEngine,
  WebPageExtractor,
  WebSearchTool,
  VectorEmbeddingEngine,
  cosineSimilarity,
  normalizeVector,
  SemanticCodeRetriever,
  ContextInspector,
} from '../src/index.js';

describe('Automation & Vector Memory Suite (Steps 035 - 040)', () => {
  // Step 035: Playwright Browser Core Engine
  describe('Step 035: PlaywrightBrowserEngine', () => {
    it('should instantiate with default configuration', () => {
      const engine = new PlaywrightBrowserEngine();
      expect(engine.isInitialized()).toBe(false);
    });

    it('should throw clear error when accessing page before initialization', () => {
      const engine = new PlaywrightBrowserEngine();
      expect(() => engine.getPage()).toThrow('Browser engine not initialized');
      expect(() => engine.getContext()).toThrow('Browser context not initialized');
    });

    it('should handle lifecycle initialize and close gracefully if browser binaries are available', async () => {
      const engine = new PlaywrightBrowserEngine({ headless: true });
      try {
        await engine.initialize();
        expect(engine.isInitialized()).toBe(true);
        expect(engine.getPage()).toBeDefined();
        await engine.close();
        expect(engine.isInitialized()).toBe(false);
      } catch (err) {
        // If Chromium binaries are not pre-installed in environment, ensure proper error format is thrown
        expect((err as Error).message).toContain('Failed to initialize Playwright browser core engine');
      }
    }, 20000);
  });

  // Step 036: Web Page Content Extractor & Markdown Converter
  describe('Step 036: WebPageExtractor', () => {
    let extractor: WebPageExtractor;

    beforeEach(() => {
      extractor = new WebPageExtractor();
    });

    it('should extract title, metadata, and convert HTML to clean Markdown', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page Title</title>
            <meta name="description" content="This is a test page description">
            <meta property="og:title" content="OG Test Title">
          </head>
          <body>
            <h1>Main Header</h1>
            <p>Welcome to <strong>SuperAgent</strong> test page. Visit <a href="https://example.com">Example</a>.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
            <pre><code>const code = 100;</code></pre>
            <script>console.log('strip me');</script>
          </body>
        </html>
      `;

      const result = extractor.extractFromHtml(sampleHtml, 'https://test.com');
      expect(result.url).toBe('https://test.com');
      expect(result.title).toBe('Test Page Title');
      expect(result.metadata['description']).toBe('This is a test page description');
      expect(result.markdown).toContain('# Main Header');
      expect(result.markdown).toContain('**SuperAgent**');
      expect(result.markdown).toContain('[Example](https://example.com)');
      expect(result.markdown).toContain('- Item 1');
      expect(result.markdown).toContain('const code = 100;');
      expect(result.markdown).not.toContain('strip me');
    });
  });

  // Step 037: Web Search Tool Integration
  describe('Step 037: WebSearchTool', () => {
    it('should execute mock search when no API keys are provided', async () => {
      const searchTool = new WebSearchTool();
      const response = await searchTool.search('TypeScript automation', { provider: 'mock', limit: 2 });

      expect(response.query).toBe('TypeScript automation');
      expect(response.provider).toBe('mock');
      expect(response.results.length).toBe(2);
      expect(response.results[0].title).toContain('TypeScript automation');
      expect(response.results[0].url).toBeDefined();
    });

    it('should throw descriptive error when live provider key is missing', async () => {
      const searchTool = new WebSearchTool();
      const oldKey = process.env.SERPER_API_KEY;
      delete process.env.SERPER_API_KEY;

      await expect(searchTool.search('test query', { provider: 'serper' })).rejects.toThrow('Serper API key is required');

      if (oldKey) process.env.SERPER_API_KEY = oldKey;
    });
  });

  // Step 038: Vector Memory Embedding Engine
  describe('Step 038: VectorEmbeddingEngine & Vector Utils', () => {
    it('should generate deterministic local embeddings normalized to unit length', async () => {
      const engine = new VectorEmbeddingEngine({ provider: 'local', dimensions: 64 });
      const vector = await engine.generateEmbedding('SuperAgent vector embedding test');

      expect(vector.length).toBe(64);
      let norm = 0;
      for (const val of vector) norm += val * val;
      expect(Math.abs(Math.sqrt(norm) - 1)).toBeLessThan(0.001);
    });

    it('should compute exact cosine similarity between vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [1, 0, 0];
      const vecC = [0, 1, 0];

      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);
      expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0);
    });

    it('should handle vector normalization properly', () => {
      const vec = [3, 4];
      const norm = normalizeVector(vec);
      expect(norm[0]).toBeCloseTo(0.6);
      expect(norm[1]).toBeCloseTo(0.8);
    });
  });

  // Step 039: Semantic Code & Docs Retriever
  describe('Step 039: SemanticCodeRetriever', () => {
    it('should index document content into overlapping chunks and perform semantic similarity search', async () => {
      const retriever = new SemanticCodeRetriever();
      const codeSample = `
        function processUserOrder(orderId: string) {
          console.log("Processing order", orderId);
          return { status: "success", orderId };
        }

        function calculateTax(amount: number) {
          return amount * 0.15;
        }
      `;

      await retriever.addDocument('src/orders.ts', codeSample, { chunkSize: 100, chunkOverlap: 20 });
      expect(retriever.getChunkCount()).toBeGreaterThan(0);

      const results = await retriever.search('calculate tax amount', 2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.filePath).toBe('src/orders.ts');
      expect(results[0].chunk.metadata?.language).toBe('typescript');
    });

    it('should support bulk indexing custom chunks and clearing memory index', async () => {
      const retriever = new SemanticCodeRetriever();
      await retriever.addChunks([
        { id: 'chunk-1', filePath: 'docs/api.md', content: 'REST API documentation for authentication' },
        { id: 'chunk-2', filePath: 'docs/db.md', content: 'Database schema and SQL migrations' },
      ]);

      expect(retriever.getChunkCount()).toBe(2);
      const searchRes = await retriever.search('authentication');
      expect(searchRes[0].chunk.id).toBe('chunk-1');

      retriever.clear();
      expect(retriever.getChunkCount()).toBe(0);
    });
  });

  // Step 040: Context Inspector & Debug Viewer
  describe('Step 040: ContextInspector', () => {
    it('should calculate token distribution and generate formatted context dump report', () => {
      const inspector = new ContextInspector();
      const payload = {
        systemPrompt: 'You are SuperAgent assistant.',
        messages: [
          { role: 'user', content: 'How do I run tests?' },
          { role: 'assistant', content: 'Run npm test in terminal.' },
        ],
        tools: [
          { name: 'terminal_execute', description: 'Run shell command in sandbox' },
        ],
        vectorContext: [
          { source: 'docs/guide.md', content: 'Testing guide section', score: 0.92 },
        ],
      };

      const report = inspector.inspectContext(payload);
      expect(report.totalEstimatedTokens).toBeGreaterThan(0);
      expect(report.tokenDistribution.system).toBeGreaterThan(0);
      expect(report.tokenDistribution.messages).toBeGreaterThan(0);
      expect(report.tokenDistribution.tools).toBeGreaterThan(0);
      expect(report.tokenDistribution.vectorContext).toBeGreaterThan(0);
      expect(report.formattedDump).toContain('CONTEXT DEBUG DUMP');
      expect(report.formattedDump).toContain('SYSTEM PROMPT');
      expect(report.formattedDump).toContain('REGISTERED TOOLS SCHEMAS');
      expect(report.formattedDump).toContain('VECTOR RETRIEVAL CONTEXT');
    });
  });
});
