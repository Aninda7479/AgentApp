import React from 'react';
import { Box, Text } from 'ink';

/** Props for the MarkdownStream component. */
export interface MarkdownStreamProps {
  content: string;
  isStreaming?: boolean;
  verbose?: boolean;
}

/** Parsed markdown token representing a header, code block, bullet, or text line. */
export interface MarkdownToken {
  type: 'header' | 'codeblock' | 'bullet' | 'text';
  text: string;
  language?: string;
}

/**
 * Parses markdown text into tokens for terminal rendering.
 * Supports headers, fenced code blocks, bullet lists, and plain text.
 */
export function parseMarkdownTokens(content: string): MarkdownToken[] {
  const lines = content.split('\n');
  const tokens: MarkdownToken[] = [];
  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];
  let codeBlockLang = '';

  for (const line of lines) {
    // Toggle code block state on ``` fences
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        tokens.push({
          type: 'codeblock',
          text: codeBlockBuffer.join('\n'),
          language: codeBlockLang,
        });
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    if (line.startsWith('#')) {
      tokens.push({ type: 'header', text: line });
    } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      tokens.push({ type: 'bullet', text: line });
    } else {
      tokens.push({ type: 'text', text: line });
    }
  }

  if (inCodeBlock && codeBlockBuffer.length > 0) {
    tokens.push({
      type: 'codeblock',
      text: codeBlockBuffer.join('\n'),
      language: codeBlockLang,
    });
  }

  return tokens;
}

/** Renders streaming markdown content with syntax-highlighted blocks and a cursor indicator. */
export const MarkdownStream: React.FC<MarkdownStreamProps> = ({ content, isStreaming = false, verbose = false }) => {
  const tokens = parseMarkdownTokens(content);

  return (
    <Box flexDirection="column">
      {tokens.map((token, index) => {
        if (token.type === 'header') {
          return (
            <Box key={index} marginY={0}>
              <Text bold color="cyan">
                {token.text}
              </Text>
            </Box>
          );
        }
        if (token.type === 'codeblock') {
          return (
            <Box key={index} marginY={1} paddingX={1} borderStyle="single" borderColor="gray">
              <Text color="yellow">{token.text}</Text>
            </Box>
          );
        }
        if (token.type === 'bullet') {
          return (
            <Box key={index} paddingLeft={1}>
              <Text color="green">• </Text>
              <Text>{token.text.replace(/^[\s*-]+/, '')}</Text>
            </Box>
          );
        }
        return (
          <Box key={index}>
            <Text>{token.text}</Text>
          </Box>
        );
      })}
      {isStreaming && (
        <Box marginTop={0}>
          <Text color="magenta"> ▋</Text>
        </Box>
      )}
      {verbose && (
        <Box marginTop={1}>
          <Text dimColor color="gray">
            [Stream details: length={content.length} chars | tokens={tokens.length}]
          </Text>
        </Box>
      )}
    </Box>
  );
};
