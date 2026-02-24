// SVG icon definitions for tree view
// Each icon is an SVG path string for use in inline SVG elements

export const treeIcons = {
  // Connection/server icon
  server: `<path d="M3 4.5C3 3.67 3.67 3 4.5 3h7c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5h-7C3.67 8 3 7.33 3 6.5v-2zm1.5 0v2h7v-2h-7zm-1.5 5c0-.83.67-1.5 1.5-1.5h7c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5h-7c-.83 0-1.5-.67-1.5-1.5v-2zm1.5 0v2h7v-2h-7zM5 5.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zm0 5a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" fill="currentColor"/>`,

  // Database cylinder icon
  database: `<path d="M8 2C4.69 2 2 3.12 2 4.5v7c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5v-7C14 3.12 11.31 2 8 2zm0 1.5c2.76 0 4.5.9 4.5 1.5S10.76 6.5 8 6.5 3.5 5.6 3.5 5 5.24 3.5 8 3.5zM3.5 7.27c.87.46 2.43.73 4.5.73s3.63-.27 4.5-.73v1.23c0 .6-1.74 1.5-4.5 1.5s-4.5-.9-4.5-1.5V7.27zm0 3c.87.46 2.43.73 4.5.73s3.63-.27 4.5-.73v1.23c0 .6-1.74 1.5-4.5 1.5s-4.5-.9-4.5-1.5v-1.23z" fill="currentColor"/>`,

  // Folder icon (closed)
  folder: `<path d="M2 4.5C2 3.67 2.67 3 3.5 3h3.29a1.5 1.5 0 0 1 1.06.44L8.71 4.3a.5.5 0 0 0 .35.2H12.5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-9c-.83 0-1.5-.67-1.5-1.5v-7.5zm1.5 0v7.5h9V6H8.71a1.5 1.5 0 0 1-1.06-.44L6.79 4.7a.5.5 0 0 0-.35-.2H3.5z" fill="currentColor"/>`,

  // Collection/document icon
  collection: `<path d="M4 2.5A1.5 1.5 0 0 1 5.5 1h4.38a1.5 1.5 0 0 1 1.06.44l2.62 2.62a1.5 1.5 0 0 1 .44 1.06V12.5A1.5 1.5 0 0 1 12.5 14h-7A1.5 1.5 0 0 1 4 12.5v-10zm1.5 0v10h7V5.5H10a1 1 0 0 1-1-1V2.5H5.5zm4 .56V4h.94L9.5 3.06z" fill="currentColor"/>`,

  // Index/key icon
  index: `<path d="M10.5 2a3.5 3.5 0 0 0-3.12 5.09L3.5 11v2h2l.15-.15a.5.5 0 0 0 .35.15h1.5a.5.5 0 0 0 .5-.5V12h.5a.5.5 0 0 0 .5-.5V11h.5a.5.5 0 0 0 .35-.15L9.91 10.88A3.5 3.5 0 1 0 10.5 2zM8.5 5.5a2 2 0 1 1 4 0 2 2 0 0 1-4 0zm2.5-.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z" fill="currentColor"/>`,

  // View/eye icon
  view: `<path d="M8 4C4.36 4 1.26 6.4.15 8a.5.5 0 0 0 0 .5c1.11 1.6 4.21 3.5 7.85 3.5s6.74-1.9 7.85-3.5a.5.5 0 0 0 0-.5C14.74 6.4 11.64 4 8 4zm0 1.5c2.65 0 5.1 1.53 6.32 2.75C13.1 9.47 10.65 11 8 11s-5.1-1.53-6.32-2.75C2.9 7.03 5.35 5.5 8 5.5zM8 6a2.25 2.25 0 1 0 0 4.5A2.25 2.25 0 0 0 8 6zm0 1.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z" fill="currentColor"/>`,

  // Chevron right
  chevronRight: `<path d="M5.5 3L10.5 8L5.5 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

  // Chevron down
  chevronDown: `<path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

  // Loading spinner
  loading: `<path d="M8 1.5v2M8 12.5v2M3.17 3.17l1.42 1.42M11.41 11.41l1.42 1.42M1.5 8h2M12.5 8h2M3.17 12.83l1.42-1.42M11.41 4.59l1.42-1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`,

  // Disconnect/power icon
  disconnect: `<path d="M8 1v4M4.93 3.93L3.5 2.5M11.07 3.93l1.43-1.43M3 8a5 5 0 1 0 10 0 5 5 0 0 0-10 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`,

  // Refresh/reload icon
  refresh: `<path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3M13.5 2v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
} as const;

export type TreeIconName = keyof typeof treeIcons;
