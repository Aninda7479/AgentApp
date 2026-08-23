"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const trajectory_js_1 = require("./trajectory.js");
const formatTime_js_1 = require("./formatTime.js");
(0, vitest_1.describe)('Trajectory Utils', () => {
    (0, vitest_1.it)('strips ANSI sequences from raw output', () => {
        const raw = '\x1b[32mSuccess\x1b[0m: file created';
        (0, vitest_1.expect)((0, trajectory_js_1.stripAnsi)(raw)).toBe('Success: file created');
    });
    (0, vitest_1.it)('truncates preview lines accurately', () => {
        const long = 'This is a very long command execution output that needs to be truncated for the summary line preview';
        const preview = (0, trajectory_js_1.truncatePreview)(long, 30);
        (0, vitest_1.expect)(preview.length).toBeLessThanOrEqual(30);
        (0, vitest_1.expect)(preview.endsWith('...')).toBe(true);
    });
    (0, vitest_1.it)('summarizes read_file and run_command tools', () => {
        const readFileStep = {
            toolName: 'read_file',
            content: 'import React from "react";\nimport { useState } from "react";',
        };
        (0, vitest_1.expect)((0, trajectory_js_1.summarizeToolContent)(readFileStep)).toBe('import React from "react";');
        const cmdStep = {
            toolName: 'run_command',
            content: 'cargo test\nrunning 4 tests',
        };
        (0, vitest_1.expect)((0, trajectory_js_1.summarizeToolContent)(cmdStep)).toBe('cargo test');
    });
});
(0, vitest_1.describe)('Format Time Utils', () => {
    (0, vitest_1.it)('formats durations correctly', () => {
        const start = new Date(1000000000000).toISOString();
        const end = new Date(1000000012500).toISOString();
        (0, vitest_1.expect)((0, formatTime_js_1.formatDuration)(start, end)).toBe('12s');
    });
    (0, vitest_1.it)('parses duration strings', () => {
        (0, vitest_1.expect)((0, formatTime_js_1.parseDuration)('12s')).toBe(12000);
        (0, vitest_1.expect)((0, formatTime_js_1.parseDuration)('1m 30s')).toBe(90000);
    });
});
