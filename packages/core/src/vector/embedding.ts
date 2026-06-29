export type EmbeddingProvider = 'openai' | 'custom' | 'local';

export interface VectorEmbeddingConfig {
  provider?: EmbeddingProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions?: number;
}

export class VectorEmbeddingEngine {
  private config: VectorEmbeddingConfig;

  constructor(config: VectorEmbeddingConfig = {}) {
    this.config = {
      provider: 'local',
      dimensions: 128,
      model: 'text-embedding-3-small',
      ...config,
    };
  }

  /**
   * Generates a single vector embedding for the given text.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateEmbeddings([text]);
    return results[0];
  }

  /**
   * Generates vector embeddings for a list of text inputs.
   */
  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const provider = this.config.provider ?? 'local';

    if (provider === 'openai') {
      return this.generateOpenAIEmbeddings(texts);
    } else if (provider === 'custom' && this.config.baseUrl) {
      return this.generateCustomEmbeddings(texts);
    } else {
      return texts.map((text) => this.generateLocalEmbedding(text));
    }
  }

  private async generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required for openai embedding provider');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: this.config.model ?? 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding API failed with status ${response.status}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((item) => item.embedding);
  }

  private async generateCustomEmbeddings(texts: string[]): Promise<number[][]> {
    const url = `${this.config.baseUrl?.replace(/\/$/, '')}/embeddings`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: texts, model: this.config.model }),
    });

    if (!response.ok) {
      throw new Error(`Custom embedding API failed with status ${response.status}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((item) => item.embedding);
  }

  /**
   * Deterministic local feature-hashing embedding generator for offline/fast use.
   */
  private generateLocalEmbedding(text: string): number[] {
    const dim = this.config.dimensions ?? 128;
    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase().match(/\w+/g) || [];

    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash |= 0;
      }
      const index = Math.abs(hash) % dim;
      vec[index] += 1;
    }

    return normalizeVector(vec);
  }
}

/**
 * Calculates cosine similarity between two numerical vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalizes a vector to unit length (L2 norm = 1).
 */
export function normalizeVector(vec: number[]): number[] {
  let norm = 0;
  for (const val of vec) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vec.slice();
  return vec.map((val) => val / norm);
}
