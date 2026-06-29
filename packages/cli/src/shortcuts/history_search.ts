export interface HistorySearchOptions {
  caseSensitive?: boolean;
}

export class HistorySearch {
  private history: string[] = [];
  private active: boolean = false;
  private query: string = '';
  private matchedIndices: number[] = [];
  private currentIndex: number = -1;
  private caseSensitive: boolean;

  constructor(initialHistory: string[] = [], options: HistorySearchOptions = {}) {
    this.history = [...initialHistory];
    this.caseSensitive = options.caseSensitive ?? false;
  }

  public addHistory(item: string): void {
    if (!item || item.trim() === '') return;
    if (this.history[this.history.length - 1] !== item) {
      this.history.push(item);
    }
  }

  public getHistory(): string[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
    this.cancelSearch();
  }

  public startSearch(): void {
    this.active = true;
    this.query = '';
    this.updateMatches();
  }

  public cancelSearch(): void {
    this.active = false;
    this.query = '';
    this.matchedIndices = [];
    this.currentIndex = -1;
  }

  public setQuery(query: string): void {
    this.query = query;
    this.updateMatches();
  }

  public nextMatch(): string | null {
    if (this.matchedIndices.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % this.matchedIndices.length;
    return this.getCurrentMatch();
  }

  public previousMatch(): string | null {
    if (this.matchedIndices.length === 0) return null;
    this.currentIndex = (this.currentIndex - 1 + this.matchedIndices.length) % this.matchedIndices.length;
    return this.getCurrentMatch();
  }

  public getCurrentMatch(): string | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.matchedIndices.length) {
      const historyIndex = this.matchedIndices[this.currentIndex];
      return this.history[historyIndex] ?? null;
    }
    return null;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getQuery(): string {
    return this.query;
  }

  public getMatchedCount(): number {
    return this.matchedIndices.length;
  }

  public static fuzzyMatch(query: string, text: string, caseSensitive: boolean = false): boolean {
    if (!query) return true;
    const q = caseSensitive ? query : query.toLowerCase();
    const t = caseSensitive ? text : text.toLowerCase();

    let qIdx = 0;
    for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
      if (t[tIdx] === q[qIdx]) {
        qIdx++;
      }
    }
    return qIdx === q.length;
  }

  private updateMatches(): void {
    this.matchedIndices = [];
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (HistorySearch.fuzzyMatch(this.query, this.history[i], this.caseSensitive)) {
        this.matchedIndices.push(i);
      }
    }
    this.currentIndex = this.matchedIndices.length > 0 ? 0 : -1;
  }
}
