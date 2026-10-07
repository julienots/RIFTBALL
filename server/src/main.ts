// RIFTBALL server entry: HTTP API (IAP, reports, analytics) + WebSocket game server on the same port.
// @ts-ignore - plain JS module
import { server, setOnlineResults } from '../server.mjs';
import { GameServer } from './GameServer';

const PORT = +(process.env.PORT || 8787);
const game = new GameServer(server, { queueWaitMs: +(process.env.QUEUE_WAIT_MS || 8000) });
setOnlineResults((matchId: string, playerId: string) => game.outcomeFor(matchId, playerId), () => ({ online: game.onlineCount, rooms: game.roomCount }));
server.listen(PORT, () => console.log(`RIFTBALL server on :${PORT}  (ws path /v1/play)`));

const stop = () => { game.close(); server.close(() => process.exit(0)); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
