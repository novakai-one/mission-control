// snap.mjs — print a running agent's current terminal screen (ANSI stripped).
// Debug/inspection helper: node scripts/team/snap.mjs <agentId>
import { WebSocket } from 'ws';

const agentId = process.argv[2];
const ws = new WebSocket('ws://127.0.0.1:3031/ws');
ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'agent-subscribe', agentId })));
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data.toString());
  if (msg.type === 'agent-replay') {
    const clean = String(msg.data)
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b[()][0-9A-B]/g, '');
    console.log(clean.slice(-2500));
    process.exit(0);
  }
});
setTimeout(() => { console.error('timeout waiting for agent-replay'); process.exit(1); }, 5000);
