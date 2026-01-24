export default {
  '*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.svelte': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
