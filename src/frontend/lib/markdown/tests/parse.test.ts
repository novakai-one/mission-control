// Parser contract: pure text in, pure structure out. Run: npx tsx <file>.
import assert from 'node:assert/strict';
import { parseInline, parseMarkdown } from '../parse.js';

// --- inline: bold / italic / code / link, with literal survivors ---

assert.deepEqual(parseInline('plain words'), [{ type: 'text', text: 'plain words' }]);

assert.deepEqual(parseInline('a **bold** word'), [
  { type: 'text', text: 'a ' },
  { type: 'strong', text: 'bold' },
  { type: 'text', text: ' word' },
]);

assert.deepEqual(parseInline('*em* and _also em_'), [
  { type: 'em', text: 'em' },
  { type: 'text', text: ' and ' },
  { type: 'em', text: 'also em' },
]);

assert.deepEqual(parseInline('run `npm test` now'), [
  { type: 'text', text: 'run ' },
  { type: 'code', text: 'npm test' },
  { type: 'text', text: ' now' },
]);

assert.deepEqual(parseInline('see [docs](https://example.com/a)'), [
  { type: 'text', text: 'see ' },
  { type: 'link', text: 'docs', href: 'https://example.com/a' },
]);

// snake_case never italicizes; unsupported syntax stays literal
assert.deepEqual(parseInline('use snake_case_names'), [{ type: 'text', text: 'use snake_case_names' }]);
assert.deepEqual(parseInline('~~strike~~ stays'), [{ type: 'text', text: '~~strike~~ stays' }]);

// javascript: links never become links — literal by construction
assert.deepEqual(parseInline('[x](javascript:alert(1))'), [{ type: 'text', text: '[x](javascript:alert(1))' }]);

// raw HTML is just text to the parser (React escaping keeps it inert)
assert.deepEqual(parseInline('<script>alert(1)</script>'), [{ type: 'text', text: '<script>alert(1)</script>' }]);

// --- blocks: paragraphs / headers / fences / lists ---

assert.deepEqual(parseMarkdown('one line'), [
  { type: 'paragraph', inline: [{ type: 'text', text: 'one line' }] },
]);

// blank line splits paragraphs; single newline stays inside one paragraph
assert.deepEqual(
  parseMarkdown('first\nstill first\n\nsecond').map((block) => block.type),
  ['paragraph', 'paragraph'],
);
assert.deepEqual(parseMarkdown('first\nstill first\n\nsecond')[0], {
  type: 'paragraph',
  inline: [{ type: 'text', text: 'first\nstill first' }],
});

assert.deepEqual(parseMarkdown('## Status'), [
  { type: 'heading', level: 2, inline: [{ type: 'text', text: 'Status' }] },
]);
assert.deepEqual(parseMarkdown('#### Deep')[0], {
  type: 'heading', level: 4, inline: [{ type: 'text', text: 'Deep' }],
});
// a hash without a space is not a header
assert.deepEqual(parseMarkdown('#nope')[0].type, 'paragraph');

assert.deepEqual(parseMarkdown('```ts\nconst a = 1;\nconst b = 2;\n```'), [
  { type: 'codeblock', lang: 'ts', text: 'const a = 1;\nconst b = 2;' },
]);
// unterminated fence swallows to EOF rather than leaking backticks
assert.deepEqual(parseMarkdown('```\nhalf open'), [
  { type: 'codeblock', lang: '', text: 'half open' },
]);
// markdown inside a fence stays literal
assert.deepEqual(parseMarkdown('```\n**not bold**\n```')[0], {
  type: 'codeblock', lang: '', text: '**not bold**',
});

assert.deepEqual(parseMarkdown('- alpha\n- **beta**'), [
  {
    type: 'list',
    ordered: false,
    items: [
      [{ type: 'text', text: 'alpha' }],
      [{ type: 'strong', text: 'beta' }],
    ],
  },
]);

assert.deepEqual(parseMarkdown('1. first\n2. second'), [
  {
    type: 'list',
    ordered: true,
    items: [
      [{ type: 'text', text: 'first' }],
      [{ type: 'text', text: 'second' }],
    ],
  },
]);

// mixed document holds shape end to end
const mixed = parseMarkdown('## Plan\n\nDo **this** first:\n\n- step `one`\n- step two\n\n```sh\nnpm run dev\n```');
assert.deepEqual(mixed.map((block) => block.type), ['heading', 'paragraph', 'list', 'codeblock']);

console.log('PASS');
