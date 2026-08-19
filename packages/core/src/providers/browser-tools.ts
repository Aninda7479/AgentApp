/**
 * Lightweight Browser Automation Tools for SuperAgent Extension
 * Enables agents to type into inputs, click buttons, and inspect elements.
 */

import { ToolDefinition } from './ai-engine-types.js';

export interface BrowserToolExecutor {
  (tool: string, input: Record<string, any>): Promise<any>;
}

export function createBrowserAutomationTools(executor: BrowserToolExecutor): ToolDefinition[] {
  return [
    {
      name: 'browser_type_in_element',
      description: 'Type text into an input or textarea element on the active webpage identified by a CSS selector (e.g. "textarea", "input[type=\'text\']", "#answer-input").',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the input or textarea element to type into (e.g. "textarea", "input[placeholder*=\'answer\']", "#answer").'
          },
          text: {
            type: 'string',
            description: 'The exact text string to type into the element.'
          },
          clearFirst: {
            type: 'boolean',
            description: 'Whether to clear existing text in the input before typing. Defaults to true.'
          }
        },
        required: ['selector', 'text']
      },
      execute: async (args: Record<string, any>) => {
        const selector = String(args.selector || '');
        const text = String(args.text || '');
        const clearFirst = args.clearFirst !== false;
        return await executor('type_in_element', { selector, text, clearFirst });
      }
    },
    {
      name: 'browser_click_element',
      description: 'Click a button, link, checkbox, or clickable element on the active webpage identified by a CSS selector (e.g. "button.submit-btn", "button[type=\'submit\']", "#submit-btn").',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the button or element to click (e.g. "button.submit", "button[type=\'submit\']", "#submit").'
          }
        },
        required: ['selector']
      },
      execute: async (args: Record<string, any>) => {
        const selector = String(args.selector || '');
        return await executor('click_element', { selector });
      }
    },
    {
      name: 'browser_get_page_elements',
      description: 'Discover interactive elements (inputs, textareas, buttons, links) on the active webpage with their CSS selectors, text labels, and placeholders.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'Optional CSS selector filter. Defaults to "input, textarea, button, a, [role=\'button\']".'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of elements to return. Defaults to 20.'
          }
        }
      },
      execute: async (args: Record<string, any>) => {
        const selector = args.selector ? String(args.selector) : 'input, textarea, button, a, [role="button"]';
        const limit = typeof args.limit === 'number' ? args.limit : 20;
        return await executor('query_elements', { selector, limit });
      }
    }
  ];
}
