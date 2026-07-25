export function buildTitleGeneratorPrompt(maxWords: number, customPrompt?: string): string {
  return (
    customPrompt ||
    `Generate a short title (maximum ${maxWords} words) summarizing the starting prompt. Return ONLY the title text, without quotes, formatting, or explanation.`
  );
}
