import * as fs from 'fs';
import * as path from 'path';

export interface GalleryItem {
  id: string;
  title: string;
  mediaType: 'image' | 'audio' | 'video' | 'pdf' | 'ppt' | string;
  filePath: string;
  prompt?: string;
  tags: string[];
  createdAt: number;
  sizeBytes: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface GalleryQuery {
  searchTerm?: string;
  mediaType?: string;
  tags?: string[];
  tagMode?: 'all' | 'any';
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

export interface GallerySearchResult {
  items: GalleryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface GalleryIndexerOptions {
  persistenceFilePath?: string;
}

export class MediaGalleryIndexer {
  private itemsMap: Map<string, GalleryItem> = new Map();
  private persistenceFilePath?: string;

  constructor(options: GalleryIndexerOptions = {}) {
    this.persistenceFilePath = options.persistenceFilePath;
    if (this.persistenceFilePath && fs.existsSync(this.persistenceFilePath)) {
      this.loadFromDisk();
    }
  }

  /**
   * Add or update a media item in the searchable gallery index.
   */
  indexItem(itemInit: Omit<GalleryItem, 'createdAt'> & { createdAt?: number }): GalleryItem {
    const item: GalleryItem = {
      ...itemInit,
      createdAt: itemInit.createdAt ?? Date.now()
    };

    this.itemsMap.set(item.id, item);
    this.saveToDisk();
    return item;
  }

  /**
   * Remove a media asset from the index by ID.
   */
  removeItem(id: string): boolean {
    const existed = this.itemsMap.delete(id);
    if (existed) {
      this.saveToDisk();
    }
    return existed;
  }

  /**
   * Get a specific gallery item by ID.
   */
  getItem(id: string): GalleryItem | undefined {
    return this.itemsMap.get(id);
  }

  /**
   * Query and search the media gallery based on keyword, type, tags, and date range.
   */
  search(query: GalleryQuery = {}): GallerySearchResult {
    let results = Array.from(this.itemsMap.values());

    if (query.mediaType) {
      const typeLower = query.mediaType.toLowerCase();
      results = results.filter(i => i.mediaType.toLowerCase() === typeLower);
    }

    if (query.searchTerm && query.searchTerm.trim() !== '') {
      const term = query.searchTerm.toLowerCase().trim();
      results = results.filter(i => {
        const matchTitle = i.title.toLowerCase().includes(term);
        const matchPrompt = i.prompt ? i.prompt.toLowerCase().includes(term) : false;
        const matchTag = i.tags.some(t => t.toLowerCase().includes(term));
        return matchTitle || matchPrompt || matchTag;
      });
    }

    if (query.tags && query.tags.length > 0) {
      const filterTags = query.tags.map(t => t.toLowerCase());
      const tagMode = query.tagMode || 'any';
      results = results.filter(i => {
        const itemTagsLower = i.tags.map(t => t.toLowerCase());
        if (tagMode === 'all') {
          return filterTags.every(ft => itemTagsLower.includes(ft));
        }
        return filterTags.some(ft => itemTagsLower.includes(ft));
      });
    }

    if (query.startDate !== undefined) {
      results = results.filter(i => i.createdAt >= query.startDate!);
    }

    if (query.endDate !== undefined) {
      results = results.filter(i => i.createdAt <= query.endDate!);
    }

    // Sort by newest first
    results.sort((a, b) => b.createdAt - a.createdAt);

    const total = results.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const paginated = results.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      limit,
      offset
    };
  }

  /**
   * Extract all unique tags present across all indexed media items.
   */
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const item of this.itemsMap.values()) {
      for (const tag of item.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }

  /**
   * Get aggregate statistics on indexed assets.
   */
  getStats(): { totalAssets: number; totalSizeBytes: number; byType: Record<string, number> } {
    let totalSizeBytes = 0;
    const byType: Record<string, number> = {};

    for (const item of this.itemsMap.values()) {
      totalSizeBytes += item.sizeBytes;
      byType[item.mediaType] = (byType[item.mediaType] || 0) + 1;
    }

    return {
      totalAssets: this.itemsMap.size,
      totalSizeBytes,
      byType
    };
  }

  /**
   * Clear all items from gallery index.
   */
  clear(): void {
    this.itemsMap.clear();
    this.saveToDisk();
  }

  private saveToDisk(): void {
    if (!this.persistenceFilePath) {
      return;
    }
    try {
      const dir = path.dirname(this.persistenceFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.itemsMap.values());
      fs.writeFileSync(this.persistenceFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Ignore write errors in fallback scenarios
    }
  }

  private loadFromDisk(): void {
    if (!this.persistenceFilePath || !fs.existsSync(this.persistenceFilePath)) {
      return;
    }
    try {
      const content = fs.readFileSync(this.persistenceFilePath, 'utf8');
      const items = JSON.parse(content) as GalleryItem[];
      this.itemsMap.clear();
      for (const item of items) {
        this.itemsMap.set(item.id, item);
      }
    } catch {
      // Ignore read errors
    }
  }
}
