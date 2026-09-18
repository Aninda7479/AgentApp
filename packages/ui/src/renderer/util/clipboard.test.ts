import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard, readClipboardText } from './clipboard';

describe('copyToClipboard', () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
      writable: true,
    });
  });

  it('uses navigator.clipboard.writeText when available and successful', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: writeTextMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard('test copy');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('test copy');
  });

  it('falls back to execCommand when navigator.clipboard is undefined (e.g. mobile HTTP)', async () => {
    // Simulate insecure context where navigator.clipboard is undefined
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const mockTextArea = {
      style: {} as Record<string, string>,
      value: '',
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };

    const appendChildMock = vi.fn();
    const removeChildMock = vi.fn();
    const execCommandMock = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis, 'document', {
      value: {
        body: {
          appendChild: appendChildMock,
          removeChild: removeChildMock,
        },
        createElement: vi.fn().mockReturnValue(mockTextArea),
        execCommand: execCommandMock,
        activeElement: null,
      },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard('fallback copy');
    expect(result).toBe(true);
    expect(mockTextArea.value).toBe('fallback copy');
    expect(execCommandMock).toHaveBeenCalledWith('copy');
    expect(appendChildMock).toHaveBeenCalledWith(mockTextArea);
    expect(removeChildMock).toHaveBeenCalledWith(mockTextArea);
    expect(mockTextArea.select).toHaveBeenCalled();
  });

  it('falls back to execCommand when navigator.clipboard.writeText throws an error', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: writeTextMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const mockTextArea = {
      style: {} as Record<string, string>,
      value: '',
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };

    const execCommandMock = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis, 'document', {
      value: {
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        createElement: vi.fn().mockReturnValue(mockTextArea),
        execCommand: execCommandMock,
        activeElement: null,
      },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard('text after rejection');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalled();
    expect(execCommandMock).toHaveBeenCalledWith('copy');
  });

  it('returns false gracefully when both writeText and execCommand fail without throwing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'document', {
      value: {
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        createElement: vi.fn().mockReturnValue({
          style: {},
          value: '',
          setAttribute: vi.fn(),
          focus: vi.fn(),
          select: vi.fn(),
          setSelectionRange: vi.fn(),
        }),
        execCommand: vi.fn().mockImplementation(() => {
          throw new Error('Not allowed');
        }),
        activeElement: null,
      },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard('failed text');
    expect(result).toBe(false);
  });
});

describe('readClipboardText', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('reads text when navigator.clipboard.readText is available', async () => {
    const readTextMock = vi.fn().mockResolvedValue('pasted content');
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          readText: readTextMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const content = await readClipboardText();
    expect(content).toBe('pasted content');
    expect(readTextMock).toHaveBeenCalled();
  });

  it('returns null when navigator.clipboard is undefined without throwing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const content = await readClipboardText();
    expect(content).toBeNull();
  });

  it('returns null when navigator.clipboard.readText throws', async () => {
    const readTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          readText: readTextMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const content = await readClipboardText();
    expect(content).toBeNull();
  });
});
