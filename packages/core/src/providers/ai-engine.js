"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiAgentManager = exports.MultiAgentManager = exports.AgentEngine = void 0;
exports.createBuiltinTools = createBuiltinTools;
// ─── Built-in Agent Tools ─────────────────────────────────────────────────────
// Matching the same tools used by OpenCode/Codex (file ops, search, shell)
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function makeSafeExec(projectRoot) {
    return async (command) => {
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: projectRoot,
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 4 // 4MB
            });
            return stdout || stderr || '(no output)';
        }
        catch (err) {
            const e = err;
            return `Error: ${e.message || String(err)}\n${e.stderr || ''}`.trim();
        }
    };
}
function createBuiltinTools(projectRoot = process.cwd()) {
    const safeExec = makeSafeExec(projectRoot);
    return [
        {
            name: 'read_file',
            description: 'Read the complete contents of a file at the given path. Use for viewing source code, configs, or text documents.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative or absolute path to the file' }
                },
                required: ['path'],
                additionalProperties: false
            },
            execute: async ({ path: filePath }) => {
                try {
                    const resolved = path_1.default.isAbsolute(filePath)
                        ? filePath
                        : path_1.default.join(projectRoot, filePath);
                    const content = fs_1.default.readFileSync(resolved, 'utf-8');
                    const lines = content.split('\n');
                    if (lines.length > 500) {
                        return lines.slice(0, 500).join('\n') + `\n\n... (truncated, ${lines.length - 500} more lines)`;
                    }
                    return content;
                }
                catch (err) {
                    return `Error reading file: ${err.message}`;
                }
            }
        },
        {
            name: 'list_dir',
            description: 'List the files and folders in a directory. Returns names, types, and sizes.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative or absolute directory path. Use "." for project root.' }
                },
                required: ['path'],
                additionalProperties: false
            },
            execute: async ({ path: dirPath }) => {
                try {
                    const resolved = path_1.default.isAbsolute(dirPath)
                        ? dirPath
                        : path_1.default.join(projectRoot, dirPath);
                    const entries = fs_1.default.readdirSync(resolved, { withFileTypes: true });
                    const lines = entries.slice(0, 200).map(e => {
                        if (e.isDirectory())
                            return `[DIR]  ${e.name}/`;
                        try {
                            const stat = fs_1.default.statSync(path_1.default.join(resolved, e.name));
                            return `[FILE] ${e.name}  (${stat.size} bytes)`;
                        }
                        catch {
                            return `[FILE] ${e.name}`;
                        }
                    });
                    return lines.join('\n') || '(empty directory)';
                }
                catch (err) {
                    return `Error listing directory: ${err.message}`;
                }
            }
        },
        {
            name: 'grep_search',
            description: 'Search for a text pattern across files in the project. Returns matching file names and line snippets.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'The search pattern (literal text or regex)' },
                    directory: { type: 'string', description: 'Directory to search in (default: project root)' },
                    fileGlob: { type: 'string', description: 'Optional file glob filter e.g. "*.ts" or "*.tsx"' }
                },
                required: ['pattern'],
                additionalProperties: false
            },
            execute: async ({ pattern, directory, fileGlob }) => {
                const dir = directory ? path_1.default.join(projectRoot, directory) : projectRoot;
                const globStr = fileGlob ? `--include="${fileGlob}"` : '';
                const cmd = `grep -rn --color=never ${globStr} "${pattern.replace(/"/g, '\\"')}" "${dir}"`;
                const result = await safeExec(cmd);
                const lines = result.split('\n').slice(0, 50);
                return lines.join('\n') || '(no matches found)';
            }
        },
        {
            name: 'run_command',
            description: 'Execute a shell command in the project directory. Use for building, testing, installing packages, etc.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The shell command to execute' }
                },
                required: ['command'],
                additionalProperties: false
            },
            execute: async ({ command }) => {
                return safeExec(command);
            }
        },
        {
            name: 'write_file',
            description: 'Write or overwrite content to a file at the given path. Creates parent directories if needed.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path to write to (relative to project root)' },
                    content: { type: 'string', description: 'The complete file content to write' }
                },
                required: ['path', 'content'],
                additionalProperties: false
            },
            execute: async ({ path: filePath, content }) => {
                try {
                    const resolved = path_1.default.isAbsolute(filePath)
                        ? filePath
                        : path_1.default.join(projectRoot, filePath);
                    fs_1.default.mkdirSync(path_1.default.dirname(resolved), { recursive: true });
                    fs_1.default.writeFileSync(resolved, content, 'utf-8');
                    const lines = content.split('\n').length;
                    return `Successfully wrote ${lines} lines to ${filePath}`;
                }
                catch (err) {
                    return `Error writing file: ${err.message}`;
                }
            }
        }
    ];
}
// ─── Agent Engine ─────────────────────────────────────────────────────────────
class AgentEngine {
    config;
    tools;
    history;
    abortController = null;
    sessionId;
    constructor(config, sessionId) {
        this.config = config;
        this.sessionId = sessionId || `session-${Date.now()}`;
        this.tools = createBuiltinTools(config.projectRoot);
        this.history = [];
        // System prompt matching OpenCode's AGENTS.md pattern
        const sysPrompt = config.systemPrompt || `You are SuperAgent, a powerful autonomous AI coding assistant.

You have access to tools to read files, list directories, search codebases, run shell commands, and write files.
Use tools progressively — don't dump the whole codebase; fetch what you need when you need it.

Key guidelines:
- Think step by step before acting
- Read relevant files before making edits
- Verify changes compile/work after editing
- Be concise but thorough in explanations
- When you edit files, mention which files changed and the diff summary`;
        this.history.push({ role: 'system', content: sysPrompt });
    }
    /** Add a user message to history */
    addUserMessage(content) {
        this.history.push({ role: 'user', content });
    }
    /** Stop the current generation */
    abort() {
        this.abortController?.abort();
    }
    /** Get tool definitions in OpenAI JSON Schema format */
    getToolSchemas() {
        return this.tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
                strict: true
            }
        }));
    }
    /** Main streaming agent run */
    async run(userPrompt, onEvent) {
        this.abortController = new AbortController();
        this.addUserMessage(userPrompt);
        let iterations = 0;
        const MAX_ITERATIONS = 10; // prevent infinite loops
        try {
            while (iterations < MAX_ITERATIONS) {
                iterations++;
                // ── Stream from provider ────────────────────────────────────────
                const { fullContent, toolCalls } = await this.streamFromProvider(onEvent, this.abortController.signal);
                // Append assistant message to history
                this.history.push({ role: 'assistant', content: fullContent });
                // ── No tool calls → done ────────────────────────────────────────
                if (toolCalls.length === 0) {
                    onEvent({ type: 'done', sessionId: this.sessionId });
                    return;
                }
                // ── Execute tool calls in sequence ──────────────────────────────
                for (const tc of toolCalls) {
                    const tool = this.tools.find(t => t.name === tc.name);
                    onEvent({
                        type: 'tool_call',
                        sessionId: this.sessionId,
                        toolName: tc.name,
                        toolArgs: tc.args,
                        content: `Calling ${tc.name}(${JSON.stringify(tc.args)})`
                    });
                    let result;
                    if (!tool) {
                        result = `Error: Unknown tool "${tc.name}"`;
                    }
                    else {
                        try {
                            result = await tool.execute(tc.args);
                        }
                        catch (err) {
                            result = `Tool error: ${err.message}`;
                        }
                    }
                    onEvent({
                        type: 'tool_result',
                        sessionId: this.sessionId,
                        toolName: tc.name,
                        toolResult: result,
                        content: result.slice(0, 200) // truncated for display
                    });
                    // Add tool result to history
                    this.history.push({
                        role: 'tool',
                        content: result,
                        toolCallId: tc.id,
                        name: tc.name
                    });
                }
                // Loop: continue with tool results fed back to model
            }
            // Exceeded max iterations
            onEvent({
                type: 'error',
                sessionId: this.sessionId,
                error: 'Max iterations reached. Agent stopped.'
            });
        }
        catch (err) {
            if (err.name === 'AbortError') {
                onEvent({ type: 'abort', sessionId: this.sessionId });
            }
            else {
                onEvent({
                    type: 'error',
                    sessionId: this.sessionId,
                    error: err.message || String(err)
                });
            }
        }
    }
    /** Stream a single turn from the configured provider */
    async streamFromProvider(onEvent, signal) {
        const { provider } = this.config;
        if (provider === 'openai' || provider === 'custom') {
            return this.streamOpenAI(onEvent, signal);
        }
        if (provider === 'anthropic') {
            return this.streamAnthropic(onEvent, signal);
        }
        if (provider === 'gemini') {
            return this.streamGemini(onEvent, signal);
        }
        if (provider === 'ollama') {
            return this.streamOllama(onEvent, signal);
        }
        throw new Error(`Unsupported provider: ${provider}`);
    }
    // ── OpenAI / Custom (OpenAI-compatible) Streaming ────────────────────────
    async streamOpenAI(onEvent, signal) {
        const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const url = `${baseUrl}/chat/completions`;
        // Convert history to OpenAI format (handle tool messages)
        const messages = this.history.map(msg => {
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    content: msg.content,
                    tool_call_id: msg.toolCallId || 'unknown'
                };
            }
            return { role: msg.role, content: msg.content };
        });
        const payload = {
            model: this.config.model,
            messages,
            stream: true,
            tools: this.getToolSchemas(),
            tool_choice: 'auto',
            temperature: this.config.temperature ?? 0.4,
            max_tokens: this.config.maxTokens ?? 4096
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(payload),
            signal
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI API error [${response.status}]: ${err}`);
        }
        let fullContent = '';
        const toolCallAccumulators = new Map();
        if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]')
                        continue;
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const delta = json.choices?.[0]?.delta;
                        if (!delta)
                            continue;
                        // Text token
                        if (delta.content) {
                            fullContent += delta.content;
                            onEvent({ type: 'token', sessionId: this.sessionId, content: delta.content });
                        }
                        // Tool call accumulation
                        if (delta.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                const idx = tc.index ?? 0;
                                if (!toolCallAccumulators.has(idx)) {
                                    toolCallAccumulators.set(idx, { id: tc.id || '', name: tc.function?.name || '', argsJson: '' });
                                }
                                const acc = toolCallAccumulators.get(idx);
                                if (tc.id)
                                    acc.id = tc.id;
                                if (tc.function?.name)
                                    acc.name += tc.function.name;
                                if (tc.function?.arguments)
                                    acc.argsJson += tc.function.arguments;
                            }
                        }
                    }
                    catch {
                        // Ignore partial JSON
                    }
                }
            }
        }
        // Parse accumulated tool calls
        const toolCalls = [];
        for (const [, acc] of toolCallAccumulators) {
            try {
                const args = JSON.parse(acc.argsJson || '{}');
                toolCalls.push({ id: acc.id, name: acc.name, args });
            }
            catch {
                toolCalls.push({ id: acc.id, name: acc.name, args: {} });
            }
        }
        return { fullContent, toolCalls };
    }
    // ── Anthropic Claude Streaming ────────────────────────────────────────────
    async streamAnthropic(onEvent, signal) {
        const url = 'https://api.anthropic.com/v1/messages';
        // Anthropic separates system from messages
        const systemMsg = this.history.find(m => m.role === 'system')?.content || '';
        const conversationMsgs = this.history
            .filter(m => m.role !== 'system')
            .map(m => {
            if (m.role === 'tool') {
                return {
                    role: 'user',
                    content: [{
                            type: 'tool_result',
                            tool_use_id: m.toolCallId || 'unknown',
                            content: m.content
                        }]
                };
            }
            return { role: m.role, content: m.content };
        });
        const tools = this.tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters
        }));
        const payload = {
            model: this.config.model || 'claude-3-5-sonnet-20241022',
            system: systemMsg,
            messages: conversationMsgs,
            tools,
            stream: true,
            max_tokens: this.config.maxTokens ?? 4096
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
                'x-api-key': this.config.apiKey,
                'anthropic-beta': 'tools-2024-04-04'
            },
            body: JSON.stringify(payload),
            signal
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Anthropic API error [${response.status}]: ${err}`);
        }
        let fullContent = '';
        const toolCalls = [];
        let currentToolId = '';
        let currentToolName = '';
        let currentToolInputJson = '';
        if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: '))
                        continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (event.type === 'content_block_delta') {
                            if (event.delta?.type === 'text_delta') {
                                fullContent += event.delta.text;
                                onEvent({ type: 'token', sessionId: this.sessionId, content: event.delta.text });
                            }
                            if (event.delta?.type === 'input_json_delta') {
                                currentToolInputJson += event.delta.partial_json;
                            }
                        }
                        if (event.type === 'content_block_start') {
                            if (event.content_block?.type === 'tool_use') {
                                currentToolId = event.content_block.id;
                                currentToolName = event.content_block.name;
                                currentToolInputJson = '';
                            }
                        }
                        if (event.type === 'content_block_stop' && currentToolName) {
                            try {
                                const args = JSON.parse(currentToolInputJson || '{}');
                                toolCalls.push({ id: currentToolId, name: currentToolName, args });
                            }
                            catch {
                                toolCalls.push({ id: currentToolId, name: currentToolName, args: {} });
                            }
                            currentToolName = '';
                            currentToolInputJson = '';
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
        return { fullContent, toolCalls };
    }
    // ── Google Gemini Streaming ───────────────────────────────────────────────
    async streamGemini(onEvent, signal) {
        const model = this.config.model || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;
        // Convert to Gemini format
        const contents = this.history
            .filter(m => m.role !== 'system')
            .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        const systemInstruction = this.history.find(m => m.role === 'system')?.content;
        const tools = [{
                functionDeclarations: this.tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }))
            }];
        const payload = { contents, tools };
        if (systemInstruction) {
            payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API error [${response.status}]: ${err}`);
        }
        let fullContent = '';
        const toolCalls = [];
        if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: '))
                        continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        const candidates = event.candidates || [];
                        for (const candidate of candidates) {
                            for (const part of (candidate.content?.parts || [])) {
                                if (part.text) {
                                    fullContent += part.text;
                                    onEvent({ type: 'token', sessionId: this.sessionId, content: part.text });
                                }
                                if (part.functionCall) {
                                    toolCalls.push({
                                        id: `gemini-tc-${Date.now()}`,
                                        name: part.functionCall.name,
                                        args: part.functionCall.args || {}
                                    });
                                }
                            }
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
        return { fullContent, toolCalls };
    }
    // ── Ollama (local) Streaming ──────────────────────────────────────────────
    async streamOllama(onEvent, signal) {
        const baseUrl = (this.config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
        const url = `${baseUrl}/api/chat`;
        const messages = this.history.map(m => ({
            role: m.role === 'tool' ? 'tool' : m.role,
            content: m.content
        }));
        const payload = {
            model: this.config.model || 'llama3.2',
            messages,
            stream: true,
            options: {
                temperature: this.config.temperature ?? 0.4
            }
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Ollama API error [${response.status}]: ${err}`);
        }
        let fullContent = '';
        if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                const lines = decoder.decode(value, { stream: true }).split('\n');
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const event = JSON.parse(line);
                        const token = event.message?.content || '';
                        if (token) {
                            fullContent += token;
                            onEvent({ type: 'token', sessionId: this.sessionId, content: token });
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
        return { fullContent, toolCalls: [] }; // Ollama tool-use varies by model
    }
}
exports.AgentEngine = AgentEngine;
// ─── Multi-Agent Manager ──────────────────────────────────────────────────────
class MultiAgentManager {
    sessions = new Map();
    /** Launch a new agent session */
    create(config) {
        const engine = new AgentEngine(config);
        this.sessions.set(engine.sessionId, engine);
        return engine;
    }
    /** Get a session by ID */
    get(sessionId) {
        return this.sessions.get(sessionId);
    }
    /** Stop all running sessions */
    abortAll() {
        for (const engine of this.sessions.values()) {
            engine.abort();
        }
    }
    /** Remove a session */
    destroy(sessionId) {
        const engine = this.sessions.get(sessionId);
        if (engine) {
            engine.abort();
            this.sessions.delete(sessionId);
        }
    }
    /** Count active sessions */
    get count() {
        return this.sessions.size;
    }
}
exports.MultiAgentManager = MultiAgentManager;
exports.multiAgentManager = new MultiAgentManager();
