"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripAnsi = stripAnsi;
exports.truncatePreview = truncatePreview;
exports.summarizeToolContent = summarizeToolContent;
/** Removes ANSI color/escape sequences from raw tool output. */
function stripAnsi(value) {
    return value.replace(/\x1b\[[0-9;]*m/g, '');
}
/** Collapses whitespace and truncates to a single preview line. */
function truncatePreview(value, maxLength = 88) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return '';
    return normalized.length > maxLength
        ? `${normalized.slice(0, maxLength - 3)}...`
        : normalized;
}
/** Produces a short human-readable summary for a tool step. */
function summarizeToolContent(step) {
    const toolName = step.toolName || 'tool';
    const rawContent = stripAnsi(step.content || '');
    const trimmed = rawContent.trim();
    if (!trimmed) {
        return toolName;
    }
    if (toolName === 'read_file') {
        if (/%PDF-\d\.\d/i.test(trimmed) || /\uFFFD{2,}/.test(trimmed)) {
            return 'Opened a binary document preview';
        }
        const firstLine = truncatePreview(trimmed.split('\n')[0] || trimmed);
        return firstLine || 'Read file contents';
    }
    if (toolName === 'run_command') {
        const lines = trimmed.split('\n').map(line => line.trim()).filter(Boolean);
        const firstLine = lines[0] || '';
        const commandFailureMatch = firstLine.match(/^Error:\s*Command failed:\s*(.+)$/i);
        if (commandFailureMatch) {
            return `Command failed: ${truncatePreview(commandFailureMatch[1])}`;
        }
        if (/^Error:/i.test(firstLine)) {
            return truncatePreview(firstLine);
        }
        return truncatePreview(firstLine) || 'Executed command';
    }
    return truncatePreview(trimmed);
}
