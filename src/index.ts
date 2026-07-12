import { bootstrapBackend } from './backend/index.js';

bootstrapBackend().then(() => {
  console.log('[Novakai Command] Root system bootstrap completed.');
}).catch((error) => {
  console.error('[Novakai Command] Root system bootstrap encountered an error:', error);
  process.exit(1);
});
