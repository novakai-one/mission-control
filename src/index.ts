import { bootstrapBackend } from './backend/index.js';

bootstrapBackend().then(() => {
  console.log('[Mission Control] Root system bootstrap completed.');
}).catch((error) => {
  console.error('[Mission Control] Root system bootstrap encountered an error:', error);
  process.exit(1);
});
