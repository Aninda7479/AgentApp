import type {
  AgentPersona,
  RoutineTrigger,
  RoutineExecutionLog,
  WorkflowDefinition,
  WorkflowExecutionResult,
  SynthesizedSkill,
  IntegrationEntry,
} from '../core/types';

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (window.location && window.location.port && window.location.port !== '5173') {
      return window.location.origin;
    }
  }
  return 'http://localhost:1469';
}

export class CoreApiClient {
  private static baseUrl = getApiBaseUrl();

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    try {
      const res = await fetch(url, { credentials: 'same-origin', ...options, headers });
      const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      if (!isTauri && res.status === 401 && typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`API ${options.method || 'GET'} ${endpoint} failed (${res.status}): ${errorText || res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err: any) {
      console.warn(`[CoreApiClient] Network request to ${url} failed:`, err.message);
      throw err;
    }
  }

  // ─── Persona / Workforce APIs ───────────────────────────────────────────────

  public static async listPersonas(): Promise<AgentPersona[]> {
    try {
      return await this.request<AgentPersona[]>('/api/personas');
    } catch {
      return this.getFallbackPersonas();
    }
  }

  public static async getPersona(id: string): Promise<AgentPersona> {
    return await this.request<AgentPersona>(`/api/personas/${encodeURIComponent(id)}`);
  }

  public static async savePersona(persona: AgentPersona): Promise<AgentPersona> {
    return await this.request<AgentPersona>('/api/personas', {
      method: 'POST',
      body: JSON.stringify(persona),
    });
  }

  public static async deletePersona(id: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/api/personas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return !!res.success;
  }

  // ─── Routine & Trigger APIs ────────────────────────────────────────────────

  public static async listRoutines(): Promise<RoutineTrigger[]> {
    try {
      return await this.request<RoutineTrigger[]>('/api/routines');
    } catch {
      return [];
    }
  }

  public static async saveRoutine(routine: RoutineTrigger): Promise<RoutineTrigger> {
    return await this.request<RoutineTrigger>('/api/routines', {
      method: 'POST',
      body: JSON.stringify(routine),
    });
  }

  public static async deleteRoutine(id: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/api/routines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return !!res.success;
  }

  public static async runRoutine(id: string): Promise<RoutineExecutionLog> {
    return await this.request<RoutineExecutionLog>(`/api/routines/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    });
  }

  // ─── Workflow Execution ────────────────────────────────────────────────────

  public static async runWorkflow(workflow: WorkflowDefinition, input: string): Promise<WorkflowExecutionResult> {
    return await this.request<WorkflowExecutionResult>('/api/workflows/run', {
      method: 'POST',
      body: JSON.stringify({ workflow, input }),
    });
  }

  // ─── Integrations & Skills ─────────────────────────────────────────────────

  public static async listIntegrations(): Promise<IntegrationEntry[]> {
    try {
      return await this.request<IntegrationEntry[]>('/api/integrations');
    } catch {
      return [];
    }
  }

  public static async listSkills(): Promise<SynthesizedSkill[]> {
    try {
      return await this.request<SynthesizedSkill[]>('/api/skills');
    } catch {
      return [];
    }
  }

  // ─── Demonstration Trace Recording ("Teach a Task") ────────────────────────

  public static async startTrace(title: string, description: string): Promise<string> {
    const res = await this.request<{ sessionId: string }>('/api/skills/trace/start', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    });
    return res.sessionId;
  }

  public static async recordTraceAction(sessionId: string, action: Record<string, unknown>): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/api/skills/trace/${encodeURIComponent(sessionId)}/action`, {
      method: 'POST',
      body: JSON.stringify(action),
    });
    return !!res.success;
  }

  public static async stopTrace(sessionId: string): Promise<Record<string, unknown>> {
    return await this.request<Record<string, unknown>>(`/api/skills/trace/${encodeURIComponent(sessionId)}/stop`, {
      method: 'POST',
    });
  }

  public static async synthesizeTrace(sessionId: string, skillName: string): Promise<SynthesizedSkill> {
    return await this.request<SynthesizedSkill>(`/api/skills/trace/${encodeURIComponent(sessionId)}/synthesize`, {
      method: 'POST',
      body: JSON.stringify({ skillName }),
    });
  }

  // Fallback defaults if backend is initializing
  private static getFallbackPersonas(): AgentPersona[] {
    return [
      {
        id: 'coordinator',
        name: 'Chief of Staff',
        roleTitle: 'Central Task Coordinator',
        description: 'Analyzes user instructions, delegates sub-tasks to specialized domain agents, and aggregates results into a cohesive response.',
        systemPrompt: 'You are the Chief of Staff and Central Coordinator for SuperAgent.',
        capabilityTier: 'deep_reasoning',
        modelConfig: { provider: 'openai', model_id: 'gpt-4o' },
        allowedTools: ['run_subagent', 'read_file', 'list_dir'],
        isCoordinator: true,
        maxTurns: 25,
        avatarEmoji: '👔',
        isBuiltin: true,
      },
      {
        id: 'code-architect',
        name: 'Code Architect',
        roleTitle: 'Senior Software Engineer',
        description: 'Specialized in codebase analysis, multi-file refactoring, writing unit tests, and terminal command execution.',
        systemPrompt: 'You are an expert Senior Software Engineer.',
        capabilityTier: 'deep_reasoning',
        modelConfig: { provider: 'anthropic', model_id: 'claude-3-5-sonnet-20241022' },
        allowedTools: ['read_file', 'write_file', 'edit_file', 'list_dir', 'run_command', 'grep_search'],
        isCoordinator: false,
        maxTurns: 30,
        avatarEmoji: '💻',
        isBuiltin: true,
      },
      {
        id: 'trend-radar',
        name: 'Trend Radar',
        roleTitle: 'Continuous Market & Social Analyst',
        description: 'Monitors live feeds, scans web sources, aggregates key industry shifts, and outputs structured intelligence briefings.',
        systemPrompt: 'You are a Real-Time Intelligence Analyst.',
        capabilityTier: 'high_throughput',
        modelConfig: { provider: 'openai', model_id: 'gpt-4o-mini' },
        allowedTools: ['web_search', 'browser_navigate', 'browser_screenshot'],
        isCoordinator: false,
        maxTurns: 15,
        avatarEmoji: '📡',
        isBuiltin: true,
      },
      {
        id: 'copywriter',
        name: 'Content Drafter',
        roleTitle: 'Multi-Channel Communications Specialist',
        description: 'Formats briefs into platform-tailored articles, newsletters, community updates, presentation slides, and PDF documents.',
        systemPrompt: 'You are a Professional Communications Drafter.',
        capabilityTier: 'deep_reasoning',
        modelConfig: { provider: 'openai', model_id: 'gpt-4o' },
        allowedTools: ['generate_pdf', 'generate_presentation', 'write_file'],
        isCoordinator: false,
        maxTurns: 20,
        avatarEmoji: '✍️',
        isBuiltin: true,
      },
      {
        id: 'email-triage',
        name: 'Inbox & Partner Triage',
        roleTitle: 'Partnership & Communications Assistant',
        description: 'Scans incoming collaboration requests and partner emails, identifies unanswered inquiries, and drafts personalized replies.',
        systemPrompt: 'You are an Executive Partnership & Email Assistant.',
        capabilityTier: 'high_throughput',
        modelConfig: { provider: 'openai', model_id: 'gpt-4o' },
        allowedTools: ['read_file', 'write_file'],
        isCoordinator: false,
        maxTurns: 15,
        avatarEmoji: '📥',
        isBuiltin: true,
      },
    ];
  }
}
