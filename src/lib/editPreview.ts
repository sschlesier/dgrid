import { formatMongoShell } from '../components/results/json/formatters';
import { parseQuery } from './queries';

interface EditPreviewInput {
  collection: string;
  docId: unknown;
  fieldPath: string;
  value: unknown;
  queryText: string;
}

export interface EditPreviewResult {
  previewText: string;
  missingId: boolean;
  missingIdMessage: string | null;
  idManipulationWarning: boolean;
  idManipulationMessage: string | null;
}

function getCollectionReference(collection: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(collection)) {
    return `db.${collection}`;
  }

  return `db.getCollection(${JSON.stringify(collection)})`;
}

function indentBlock(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function hasOwnKey(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, key)
  );
}

function isTruthyProjectionValue(value: unknown): boolean {
  return value === 1 || value === true;
}

function projectionManipulatesId(projection: Record<string, unknown> | undefined): boolean {
  if (!projection || !hasOwnKey(projection, '_id')) {
    return false;
  }

  return !isTruthyProjectionValue(projection._id);
}

function unsetManipulatesId(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.includes('_id');
  }

  if (typeof value === 'string') {
    return value === '_id';
  }

  if (typeof value === 'object' && value !== null) {
    return hasOwnKey(value, '_id');
  }

  return false;
}

function stageManipulatesId(stage: Record<string, unknown>): boolean {
  if (hasOwnKey(stage, '$group')) {
    return true;
  }

  if (hasOwnKey(stage, '$replaceRoot') || hasOwnKey(stage, '$replaceWith')) {
    return true;
  }

  if (hasOwnKey(stage, '$project')) {
    const project = stage.$project;
    return typeof project === 'object' && project !== null && hasOwnKey(project, '_id');
  }

  if (hasOwnKey(stage, '$unset')) {
    return unsetManipulatesId(stage.$unset);
  }

  if (hasOwnKey(stage, '$set')) {
    const set = stage.$set;
    return typeof set === 'object' && set !== null && hasOwnKey(set, '_id');
  }

  if (hasOwnKey(stage, '$addFields')) {
    const addFields = stage.$addFields;
    return typeof addFields === 'object' && addFields !== null && hasOwnKey(addFields, '_id');
  }

  return false;
}

function queryManipulatesId(queryText: string): boolean {
  const parsed = parseQuery(queryText);
  if (!parsed.ok || parsed.value.type !== 'collection') {
    return false;
  }

  if (parsed.value.operation === 'find' || parsed.value.operation === 'findOne') {
    return projectionManipulatesId(parsed.value.projection);
  }

  if (parsed.value.operation === 'aggregate') {
    return parsed.value.pipeline?.some((stage) => stageManipulatesId(stage)) ?? false;
  }

  return false;
}

function buildFilterPreview(docId: unknown): string {
  if (docId === undefined || docId === null) {
    return '{ _id: <missing _id> }';
  }

  return formatMongoShell({ _id: docId });
}

export function buildEditPreview({
  collection,
  docId,
  fieldPath,
  value,
  queryText,
}: EditPreviewInput): EditPreviewResult {
  const missingId = docId === undefined || docId === null;
  const idManipulationWarning = !missingId && queryManipulatesId(queryText);

  const filterPreview = buildFilterPreview(docId);
  const updatePreview = formatMongoShell({ $set: { [fieldPath]: value } });
  const previewText = `${getCollectionReference(collection)}.updateOne(\n${indentBlock(
    filterPreview,
    2
  )},\n${indentBlock(updatePreview, 2)}\n)`;

  return {
    previewText,
    missingId,
    missingIdMessage: missingId
      ? 'This result has no source `_id`, so DGrid cannot target a document for update.'
      : null,
    idManipulationWarning,
    idManipulationMessage: idManipulationWarning
      ? 'This query changes `_id`, so the displayed result may not map cleanly back to the stored document.'
      : null,
  };
}
