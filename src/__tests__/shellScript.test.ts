import { describe, expect, it } from 'vitest';
import { instrumentShellScript } from '../lib/shellScript';

function unchanged(source: string) {
  const result = instrumentShellScript(source);
  expect(result.script).toBe(source);
  expect(result.statements).toEqual([]);
}

describe('instrumentShellScript', () => {
  it('wraps a single expression statement', () => {
    expect(instrumentShellScript('db.users.find({})')).toEqual({
      script: '__dgrid.result(0, (db.users.find({})));',
      statements: [{ index: 0, text: 'db.users.find({})' }],
    });
  });

  it('wraps several top-level expressions in source order', () => {
    const result = instrumentShellScript('a();\nb();\nc();');
    expect(result.script).toBe(
      '__dgrid.result(0, (a()));\n__dgrid.result(1, (b()));\n__dgrid.result(2, (c()));'
    );
    expect(result.statements).toEqual([
      { index: 0, text: 'a()' },
      { index: 1, text: 'b()' },
      { index: 2, text: 'c()' },
    ]);
  });

  it('leaves declarations and control flow unchanged, including nested expressions', () => {
    unchanged('const a = f();');
    unchanged('let b = 1;\nvar c = 2;');
    unchanged('function g() { return h(); }');
    unchanged('class K { m() { return z(); } }');
    unchanged('if (x) { foo(); } else { bar(); }');
    unchanged('for (let i = 0; i < 3; i++) { foo(i); }');
    unchanged('while (x) { foo(); }');
    unchanged('try { foo(); } catch (e) { bar(); }');
    unchanged('{ foo(); }');
  });

  it('leaves assignments, updates and directives unchanged', () => {
    unchanged('x = 5');
    unchanged('x += 1');
    unchanged('i++');
    unchanged('--i');
    unchanged("'use strict'");
  });

  it('leaves a top-level await statement unchanged but wraps await inside a function', () => {
    unchanged('await foo()');
    unchanged('(await foo())');
    expect(instrumentShellScript('(async () => { await foo(); })()').statements).toHaveLength(1);
  });

  it('handles missing semicolons, several statements per line and multi-line statements', () => {
    expect(instrumentShellScript('a()\nb()').script).toBe(
      '__dgrid.result(0, (a()));\n__dgrid.result(1, (b()));'
    );
    expect(instrumentShellScript('a(); b();').script).toBe(
      '__dgrid.result(0, (a())); __dgrid.result(1, (b()));'
    );
    const multi = instrumentShellScript('db.users\n  .find({})\n  .limit(1);');
    expect(multi.script).toBe('__dgrid.result(0, (db.users\n  .find({})\n  .limit(1)));');
    expect(multi.statements[0].text).toBe('db.users\n  .find({})\n  .limit(1)');
  });

  it('keeps a comma expression as one argument', () => {
    expect(instrumentShellScript('a, b').script).toBe('__dgrid.result(0, (a, b));');
  });

  it('never rewrites comments or string contents', () => {
    unchanged('// foo();\n/* bar(); */');
    unchanged("const s = 'foo(); bar()';");
    const result = instrumentShellScript("f('g();') // h();");
    expect(result.script).toBe("__dgrid.result(0, (f('g();'))); // h();");
  });

  it('preserves line count and every unwrapped line', () => {
    const source = 'const n = 2;\n\n// note\nn * 3\nif (n) {\n  foo();\n}\nbar();';
    const result = instrumentShellScript(source);
    const before = source.split('\n');
    const after = result.script.split('\n');
    expect(after).toHaveLength(before.length);
    const wrapped = [3, 7];
    after.forEach((line, i) => {
      if (!wrapped.includes(i)) expect(line).toBe(before[i]);
    });
    expect(result.statements.map((s) => s.text)).toEqual(['n * 3', 'bar()']);
  });

  it('returns a script with a syntax error unchanged', () => {
    unchanged('db.users.find({');
    unchanged('a();\nfoo(;');
  });

  it('returns an empty or whitespace-only script unchanged', () => {
    unchanged('');
    unchanged('  \n\t ');
  });
});
