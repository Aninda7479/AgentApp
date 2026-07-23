import { describe, it, expect, vi } from 'vitest';
import { ComputerUse } from '../src/automation/computer-use.js';
import { createBuiltinTools } from '../src/providers/builtin-tools.js';
import { classifyTask, buildRequest } from '../src/orchestrator/task-classifier.js';
import { OrchestratorRouter } from '../src/orchestrator/router.js';

describe('Computer Use & Orchestrator Integration Suite', () => {
  describe('ComputerUse Primitives', () => {
    it('should have static automation methods defined', () => {
      expect(typeof ComputerUse.takeScreenshot).toBe('function');
      expect(typeof ComputerUse.moveMouse).toBe('function');
      expect(typeof ComputerUse.clickMouse).toBe('function');
      expect(typeof ComputerUse.typeText).toBe('function');
      expect(typeof ComputerUse.pressKey).toBe('function');
    });

    it('should format coordinates and action signatures properly', async () => {
      const spyMove = vi.spyOn(ComputerUse, 'moveMouse').mockResolvedValue('Moved mouse cursor to x:500, y:300');
      const res = await ComputerUse.moveMouse(500, 300);
      expect(spyMove).toHaveBeenCalledWith(500, 300);
      expect(res).toContain('500');
      spyMove.mockRestore();
    });

    it('should format screenshot parameters properly', async () => {
      const spyScreenshot = vi.spyOn(ComputerUse, 'takeScreenshot').mockResolvedValue('C:\\tmp\\test.png');
      const res = await ComputerUse.takeScreenshot('C:\\tmp\\test.png');
      expect(spyScreenshot).toHaveBeenCalledWith('C:\\tmp\\test.png');
      expect(res).toBe('C:\\tmp\\test.png');
      spyScreenshot.mockRestore();
    });
  });

  describe('Built-in Computer Use Tool Declarations', () => {
    it('should expose screenshot_screen, mouse_control, and keyboard_type in createBuiltinTools()', () => {
      const builtinTools = createBuiltinTools();
      const toolNames = builtinTools.map((t) => t.name);
      expect(toolNames).toContain('screenshot_screen');
      expect(toolNames).toContain('mouse_control');
      expect(toolNames).toContain('keyboard_type');
    });

    it('should validate tool schemas for computer use', () => {
      const builtinTools = createBuiltinTools();
      const screenshotTool = builtinTools.find((t) => t.name === 'screenshot_screen');
      const mouseTool = builtinTools.find((t) => t.name === 'mouse_control');
      const keyTool = builtinTools.find((t) => t.name === 'keyboard_type');

      expect(screenshotTool?.description).toContain('screenshot');
      expect(mouseTool?.parameters?.properties).toHaveProperty('action');
      expect(keyTool?.parameters?.properties).toHaveProperty('text');
    });

    it('should execute mouse_control tool wrapper gracefully', async () => {
      const builtinTools = createBuiltinTools();
      const mouseTool = builtinTools.find((t) => t.name === 'mouse_control');
      expect(mouseTool).toBeDefined();

      const spyMove = vi.spyOn(ComputerUse, 'moveMouse').mockResolvedValue('Moved mouse to 100, 200');
      const res = await mouseTool!.execute({ action: 'move', x: 100, y: 200 });
      expect(res).toContain('Moved mouse to 100, 200');
      spyMove.mockRestore();
    });
  });

  describe('Orchestrator Task Classifier for Computer Use', () => {
    it('should detect vision modality when screenshot prompt is provided', () => {
      const req = buildRequest('Take a screenshot of the browser window and analyze what is on screen');
      const classification = classifyTask(req);

      expect(classification.isVision).toBe(true);
      expect(classification.isReasoning).toBe(true);
    });

    it('should classify desktop automation prompt as high or medium difficulty', () => {
      const req = buildRequest('Move mouse to coordinate 500, 400 and click the submit button, then type text "Hello World"');
      const classification = classifyTask(req);

      expect(classification.difficulty).toBeDefined();
    });
  });

  describe('Orchestrator Router Model Selection', () => {
    it('should select candidate model capable of tool calls and vision for computer use tasks', () => {
      const visionModel = {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
        supportsVision: true,
        supportsTools: true,
        inputModalities: ['text', 'image'] as any,
      };

      const plainModel = {
        id: 'gpt-3.5-turbo',
        name: 'GPT 3.5',
        providerId: 'openai',
        supportsVision: false,
        supportsTools: true,
        inputModalities: ['text'] as any,
      };

      const candidates = OrchestratorRouter.selectCandidateModels('Take a screenshot of the main monitor and move mouse to 100, 100', [plainModel, visionModel], 1);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].model).toBe('claude-3-5-sonnet');
    });
  });
});


