// One-off migration of the tk tickets in main's .tickets/ into this br workspace.
//
// Usage: node migrate-from-tk.mjs <path-to-.tickets>
//
// br assigns new IDs. Old IDs are kept in external_ref and in a "Migrated from tk" comment
// (so `br search dgr-xxxx` finds them), and every old ID in ticket text is rewritten to the
// new one. deps -> blocks, links -> related, parent -> parent-child, tags -> labels,
// `## Notes` entries -> comments.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ticketsDir = process.argv[2];
if (!ticketsDir) {
  console.error('Usage: node migrate-from-tk.mjs <path-to-.tickets>');
  process.exit(1);
}

const env = { ...process.env, BEADS_DIR: new URL('./.beads', import.meta.url).pathname };
const br = (...args) => execFileSync('br', args, { env, encoding: 'utf8' }).trim();
const tmp = mkdtempSync(join(tmpdir(), 'tk-migrate-'));

// Sections that stay in the description, in their original order
const DESCRIPTION_SECTIONS = new Set(['Verification', 'Boundaries', 'Open questions for refinement']);

function parseTicket(file) {
  const text = readFileSync(file, 'utf8');
  const [, frontmatter, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = {};
  for (const line of frontmatter.split('\n')) {
    const [, key, value] = line.match(/^(\w+):\s*(.*)$/);
    meta[key] = value.startsWith('[')
      ? value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value;
  }

  const lines = body.split('\n');
  const titleIndex = lines.findIndex((l) => l.startsWith('# '));
  const title = lines[titleIndex].slice(2).trim();

  const sections = [{ name: '_preamble', lines: [] }];
  for (const line of lines.slice(titleIndex + 1)) {
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) sections.push({ name: heading[1], lines: [] });
    else sections.at(-1).lines.push(line);
  }
  for (const s of sections) s.text = s.lines.join('\n').trim();

  const notes = [];
  const notesSection = sections.find((s) => s.name === 'Notes');
  if (notesSection) {
    for (const chunk of notesSection.text.split(/^(?=\*\*\d{4}-\d\d-\d\dT[\d:]+Z\*\*$)/m)) {
      const m = chunk.match(/^\*\*(\S+)\*\*\s*\n([\s\S]*)$/);
      if (m) notes.push({ at: m[1], text: m[2].trim() });
    }
  }

  return { meta, title, sections, notes };
}

const tickets = readdirSync(ticketsDir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => parseTicket(join(ticketsDir, f)));

// Pass 1: create every issue so the old -> new ID map is complete before any text is written
const idMap = new Map();
for (const t of tickets) {
  const id = br(
    'create',
    t.title,
    '--silent',
    '-t',
    t.meta.type,
    '-p',
    t.meta.priority,
    '--external-ref',
    t.meta.id,
    ...(t.meta.assignee ? ['-a', t.meta.assignee] : []),
    ...(t.meta.tags.length ? ['-l', t.meta.tags.join(',')] : [])
  );
  idMap.set(t.meta.id, id);
  console.log(`${t.meta.id} -> ${id}  ${t.title}`);
}

const oldIdPattern = new RegExp(`\\b(${[...idMap.keys()].join('|')})\\b`, 'g');
const rewrite = (s) => s.replace(oldIdPattern, (old) => idMap.get(old));

// Pass 2: fields, comments, relationships, status
const linked = new Set();
for (const t of tickets) {
  const id = idMap.get(t.meta.id);
  const section = (name) => t.sections.find((s) => s.name === name)?.text ?? '';

  const description = [
    section('_preamble'),
    ...t.sections
      .filter((s) => DESCRIPTION_SECTIONS.has(s.name) && s.text)
      .map((s) => `## ${s.name}\n\n${s.text}`),
  ]
    .filter(Boolean)
    .join('\n\n');
  const descriptionFile = join(tmp, `${id}.md`);
  writeFileSync(descriptionFile, rewrite(description) + '\n');

  const designSection = t.sections.find((s) => s.name.startsWith('Design'));
  const design =
    designSection && designSection.name !== 'Design'
      ? `(${designSection.name.replace(/^Design\s*\(|\)$/g, '')})\n\n${designSection.text}`
      : (designSection?.text ?? '');

  br(
    'update',
    id,
    '--description-file',
    descriptionFile,
    ...(design ? ['--design', rewrite(design)] : []),
    ...(section('Acceptance Criteria') ? ['--acceptance-criteria', rewrite(section('Acceptance Criteria'))] : [])
  );

  br('comments', 'add', id, '-m', `Migrated from tk ${t.meta.id} (created ${t.meta.created}).`);
  for (const note of t.notes) {
    br('comments', 'add', id, '-m', `[tk note ${note.at}]\n\n${rewrite(note.text)}`);
  }

  for (const dep of t.meta.deps) br('dep', 'add', id, idMap.get(dep));
  for (const link of t.meta.links) {
    const pair = [t.meta.id, link].sort().join(' ');
    if (linked.has(pair)) continue;
    linked.add(pair);
    br('dep', 'add', id, idMap.get(link), '-t', 'related');
  }
  if (t.meta.parent) br('update', id, '--parent', idMap.get(t.meta.parent));
}

// Status last, so closing never trips over dependency checks mid-migration
for (const t of tickets) {
  const id = idMap.get(t.meta.id);
  if (t.meta.status === 'in_progress') br('update', id, '-s', 'in_progress');
  if (t.meta.status === 'closed') br('close', id, '--force', '-r', 'Closed in tk before migration');
}

rmSync(tmp, { recursive: true });
writeFileSync(
  new URL('./tk-id-map.json', import.meta.url),
  JSON.stringify(Object.fromEntries(idMap), null, 2) + '\n'
);
console.log(`Migrated ${tickets.length} tickets; ID map in tk-id-map.json`);
