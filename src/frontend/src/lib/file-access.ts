/**
 * File System Access API utilities for native file picker support.
 * Falls back gracefully on unsupported browsers (Firefox, Safari).
 */

// File type filters for the native picker dialogs
// eslint-disable-next-line no-undef
const FILE_TYPES: FilePickerAcceptType[] = [
  {
    description: 'MongoDB Scripts',
    accept: {
      'application/javascript': ['.js'],
      'application/json': ['.json'],
      'text/plain': ['.mongodb'],
    },
  },
];

export interface OpenFileResult {
  handle: FileSystemFileHandle;
  name: string;
  content: string;
}

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showSaveFilePicker' in window &&
    'showOpenFilePicker' in window
  );
}

/**
 * Open a file using the native file picker.
 * Returns the file handle, name, and content.
 * Throws if the user cancels or an error occurs.
 */
export async function openFile(): Promise<OpenFileResult> {
  const [handle] = await window.showOpenFilePicker({
    types: FILE_TYPES,
    multiple: false,
  });

  const file = await handle.getFile();
  const content = await file.text();

  return { handle, name: file.name, content };
}

/**
 * Save content to a file using the native file picker.
 * If a handle is provided, writes directly without showing the picker.
 * If no handle, shows the "Save As" picker dialog.
 * Returns the handle used (for subsequent saves).
 */
export async function saveFile(
  content: string,
  existingHandle?: FileSystemFileHandle | null,
  suggestedName?: string
): Promise<FileSystemFileHandle> {
  const handle =
    existingHandle ??
    (await window.showSaveFilePicker({
      types: FILE_TYPES,
      suggestedName: suggestedName ?? 'query.js',
    }));

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();

  return handle;
}
