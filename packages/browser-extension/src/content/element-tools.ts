/**
 * SuperAgent Browser Extension — DOM Element Inspection Tools
 * Provides deep DOM queries, computed style analysis, tree rendering, and visual overlays.
 */

export interface ElementInspectionSummary {
  tag: string;
  id: string;
  classes: string[];
  text: string;
  value?: string;
  visible: boolean;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, string>;
}

export class ContentElementTools {
  public static queryElements(selector: string, limit: number = 20): ElementInspectionSummary[] {
    if (typeof document === 'undefined') {
      return [{
        tag: 'body',
        id: '',
        classes: [],
        text: 'Mock DOM text',
        visible: true,
        rect: { x: 0, y: 0, width: 100, height: 100 },
        attributes: {}
      }];
    }
    const nodes = Array.from(document.querySelectorAll(selector)).slice(0, limit);
    return nodes.map((node) => {
      const el = node as HTMLElement;
      const rect = typeof el.getBoundingClientRect === 'function' 
        ? el.getBoundingClientRect() 
        : { x: 0, y: 0, width: 0, height: 0 };
      const style = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(el)
        : ({} as any);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;

      const attrs: Record<string, string> = {};
      for (const attr of Array.from(el.attributes || [])) {
        attrs[attr.name] = attr.value;
      }

      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        classes: Array.from(el.classList || []),
        text: (el.innerText || el.textContent || '').trim().slice(0, 300),
        value: (el as HTMLInputElement).value,
        visible,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        attributes: attrs
      };
    });
  }

  public static getElementStyles(selector: string): Record<string, string> | null {
    if (typeof document === 'undefined') return { display: 'block' };
    const el = document.querySelector(selector);
    if (!el) return null;
    const computed = window.getComputedStyle(el);
    const result: Record<string, string> = {};

    const keyProps = [
      'display', 'visibility', 'opacity', 'position', 'top', 'right', 'bottom', 'left',
      'zIndex', 'width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'border', 'borderRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight',
      'fontFamily', 'lineHeight', 'textAlign', 'overflow', 'cursor', 'flexDirection',
      'justifyContent', 'alignItems', 'gap', 'gridTemplateColumns'
    ];

    for (const prop of keyProps) {
      result[prop] = computed.getPropertyValue(prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)) || (computed as any)[prop];
    }
    return result;
  }

  public static getElementTree(selector: string = 'body', maxDepth: number = 3): any {
    if (typeof document === 'undefined') {
      return { tag: 'body', childCount: 0 };
    }
    const root = document.querySelector(selector);
    if (!root) return null;

    const buildTree = (el: Element, depth: number): any => {
      if (depth > maxDepth) return { tag: el.tagName.toLowerCase(), truncated: true };
      const children = Array.from(el.children).map(c => buildTree(c, depth + 1));
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        class: el.className ? String(el.className) : undefined,
        childCount: el.children.length,
        children: children.length > 0 ? children : undefined
      };
    };

    return buildTree(root, 1);
  }

  public static getElementAttributes(selector: string): Record<string, string> | null {
    const el = document.querySelector(selector);
    if (!el) return null;
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  public static highlightElement(selector: string, durationMs: number = 3000): boolean {
    const el = document.querySelector(selector) as HTMLElement;
    if (!el) return false;

    const overlay = document.createElement('div');
    const rect = el.getBoundingClientRect();

    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.border = '2px solid #3b82f6';
    overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.18)';
    overlay.style.borderRadius = '4px';
    overlay.style.zIndex = '2147483647';
    overlay.style.pointerEvents = 'none';
    overlay.style.transition = 'opacity 0.3s ease';

    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    }, durationMs);

    return true;
  }

  public static measureElement(selector: string): any {
    const el = document.querySelector(selector) as HTMLElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return {
      boundingClientRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      },
      boxModel: {
        marginTop: style.marginTop,
        marginRight: style.marginRight,
        marginBottom: style.marginBottom,
        marginLeft: style.marginLeft,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        borderTopWidth: style.borderTopWidth,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth
      },
      scroll: {
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight
      }
    };
  }
}
