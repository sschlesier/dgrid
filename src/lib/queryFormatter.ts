import { format } from 'prettier/standalone';
import * as babelPlugin from 'prettier/plugins/babel';
import * as estreePlugin from 'prettier/plugins/estree';

const PRETTIER_PLUGINS = [babelPlugin, estreePlugin];

export interface FormatQuerySuccess {
  ok: true;
  formatted: string;
}

export interface FormatSuggestion {
  id: string;
  label: string;
  description: string;
  from: number;
  to: number;
  insert: string;
}

export interface FormatQueryFailure {
  ok: false;
  message: string;
  suggestions: FormatSuggestion[];
}

export type FormatQueryResult = FormatQuerySuccess | FormatQueryFailure;

async function formatJavaScript(text: string): Promise<string> {
  return format(text, {
    parser: 'babel',
    plugins: PRETTIER_PLUGINS,
    semi: true,
  });
}

function trimTrailingNewline(text: string): string {
  return text.replace(/\n$/, '');
}

function unwrapParenthesizedExpression(text: string): string {
  const trimmed = text.trim();

  if (!trimmed.startsWith('(') || !trimmed.endsWith(');')) {
    return trimTrailingNewline(text);
  }

  return trimTrailingNewline(trimmed.slice(1, -2));
}

type Delimiter = ')' | ']' | '}';

interface DelimiterIssue {
  message: string;
  suggestions: FormatSuggestion[];
}

function parseErrorLocation(message: string): { line: number; column: number } | null {
  const match = message.match(/\((\d+):(\d+)\)/);
  if (!match) return null;
  return {
    line: Number(match[1]),
    column: Number(match[2]),
  };
}

function withLocationPrefix(
  message: string,
  location: { line: number; column: number } | null
): string {
  if (!location) return message;
  return `Line ${location.line}, column ${location.column}: ${message}`;
}

function findDelimiterIssue(text: string): DelimiterIssue | null {
  const openerToCloser: Record<string, Delimiter> = {
    '(': ')',
    '[': ']',
    '{': '}',
  };
  const closers = new Set<Delimiter>([')', ']', '}']);
  const stack: Array<{ opener: string; expected: Delimiter }> = [];

  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char in openerToCloser) {
      stack.push({ opener: char, expected: openerToCloser[char] });
      continue;
    }

    if (closers.has(char as Delimiter)) {
      const top = stack[stack.length - 1];
      if (!top) {
        return {
          message: `unexpected closing \`${char}\``,
          suggestions: [
            {
              id: `remove-${char}-${i}`,
              label: `Remove ${char}`,
              description: `Delete the unexpected closing \`${char}\`.`,
              from: i,
              to: i + 1,
              insert: '',
            },
          ],
        };
      }
      if (top.expected !== char) {
        return {
          message: `query is incomplete: expected \`${top.expected}\` before \`${char}\``,
          suggestions: [
            {
              id: `insert-${top.expected}-${i}`,
              label: `Insert ${top.expected}`,
              description: `Insert the missing \`${top.expected}\` before \`${char}\`.`,
              from: i,
              to: i,
              insert: top.expected,
            },
          ],
        };
      }
      stack.pop();
    }
  }

  const top = stack[stack.length - 1];
  if (top) {
    return {
      message: `query is incomplete: missing closing \`${top.expected}\``,
      suggestions: [
        {
          id: `append-${top.expected}-${text.length}`,
          label: `Add ${top.expected}`,
          description: `Append the missing closing \`${top.expected}\`.`,
          from: text.length,
          to: text.length,
          insert: top.expected,
        },
      ],
    };
  }

  return null;
}

function normalizeFormatError(
  error: unknown,
  text: string
): { message: string; suggestions: FormatSuggestion[] } {
  const rawMessage = error instanceof Error ? error.message : 'Unable to format query text';
  const location = parseErrorLocation(rawMessage);
  const delimiterIssue = findDelimiterIssue(text);

  if (delimiterIssue) {
    return {
      message: withLocationPrefix(delimiterIssue.message, location),
      suggestions: delimiterIssue.suggestions,
    };
  }

  if (rawMessage.includes('Unexpected token')) {
    return {
      message: withLocationPrefix(
        'query could not be formatted because the syntax is incomplete or invalid',
        location
      ),
      suggestions: [],
    };
  }

  return { message: rawMessage, suggestions: [] };
}

export function applyFormatSuggestion(text: string, suggestion: FormatSuggestion): string {
  return text.slice(0, suggestion.from) + suggestion.insert + text.slice(suggestion.to);
}

export async function formatQueryText(text: string): Promise<FormatQueryResult> {
  try {
    const formatted = await formatJavaScript(text);
    return { ok: true, formatted: trimTrailingNewline(formatted) };
  } catch (statementError) {
    try {
      const wrapped = await formatJavaScript(`(${text})`);
      return { ok: true, formatted: unwrapParenthesizedExpression(wrapped) };
    } catch (expressionError) {
      const normalized = normalizeFormatError(expressionError ?? statementError, text);
      return {
        ok: false,
        message: normalized.message,
        suggestions: normalized.suggestions,
      };
    }
  }
}
