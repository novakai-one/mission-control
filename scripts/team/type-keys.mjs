// type-keys.mjs — send raw keys to an agent's PTY (debug helper).
import { WebSocket } from 'ws';
const [agentId, ...dataParts] = process.argv.slice(2);
const data = dataParts.join(' ').replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\e/g, '\x1b');
const ws = new WebSocket('ws://127.0.0.1:3031/ws');
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'agent-input', agentId, data }));
  setTimeout(() => process.exit(0), 400);
});
setTimeout(() => process.exit(1), 4000);
