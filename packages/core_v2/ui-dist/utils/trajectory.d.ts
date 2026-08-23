/** Removes ANSI color/escape sequences from raw tool output. */
export declare function stripAnsi(value: string): string;
/** Collapses whitespace and truncates to a single preview line. */
export declare function truncatePreview(value: string, maxLength?: number): string;
/** Produces a short human-readable summary for a tool step. */
export declare function summarizeToolContent(step: {
    toolName?: string;
    content: string;
}): string;
//# sourceMappingURL=trajectory.d.ts.map