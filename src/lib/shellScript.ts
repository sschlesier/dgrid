import { javascriptLanguage } from '@codemirror/lang-javascript';

type Tree = ReturnType<typeof javascriptLanguage.parser.parse>;
type SyntaxNode = Tree['topNode'];

export interface ShellStatement {
  index: number;
  text: string;
}

export interface InstrumentedScript {
  script: string;
  statements: ShellStatement[];
}

const FUNCTION_NODES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunction',
  'MethodDeclaration',
]);

function hasSyntaxError(tree: Tree): boolean {
  let found = false;
  tree.iterate({
    enter(node) {
      if (found) return false;
      if (node.type.isError) {
        found = true;
        return false;
      }
      return undefined;
    },
  });
  return found;
}

function containsTopLevelAwait(node: SyntaxNode): boolean {
  if (node.name === 'AwaitExpression') return true;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (FUNCTION_NODES.has(child.name)) continue;
    if (containsTopLevelAwait(child)) return true;
  }
  return false;
}

function isPrefixUpdate(expression: SyntaxNode, source: string): boolean {
  if (expression.name !== 'UnaryExpression') return false;
  const op = expression.firstChild;
  if (!op || op.name !== 'ArithOp') return false;
  const text = source.slice(op.from, op.to);
  return text === '++' || text === '--';
}

function shouldWrap(expression: SyntaxNode, source: string): boolean {
  switch (expression.name) {
    case 'AssignmentExpression':
    case 'PostfixExpression':
    case 'String':
      return false;
    default:
      break;
  }
  if (isPrefixUpdate(expression, source)) return false;
  return !containsTopLevelAwait(expression);
}

/**
 * Rewrites each top-level expression statement so its value is reported via
 * `__dgrid.result(index, value)`. No newlines are added, so line numbers are preserved.
 * A script with a syntax error is returned unchanged.
 */
export function instrumentShellScript(source: string): InstrumentedScript {
  if (source.trim() === '') return { script: source, statements: [] };

  const tree = javascriptLanguage.parser.parse(source);
  if (hasSyntaxError(tree)) return { script: source, statements: [] };

  const statements: ShellStatement[] = [];
  const edits: { from: number; to: number; text: string }[] = [];

  for (let stmt = tree.topNode.firstChild; stmt; stmt = stmt.nextSibling) {
    if (stmt.name !== 'ExpressionStatement') continue;
    const expression = stmt.firstChild;
    if (!expression || !shouldWrap(expression, source)) continue;

    const index = statements.length;
    const text = source.slice(expression.from, expression.to);
    const hasSemicolon = stmt.to > expression.to && source[stmt.to - 1] === ';';
    statements.push({ index, text });
    edits.push({
      from: expression.from,
      to: expression.to,
      text: `__dgrid.result(${index}, (${text}))${hasSemicolon ? '' : ';'}`,
    });
  }

  let script = source;
  for (let i = edits.length - 1; i >= 0; i--) {
    const { from, to, text } = edits[i];
    script = script.slice(0, from) + text + script.slice(to);
  }
  return { script, statements };
}
