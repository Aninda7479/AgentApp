/**
 * `AgentSimulator` — the demo-mode agent. When no real provider credentials are
 * configured, `handleSendPrompt` falls back to this so the UI still shows a
 * believable thought → tool_call → assistant flow. It is a faithful port of the
 * original `simulateAgentResponse`: it branches on prompt keywords and streams
 * scripted steps via timers, updating the trajectory live and persisting.
 *
 * Behavior is identical to before — only the code now lives in a documented
 * class instead of inside the React component.
 */
import type { AppContext, TrajectoryStep } from './types';
import { StepFactory } from './steps';
import { FormatService } from './format';

export class AgentSimulator {
  /**
   * Runs the simulated agent response for a prompt. `initialSteps` are the steps
   * already on the chat (user + attachments + initial thought). `savedAttachments`
   * drive the attachment-aware branches; `startTime` anchors the worked-duration.
   */
  static run(
    ctx: AppContext,
    prompt: string,
    chatId: string,
    initialSteps: TrajectoryStep[],
    projectScope: string,
    _selectedModel: string,
    savedAttachments: { filename: string; fullPath: string }[] = [],
    startTime: number = Date.now()
  ): void {
    if (ctx.getActiveChatId() === chatId) {
      ctx.setIsGenerating(true);
    }
    let currentSteps = [...initialSteps];

    // Finalizes the simulation: stamps the worked duration, stops the run, and persists.
    const finalizeSimulation = (nextSteps: TrajectoryStep[]) => {
      currentSteps = nextSteps;
      const workedDuration = FormatService.formatWorkedDuration(Date.now() - startTime);
      const completedSteps = FormatService.stampWorkedDuration(nextSteps, workedDuration);
      if (ctx.getActiveChatId() === chatId) {
        ctx.setTrajectorySteps(completedSteps);
      }
      ctx.setChats((prev) => {
        const next = prev.map((c) => (c.id === chatId ? { ...c, steps: completedSteps, isRunning: false } : c));
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
        return next;
      });
      if (ctx.getActiveChatId() === chatId) {
        ctx.setIsGenerating(false);
      }
    };

    // Appends/replaces steps mid-simulation (keeps the run "running") and persists.
    const updateChatSteps = (nextSteps: TrajectoryStep[]) => {
      currentSteps = nextSteps;
      if (ctx.getActiveChatId() === chatId) {
        ctx.setTrajectorySteps(nextSteps);
      }
      ctx.setChats((prev) => {
        const next = prev.map((c) => {
          if (c.id !== chatId) return c;
          return { ...c, steps: nextSteps, isRunning: true, startedAt: c.startedAt || startTime };
        });
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
        return next;
      });
    };

    setTimeout(() => {
      const lower = prompt.toLowerCase();
      const isSummarizeRequest = lower.includes('summarise') || lower.includes('summary') || lower.includes('summarize');

      if (savedAttachments.length > 0) {
        // ── Attachment-aware branch ──
        const fileNamesList = savedAttachments.map((a) => `\`${a.filename}\``).join(', ');
        const firstFile = savedAttachments[0];

        updateChatSteps([
          ...currentSteps,
          StepFactory.thoughtStep(
            isSummarizeRequest
              ? `Detected document summary request for ${firstFile.filename}. Invoking document reader and layout parser to extract text contents...`
              : `Detected ${savedAttachments.length} uploaded attachment(s): [${fileNamesList}]. Invoking parsing pipeline to inspect file data and structure...`
          )
        ]);

        setTimeout(() => {
          const isImage = firstFile.filename.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
          updateChatSteps([
            ...currentSteps,
            StepFactory.toolCallStep(
              isSummarizeRequest ? 'view_file' : isImage ? 'generate_image' : 'replace_file_content',
              isSummarizeRequest
                ? `Successfully parsed text contents from ${firstFile.filename}. Extracted 23 pages of text.`
                : isImage
                ? `Inspected image visual layout coordinates in ${firstFile.filename}. Visual inspection completed.`
                : `Successfully parsed document content from ${firstFile.filename}. Matched reference symbols with local project index.`,
              'success'
            )
          ]);

          setTimeout(() => {
            let contentResult = '';
            if (isSummarizeRequest) {
              contentResult = `Here is a summary of the parsed document **${firstFile.filename}**:

### 📘 Overview
This is a demo-mode summary. Connect a real AI provider in **Settings → Providers** to generate an accurate, content-aware summary of your document.

### 🔑 What a live summary includes
- **Key points** extracted from the document's text.
- **Section-by-section breakdown** of the main topics.
- **Action items** or conclusions identified in the content.

Once a provider (OpenAI, Anthropic, Gemini, DeepSeek, or a local Ollama model) is configured, the assistant reads the file directly and returns a grounded summary instead of this placeholder.`;
            } else {
              contentResult = `I have parsed the attached file **${firstFile.filename}**.\n\n${
                isImage
                  ? `Visual inspection confirms that the layout coordinates and pixel alignments are rendered correctly. The details are registered to guide our modifications.`
                  : `Document specifications are registered. I will align the local code modifications with these requirements.`
              }`;
            }

            finalizeSimulation([
              ...currentSteps,
              StepFactory.assistantStep(contentResult)
            ]);
          }, 1200);
        }, 1200);
      } else if (isSummarizeRequest) {
        // ── Summarize request, no attachment ──
        updateChatSteps([
          ...currentSteps,
          StepFactory.thoughtStep('No attachments found. Checking active workspace files for text logs or document summaries...')
        ]);

        setTimeout(() => {
          finalizeSimulation([
            ...currentSteps,
            StepFactory.assistantStep('Please attach a document or PDF file for me to read and summarize directly.')
          ]);
        }, 1200);
      } else if (lower.includes('image') || lower.includes('video') || lower.includes('media') || lower.includes('asset')) {
        // ── Multimodal image/video generation branch ──
        updateChatSteps([
          ...currentSteps,
          StepFactory.thoughtStep(
            'Coding Agent analyzed prompt. Invoking local multimodal image rendering pipeline with parameters: aspect_ratio=16:9, steps=30, style=high-contrast.'
          )
        ]);

        setTimeout(() => {
          updateChatSteps([
            ...currentSteps,
            StepFactory.toolCallStep('generate_image', 'Image successfully generated. Saved to chat context assets.', 'success')
          ]);

          setTimeout(() => {
            finalizeSimulation([
              ...currentSteps,
              StepFactory.assistantStep(
                'This is a demo-mode response. Connect a real AI provider with image generation in **Settings → Providers** to generate and preview actual media assets here.'
              )
            ]);
          }, 1200);
        }, 1200);
      } else if (lower.includes('code') || lower.includes('write') || lower.includes('build') || lower.includes('react') || lower.includes('bug')) {
        // ── Coding agent branch ──
        updateChatSteps([
          ...currentSteps,
          StepFactory.thoughtStep(
            `Scanning file path structure in project workspace [${projectScope || 'Standalone'}]. Locating target files and computing token maps.`
          )
        ]);

        setTimeout(() => {
          updateChatSteps([
            ...currentSteps,
            {
              ...StepFactory.toolCallStep(
                'replace_file_content',
                'Applied contiguous replacement patch to desktop/src/renderer/App.tsx.',
                'success'
              ),
              metadata: {
                filename: 'App.tsx',
                originalCode: 'const activeTab = "general";',
                modifiedCode: 'const activeTab = "trajectory";'
              }
            }
          ]);

          setTimeout(() => {
            updateChatSteps([
              ...currentSteps,
              StepFactory.toolCallStep('run_command', 'npm run build output: tailwindcss compiled successfully. tsc type-checks passed.', 'success')
            ]);

            setTimeout(() => {
              finalizeSimulation([
                ...currentSteps,
                StepFactory.assistantStep(
                  'I have modified `App.tsx` to automatically redirect the active tab to the trajectory execution screen on startup. Verified compilation succeeds.'
                )
              ]);
            }, 1000);
          }, 1200);
        }, 1200);
      } else if (lower.includes('who') || lower.includes('name') || lower.includes('profile') || lower.includes('memory') || lower.includes('preference')) {
        // ── Memory & profile branch ──
        updateChatSteps([
          ...currentSteps,
          StepFactory.thoughtStep('Personal preference prompt detected. Querying memory profile via REST endpoint first per priority rule.')
        ]);

        setTimeout(() => {
          updateChatSteps([
            ...currentSteps,
            StepFactory.toolCallStep('search_memory', 'No memory blocks found yet. Memory is populated as you interact with a connected AI provider.', 'success')
          ]);

          setTimeout(() => {
            finalizeSimulation([
              ...currentSteps,
              StepFactory.assistantStep(
                "I don't have any saved memories about you yet. This is demo mode — connect an AI provider in **Settings → Providers**, and I'll start building a personalized memory profile from your conversations."
              )
            ]);
          }, 1200);
        }, 1200);
      } else {
        // ── Standard chatting branch ──
        updateChatSteps([
          ...currentSteps,
          StepFactory.thoughtStep('Checking active workspace credentials and connected LLM providers...')
        ]);

        setTimeout(() => {
          finalizeSimulation([
            ...currentSteps,
            StepFactory.assistantStep(
              `⚠️ **Demo Mode (Simulation)**

No active AI provider credentials were found. To run the real coding assistant, please set up an API key:

1. Open **Settings** (click the gear icon or navigate to the Settings tab).
2. Add an API key under **Providers** (OpenAI, Anthropic, Gemini, Ollama, etc.).
3. Choose your active model from the composer dropdown.

Once configured, the agent will have full capabilities to read/write code, run builds, execute commands, and use MCP tool servers in your workspace.`
            )
          ]);
        }, 1200);
      }
    }, 1000);
  }
}
