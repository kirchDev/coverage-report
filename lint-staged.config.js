export default {
  '*.md': (filenames) => {
    const files = filenames.filter(
      (f) => !/(?:^|\/)(README|CLAUDE|AGENTS|CHANGELOG)\.md$/.test(f)
    );
    return files.length > 0 ? `pnpm exec oxfmt ${files.join(' ')}` : [];
  },
  '*.{json,jsonc,yml,yaml}': (filenames) => {
    const files = filenames.filter((f) => !f.includes('pnpm-lock.yaml'));
    return files.length > 0 ? `pnpm exec oxfmt ${files.join(' ')}` : [];
  },
  // dist/ is the bundle `pnpm build` writes. It is committed because a node
  // action runs it straight from the checkout, but it is generated: linting or
  // reformatting it would rewrite esbuild's output and break `pnpm check:dist`.
  '*.{js,ts,mjs,cjs}': (filenames) => {
    const files = filenames.filter((f) => !/(?:^|\/)dist\//.test(f));
    return files.length > 0
      ? [
          `pnpm exec oxlint --fix --deny-warnings ${files.join(' ')}`,
          `pnpm exec oxfmt ${files.join(' ')}`
        ]
      : [];
  }
};
