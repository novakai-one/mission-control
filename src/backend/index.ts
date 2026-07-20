import { ServerController } from './server/index.js';
import { AgentCoordinator } from './agent/index.js';
import { AgentExecutor } from './agent/executor/index.js';
import { StateManager } from './state/index.js';
import { ConfigManager } from './config/index.js';
import { createTerminalRuntime } from './terminal/host/launch/index.js';

export async function bootstrapBackend(): Promise<ServerController> {
  const configuration = ConfigManager.load();
  const serverPort = Number(process.env.NOVAKAI_SERVER_PORT) || configuration.serverPort;
  // Production (deploy snapshot) serves the built frontend + a same-origin
  // listener on NOVAKAI_APP_PORT (3030); dev leaves both unset and vite owns
  // the dev lane's app port (3130).
  const staticDir = process.env.NOVAKAI_STATIC_DIR || undefined;
  const appPort = Number(process.env.NOVAKAI_APP_PORT) || undefined;

  const stateManager = new StateManager(configuration.workspacePath);
  const processExecutor = new AgentExecutor();
  const coordinator = new AgentCoordinator(processExecutor, stateManager);
  const terminals = await createTerminalRuntime();

  const server = new ServerController(serverPort, coordinator, stateManager, terminals, { staticDir, appPort });

  await server.start();
  const served = appPort ? `${serverPort} (api/tooling) + ${appPort} (app)` : String(serverPort);
  console.log(`[Novakai Command Backend] Server listening on port ${served}`);
  return server;
}

// Check if run directly
if (process.argv[1]?.endsWith('backend/index.ts') || process.argv[1]?.endsWith('backend/index.js')) {
  bootstrapBackend().catch((error) => {
    console.error('Failed to start Novakai Command backend:', error);
    process.exit(1);
  });
}
