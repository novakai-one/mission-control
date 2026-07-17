import { ServerController } from './server/index.js';
import { AgentCoordinator } from './agent/index.js';
import { AgentExecutor } from './agent/executor/index.js';
import { StateManager } from './state/index.js';
import { ConfigManager } from './config/index.js';
import { createTerminalRuntime } from './terminal/host/launch/index.js';

export async function bootstrapBackend(): Promise<ServerController> {
  const configuration = ConfigManager.load();
  const serverPort = Number(process.env.NOVAKAI_SERVER_PORT) || configuration.serverPort;
  
  const stateManager = new StateManager(configuration.workspacePath);
  const processExecutor = new AgentExecutor();
  const coordinator = new AgentCoordinator(processExecutor, stateManager);
  const terminals = await createTerminalRuntime();

  const server = new ServerController(serverPort, coordinator, stateManager, terminals);
  
  await server.start();
  console.log(`[Novakai Command Backend] Server listening on port ${serverPort}`);
  return server;
}

// Check if run directly
if (process.argv[1]?.endsWith('backend/index.ts') || process.argv[1]?.endsWith('backend/index.js')) {
  bootstrapBackend().catch((error) => {
    console.error('Failed to start Novakai Command backend:', error);
    process.exit(1);
  });
}
