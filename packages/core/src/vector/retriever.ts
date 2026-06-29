import { VectorEmbeddingEngine, cosineSimilarity } from './embedding.js';

export interface DocumentChunk {
  id: string;
  filePath: string;
  content: string;
  embedding: number[];
  metadata?: {
    startLine?: number;
    endLine?: number;
    language?: string;
    [key: string]: unknown;
  };
}

export interface RetrievedChunkResult {
  chunk: DocumentChunk;
  score: number;
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export class SemanticCodeRetriever {
  private embeddingEngine: VectorEmbeddingEngine;
  private chunks: DocumentChunk[] = [];

  constructor(embeddingEngine?: VectorEmbeddingEngine) {
    this.embeddingEngine = embeddingEngine ?? new VectorEmbeddingEngine();
  }

  /**
   * Index a single document file by splitting into chunks and embedding them.
   */
  public async addDocument(filePath: string, content: string, options: ChunkingOptions = {}): Promise<void> {
    const chunkSize = options.chunkSize ?? 500;
    const chunkOverlap = options.chunkOverlap ?? 100;
    const rawChunks = this.splitContentIntoChunks(content, chunkSize, chunkOverlap);

    for (let i = 0; i < rawChunks.length; i++) {
      const raw = rawChunks[i];
      const embedding = await this.embeddingEngine.generateEmbedding(raw.text);
      this.chunks.push({
        id: `${filePath}#chunk-${i}`,
        filePath,
        content: raw.text,
        embedding,
        metadata: {
          startLine: raw.startLine,
          endLine: raw.endLine,
          language: this.detectLanguage(filePath),
        },
      });
    }
  }

  /**
   * Bulk add pre-segmented or custom chunks.
   */
  public async addChunks(
    items: Array<{ id: string; filePath: string; content: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    const texts = items.map((item) => item.content);
    const embeddings = await this.embeddingEngine.generateEmbeddings(texts);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      this.chunks.push({
        id: item.id,
        filePath: item.filePath,
        content: item.content,
        embedding: embeddings[i],
        metadata: item.metadata,
      });
    }
  }

  /**
   * Search vector memory for relevant code or documentation chunks based on query similarity.
   */
  public async search(query: string, limit: number = 5, minScore: number = 0.0): Promise<RetrievedChunkResult[]> {
    if (this.chunks.length === 0) return [];

    const queryEmbedding = await this.embeddingEngine.generateEmbedding(query);
    const results: RetrievedChunkResult[] = [];

    for (const chunk of this.chunks) {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        results.push({ chunk, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  public clear(): void {
    this.chunks = [];
  }

  public getChunkCount(): number {
    return this.chunks.length;
  }

  private splitContentIntoChunks(
    content: string,
    chunkSize: number,
    chunkOverlap: number
  ): Array<{ text: string; startLine: number; endLine: number }> {
    const lines = content.split('\n');
    const result: Array<{ text: string; startLine: number; endLine: number }> = [];

    let currentChunkLines: string[] = [];
    let currentChunkCharCount = 0;
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunkLines.push(line);
      currentChunkCharCount += line.length + 1;

      if (currentChunkCharCount >= chunkSize || i === lines.length - 1) {
        const text = currentChunkLines.join('\n');
        const endLine = startLine + currentChunkLines.length - 1;
        result.push({ text, startLine, endLine });

        // Calculate overlap for next chunk
        let overlapLines: string[] = [];
        let overlapChars = 0;
        for (let j = currentChunkLines.length - 1; j >= 0; j--) {
          const l = currentChunkLines[j];
          if (overlapChars + l.length + 1 <= chunkOverlap) {
            overlapLines.unshift(l);
            overlapChars += l.length + 1;
          } else {
            break;
          }
        }

        startLine = endLine - overlapLines.length + 1;
        currentChunkLines = overlapLines;
        currentChunkCharCount = overlapChars;
      }
    }

    return result;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'md':
        return 'markdown';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      default:
        return 'text';
    }
  }
}
