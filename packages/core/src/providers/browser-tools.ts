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
      name: 'browser_get_page_content',
      description: 'Extract and read the updated text content, questions, choices, and structure of the active webpage. Call this whenever the page updates, after clicking buttons/links, or when advancing to the next question in a quiz.',
      parameters: {
        type: 'object',
        properties: {
          maxLength: {
            type: 'number',
            description: 'Maximum characters of page content to return. Defaults to 5000.'
          }
        }
      },
      execute: async (args: Record<string, any>) => {
        const maxLength = typeof args.maxLength === 'number' ? args.maxLength : 5000;
        return await executor('extract_page_content', { maxLength });
      }
    },
    {
      name: 'browser_capture_screenshot',
      description: 'Capture a visual screenshot of the current webpage viewport. Use this when questions contain images, money notes/coins, diagrams, charts, or visual options that cannot be fully understood from HTML text alone.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['png', 'jpeg'],
            description: 'Image format of the screenshot. Defaults to png.'
          }
        }
      },
      execute: async (args: Record<string, any>) => {
        const format = args.format === 'jpeg' ? 'jpeg' : 'png';
        return await executor('capture_screenshot', { format });
      }
    },
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
      description: 'Discover interactive elements (inputs, textareas, buttons, links, clickable divs, answer options) on the active webpage with their CSS selectors, text labels, and placeholders.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'Optional CSS selector filter. Defaults to "input, textarea, button, a, [role=\'button\'], [role=\'radio\'], [role=\'option\'], [onclick], [class*=\'answer\'], [class*=\'choice\'], [class*=\'option\'], [id^=\'adiv\'], [id*=\'next\'], .answer, .btn".'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of elements to return. Defaults to 25.'
          }
        }
      },
      execute: async (args: Record<string, any>) => {
        const selector = args.selector ? String(args.selector) : 'input, textarea, button, a, [role="button"], [role="radio"], [role="option"], [onclick], [class*="answer"], [class*="choice"], [class*="option"], [id^="adiv"], [id*="next"], .answer, .btn';
        const limit = typeof args.limit === 'number' ? args.limit : 25;
        return await executor('query_elements', { selector, limit });
      }
    }
  ];
}
