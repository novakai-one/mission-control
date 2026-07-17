import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Room } from '../types.js';

export class RoomStore {
  private appendListener: ((room: Room) => void) | null = null;

  constructor(
    private readonly storePath = path.join(process.cwd(), '.novakai-command', 'rooms.jsonl'),
  ) {}

  onAppend(listener: (room: Room) => void): void {
    this.appendListener = listener;
  }

  create(input: { name: string; members: string[]; createdBy: string }): Room {
    const room: Room = {
      roomId: `room_${randomUUID()}`,
      name: input.name,
      members: Array.from(new Set([...input.members, input.createdBy])),
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      archived: false,
    };
    this.append(room);
    return room;
  }

  // Frozen public contract uses RoomStore.get(roomId).
  // eslint-disable-next-line id-length
  get(roomId: string): Room | null {
    return this.fold().get(roomId) ?? null;
  }

  list(): Room[] {
    return Array.from(this.fold().values()).filter((room) => !room.archived);
  }

  // Frozen public contract uses the input name "add".
  // eslint-disable-next-line id-length
  addMembers(roomId: string, add: string[]): Room | null {
    const room = this.get(roomId);
    if (!room) return null;
    const amended: Room = {
      ...room,
      members: Array.from(new Set([...room.members, ...add])),
    };
    this.append(amended);
    return amended;
  }

  private append(room: Room): void {
    mkdirSync(path.dirname(this.storePath), { recursive: true });
    appendFileSync(this.storePath, JSON.stringify(room) + '\n');
    this.appendListener?.({ ...room, members: [...room.members] });
  }

  private fold(): Map<string, Room> {
    const byId = new Map<string, Room>();
    for (const room of this.readLines()) byId.set(room.roomId, room);
    return byId;
  }

  private readLines(): Room[] {
    if (!existsSync(this.storePath)) return [];
    const rooms: Room[] = [];
    for (const entry of readFileSync(this.storePath, 'utf8').split('\n')) {
      if (!entry.trim()) continue;
      try {
        const parsed = JSON.parse(entry) as Room;
        if (typeof parsed?.roomId === 'string') rooms.push(parsed);
      } catch {
        // A torn line never blocks replaying the remaining room record.
      }
    }
    return rooms;
  }
}
