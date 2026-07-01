/**
 * AgentEngine — Real AI streaming engine for SuperAgent
 *
 * Architecture (matching OpenCode/Codex patterns):
 *  1. Build messages array with system + conversation history
 *  2. Call provider API with stream: true → SSE token stream
 *  3. Intercept tool_call events → execute tools → feed results back
 *  4. Emit typed events to renderer via IPC
 *
 * This engine is provider-agnostic: OpenAI, Anthropic, Google, Ollama
 * all go through the same interface.
 */
export type AgentEventType = 'token' | 'tool_call' | 'tool_result' | 'thought' | 'done' | 'error' | 'abort';
export interface AgentEvent {
    type: AgentEventType;
    sessionId: string;
    content?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: string;
    error?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}
export declare function createBuiltinTools(projectRoot?: string): ToolDefinition[];
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    name?: string;
}
export interface AgentEngineConfig {
    provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom';
    apiKey: string;
    baseUrl?: string;
    model: string;
    systemPrompt?: string;
    projectRoot?: string;
    maxTokens?: number;
    temperature?: number;
}
export declare class AgentEngine {
    private config;
    private tools;
    private history;
    private abortController;
    readonly sessionId: string;
    constructor(config: AgentEngineConfig, sessionId?: string);
    /** Add a user message to history */
    addUserMessage(content: string): void;
    /** Stop the current generation */
    abort(): void;
    /** Get tool definitions in OpenAI JSON Schema format */
    private getToolSchemas;
    /** Main streaming agent run */
    run(userPrompt: string, onEvent: (event: AgentEvent) => void): Promise<void>;
    /** Stream a single turn from the configured provider */
    private streamFromProvider;
    private streamOpenAI;
    private streamAnthropic;
    private streamGemini;
    private streamOllama;
}
export declare class MultiAgentManager {
    private sessions;
    /** Launch a new agent session */
    create(config: AgentEngineConfig): AgentEngine;
    /** Get a session by ID */
    get(sessionId: string): AgentEngine | undefined;
    /** Stop all running sessions */
    abortAll(): void;
    /** Remove a session */
    destroy(sessionId: string): void;
    /** Count active sessions */
    get count(): number;
}
export declare const multiAgentManager: MultiAgentManager;
