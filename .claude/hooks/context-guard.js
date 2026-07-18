// const fs = require('fs');

// function main() {
//   try {
//     // 1. Read the event data passed via stdin from Claude Code
//     const inputData = fs.readFileSync(0, 'utf-8');
//     if (!inputData) process.exit(0);

//     const payload = JSON.parse(inputData);
//     const transcriptPath = payload.transcript_path;

//     if (!transcriptPath || !fs.existsSync(transcriptPath)) {
//       process.exit(0);
//     }

//     // 2. Read the transcript and split it into individual JSONL lines
//     const content = fs.readFileSync(transcriptPath, 'utf-8');
//     const lines = content.trim().split('\n');

//     let totalCharacters = 0;

//     // 3. Scan backwards from the newest log line to the oldest log line
//     for (let i = lines.length - 1; i >= 0; i--) {
//       const line = lines[i].trim();
//       if (!line) continue;

//       try {
//         const obj = JSON.parse(line);

//         // Check if this line represents a compaction or clear boundary
//         const isCompactionEvent = 
//           obj.type === 'compaction' || 
//           obj.type === 'summary' || 
//           JSON.stringify(obj).toLowerCase().includes('compacted') ||
//           (obj.type === 'user' && typeof obj.message?.content === 'string' && obj.message.content.startsWith('/compact'));

//         if (isCompactionEvent) {
//           // Include the size of the compaction summary block itself, then break out.
//           // This completely ignores all heavy file tool outputs generated before the compaction.
//           totalCharacters += line.length;
//           break;
//         }

//         // Accumulate character length of active lines since the last compression boundary
//         totalCharacters += line.length;

//       } catch (e) {
//         // Fallback: If an individual line fails parsing, safely include its raw length
//         totalCharacters += line.length;
//       }
//     }

//     // 4. Estimate tokens (1 token ≈ 4 characters of raw JSONL string strings)
//     const estimatedTokens = Math.round(totalCharacters / 4);
//     const HARD_LIMIT = 250000;

//     // 5. Block execution only if the ACTIVE context is over the budget ceiling
//     if (estimatedTokens > HARD_LIMIT) {
//       process.stderr.write(`\n🛑 [Context Guard] BUDGET CEILING REACHED 🛑\n`);
//       process.stderr.write(`Active session context is roughly ${estimatedTokens.toLocaleString()} tokens.\n`);
//       process.stderr.write(`Your strict safety cap is set to ${HARD_LIMIT.toLocaleString()} tokens.\n`);
//       process.stderr.write(`Execution blocked to protect API budget. Run /compact or /clear to wipe the log.\n\n`);
//       process.exit(2); // Exit code 2 tells Claude Code to abort the turn
//     }
//   } catch (error) {
//     // Fail-safe: don't break the CLI if the guard script hits an unexpected error
//     process.exit(0);
//   }
//   process.exit(0);
// }

// main();