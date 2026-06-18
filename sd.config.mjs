/**
 * Style Dictionary v5 config — V32.8 Rule 31 Design-as-Contract
 * Source: docs/tokens.json (mirrors docs/DESIGN.md)
 * Output: tokens/build/ (CSS vars + TypeScript types)
 *
 * Run: pnpm design:build
 * Verify: pnpm design:validate
 *
 * NOTE: This scaffold targets style-dictionary v5.4.4 (per V32.8 chain spike).
 * Install: pnpm add -D style-dictionary@5.4.4 -w
 */
import StyleDictionary from 'style-dictionary';

const sd = new StyleDictionary({
  source: ['docs/tokens.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: 'sd',
      buildPath: 'tokens/build/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: {
            selector: ':root',
            outputReferences: false,
          },
        },
      ],
    },
    ts: {
      transformGroup: 'js',
      buildPath: 'tokens/build/',
      files: [
        {
          destination: 'tokens.d.ts',
          format: 'typescript/es6-declarations',
        },
      ],
    },
  },
});

await sd.buildAllPlatforms();
