// Query splitter - splits a multi-query editor buffer into individual query slices

export interface QuerySlice {
  text: string; // trimmed query text
  startLine: number; // 0-based line index
  endLine: number; // 0-based inclusive
  startOffset: number; // char offset in full document
  endOffset: number; // char offset (exclusive)
}

/** Returns true if a trimmed line begins a new query (db. / db[ / db.getCollection). */
function isQueryStart(trimmedLine: string): boolean {
  return trimmedLine.startsWith('db.') || trimmedLine.startsWith('db[');
}

/**
 * Split an editor buffer containing multiple MongoDB queries into individual slices.
 *
 * A new query starts when a trimmed line begins with `db.` or `db[`.
 * Continuation lines (chained calls like `.sort()`, `.limit()`, blanks, comments)
 * stay grouped with the prior query block.
 */
export function splitQueries(fullText: string): QuerySlice[] {
  if (!fullText.trim()) return [];

  const lines = fullText.split('\n');
  const slices: QuerySlice[] = [];

  let currentLines: string[] = [];
  let currentStartLine = -1;
  let currentStartOffset = -1;

  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (isQueryStart(trimmed)) {
      // Flush the previous block
      if (currentLines.length > 0) {
        const text = currentLines.join('\n').trim();
        if (text) {
          slices.push({
            text,
            startLine: currentStartLine,
            endLine: i - 1,
            startOffset: currentStartOffset,
            endOffset: offset,
          });
        }
      }
      currentLines = [line];
      currentStartLine = i;
      currentStartOffset = offset;
    } else {
      // Continuation or blank/comment line
      if (currentLines.length > 0) {
        currentLines.push(line);
      } else {
        // Lines before the first query start — treat as start of first block
        // (e.g. leading comments)
        if (trimmed) {
          currentLines = [line];
          currentStartLine = i;
          currentStartOffset = offset;
        }
      }
    }

    offset += line.length + 1; // +1 for the newline
  }

  // Flush the last block
  if (currentLines.length > 0) {
    const text = currentLines.join('\n').trim();
    if (text) {
      slices.push({
        text,
        startLine: currentStartLine,
        endLine: lines.length - 1,
        startOffset: currentStartOffset,
        endOffset: fullText.length,
      });
    }
  }

  return slices;
}

/** Find the query slice that contains the given character offset. */
export function findSliceAtOffset(slices: QuerySlice[], offset: number): QuerySlice | null {
  for (const slice of slices) {
    if (offset >= slice.startOffset && offset <= slice.endOffset) {
      return slice;
    }
  }
  // If offset is past all slices, return the last one
  return slices.length > 0 ? slices[slices.length - 1] : null;
}

/** Find slices that are wholly contained within a selection range. */
export function findSlicesInSelection(
  slices: QuerySlice[],
  selectionFrom: number,
  selectionTo: number
): QuerySlice[] {
  return slices.filter(
    (slice) => slice.startOffset >= selectionFrom && slice.endOffset <= selectionTo
  );
}
