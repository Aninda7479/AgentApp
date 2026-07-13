import { chromium, Browser, BrowserContext, Page, LaunchOptions } from 'playwright';

/** Configuration for the Playwright-based browser engine. */
export interface BrowserEngineConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  timeout?: number;
  connectToActiveChrome?: boolean;
  chromeDebugPort?: number;
  useUserProfile?: boolean;
  userProfilePath?: string;
}

/** Result of a page navigation action. */
export interface NavigationResult {
  url: string;
  status: number;
  title: string;
}

/** Options for taking a page screenshot. */
export interface ScreenshotOptions {
  fullPage?: boolean;
  type?: 'png' | 'jpeg';
  path?: string;
}

/** Playwright-based browser automation engine with support for persistent contexts and CDP. */
export class PlaywrightBrowserEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserEngineConfig;

  constructor(config: BrowserEngineConfig = {}) {
    this.config = {
      headless: true,
      viewport: { width: 1280, height: 720 },
      timeout: 30000,
      connectToActiveChrome: false,
      chromeDebugPort: 9222,
      useUserProfile: false,
      ...config,
    };
  }

  public async initialize(launchOptions?: LaunchOptions): Promise<void> {
    if (this.browser || this.context) return;
    try {
      if (this.config.connectToActiveChrome) {
        const port = this.config.chromeDebugPort || 9222;
        // Connect directly to already running Chrome via remote-debugging port
        this.browser = await chromium.connectOverCDP(`http://localhost:${port}`);
        
        const contexts = this.browser.contexts();
        if (contexts.length > 0) {
          this.context = contexts[0];
          const pages = this.context.pages();
          this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
        } else {
          this.context = await this.browser.newContext({
            viewport: this.config.viewport,
          });
          this.page = await this.context.newPage();
        }
      } else if (this.config.useUserProfile && this.config.userProfilePath) {
        // Launch a persistent browser context referencing local Chrome user data
        this.context = await chromium.launchPersistentContext(this.config.userProfilePath, {
          headless: this.config.headless,
          viewport: this.config.viewport,
          userAgent: this.config.userAgent,
          ...launchOptions
        });
        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
      } else {
        // Isolated new session
        this.browser = await chromium.launch({
          headless: this.config.headless,
          ...launchOptions,
        });
        this.context = await this.browser.newContext({
          viewport: this.config.viewport,
          userAgent: this.config.userAgent,
        });
        this.page = await this.context.newPage();
      }

      if (this.page && this.config.timeout) {
        this.page.setDefaultTimeout(this.config.timeout);
      }
    } catch (error) {
      throw new Error(`Failed to initialize Playwright browser core engine: ${(error as Error).message}`);
    }
  }

  public getPage(): Page {
    if (!this.page) {
      throw new Error('Browser engine not initialized. Call initialize() first.');
    }
    return this.page;
  }

  public getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call initialize() first.');
    }
    return this.context;
  }

  public async navigate(url: string): Promise<NavigationResult> {
    const page = this.getPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    const status = response ? response.status() : 200;
    const title = await page.title();
    return {
      url: page.url(),
      status,
      title,
    };
  }

  public async takeScreenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    const page = this.getPage();
    return await page.screenshot({
      fullPage: options.fullPage ?? false,
      type: options.type ?? 'png',
      path: options.path,
    });
  }

  public async evaluate<T>(pageFunction: string | ((arg: unknown) => unknown), arg?: unknown): Promise<T> {
    const page = this.getPage();
    return (await page.evaluate(pageFunction as any, arg)) as T;
  }

  public async getHtmlContent(): Promise<string> {
    const page = this.getPage();
    return await page.content();
  }

  public async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  public isInitialized(): boolean {
    return (this.browser !== null && this.browser.isConnected()) || this.context !== null;
  }
}
