/** Configuration options for history search behavior. */
export interface HistorySearchOptions {
  caseSensitive?: boolean;
}

/** Fuzzy search engine over command history with match navigation. */
export class HistorySearch {
  private history: string[] = [];
  private active: boolean = false;
  private query: string = '';
  private matchedIndices: number[] = [];
  private currentIndex: number = -1;
  private caseSensitive: boolean;

  /**
   * Creates a new HistorySearch instance.
   * @param initialHistory - Pre-populated history entries
   * @param options - Search options (case sensitivity, etc.)
   */
  constructor(initialHistory: string[] = [], options: HistorySearchOptions = {}) {
    this.history = [...initialHistory];
    this.caseSensitive = options.caseSensitive ?? false;
  }

  /** Appends an item to history if non-empty and not a duplicate of the last entry. */
  public addHistory(item: string): void {
    if (!item || item.trim() === '') return;
    if (this.history[this.history.length - 1] !== item) {
      this.history.push(item);
    }
  }

  /** Returns a shallow copy of the full history. */
  public getHistory(): string[] {
    return [...this.history];
  }

  /** Clears all history entries and cancels any active search. */
  public clearHistory(): void {
    this.history = [];
    this.cancelSearch();
  }

  /** Activates search mode and resets the query. */
  public startSearch(): void {
    this.active = true;
    this.query = '';
    this.updateMatches();
  }

  /** Deactivates search mode and clears state. */
  public cancelSearch(): void {
    this.active = false;
    this.query = '';
    this.matchedIndices = [];
    this.currentIndex = -1;
  }

  /** Updates the search query and recalculates matches. */
  public setQuery(query: string): void {
    this.query = query;
    this.updateMatches();
  }

  /** Advances to the next match (wraps around) and returns the matched text. */
  public nextMatch(): string | null {
    if (this.matchedIndices.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % this.matchedIndices.length;
    return this.getCurrentMatch();
  }

  /** Moves to the previous match (wraps around) and returns the matched text. */
  public previousMatch(): string | null {
    if (this.matchedIndices.length === 0) return null;
    this.currentIndex = (this.currentIndex - 1 + this.matchedIndices.length) % this.matchedIndices.length;
    return this.getCurrentMatch();
  }

  /** Returns the text of the current match, or null if no match. */
  public getCurrentMatch(): string | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.matchedIndices.length) {
      const historyIndex = this.matchedIndices[this.currentIndex];
      return this.history[historyIndex] ?? null;
    }
    return null;
  }

  /** Returns true if search mode is currently active. */
  public isActive(): boolean {
    return this.active;
  }

  /** Returns the current search query string. */
  public getQuery(): string {
    return this.query;
  }

  /** Returns the number of currently matched entries. */
  public getMatchedCount(): number {
    return this.matchedIndices.length;
  }

  /**
   * Performs fuzzy substring matching: all query chars appear in order within text.
   * @param query - Search characters to find
   * @param text - Text to search within
   * @param caseSensitive - Whether matching is case-sensitive
   */
  public static fuzzyMatch(query: string, text: string, caseSensitive: boolean = false): boolean {
    if (!query) return true;
    const q = caseSensitive ? query : query.toLowerCase();
    const t = caseSensitive ? text : text.toLowerCase();

    let qIdx = 0;
    // Walk text once; advance query index when characters match (subsequence match)
    for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
      if (t[tIdx] === q[qIdx]) {
        qIdx++;
      }
    }
    return qIdx === q.length;
  }

  /** Recomputes matched indices by scanning history in reverse (most recent first). */
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
