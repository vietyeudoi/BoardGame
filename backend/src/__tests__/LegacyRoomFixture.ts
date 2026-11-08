import { CardType } from '../../../shared/types/gameObjects.js';
import type { SandboxObject } from '../../../shared/types/room.js';
import { SHARED_CONFIG } from '../../../shared/constants/config.js';
import { Room } from '../room/Room.js';
import { RoomManager } from '../room/RoomManager.js';

const FIXTURE_DECK: CardType[] = [
  CardType.Defuse,
  CardType.Attack,
  CardType.Skip,
  CardType.Favor,
  CardType.Shuffle,
  CardType.SeeTheFuture,
  CardType.Nope,
  CardType.TacoCat,
  CardType.HairyPotatoCat,
  CardType.RainbowRalphingCat,
  CardType.BeardCat,
  CardType.Cattermelon,
  CardType.Defuse,
  CardType.Attack,
  CardType.Skip,
  CardType.Nope,
  CardType.TacoCat,
  CardType.Cattermelon,
  CardType.ExplodingKitten,
  CardType.SeeTheFuture,
];

// Các bài kiểm thử giao thức cũ dùng snapshot nạp sẵn, tách khỏi luồng tạo phòng thật.
export class LegacyRoomFixture extends RoomManager {
  protected override createRoomRecord(id: string, name: string, host: string, password?: string): Room {
    const deck: SandboxObject[] = FIXTURE_DECK.map((cardType, index) => ({
      id: 'card_' + id + '_' + (index + 1), type: 'card', cardType, location: 'DECK',
      faceUp: false, lockedBy: null, ownerId: null, rotation: 0, position: { x: 0, y: 0.8, z: 0 },
    }));
    deck.unshift({ id: 'demo_deck_1', type: 'deck', location: 'TABLE', faceUp: false,
      lockedBy: null, rotation: 0, position: { x: 0, y: 0.8, z: 0 } });
    return new Room(id, name, host, password, SHARED_CONFIG.MAX_PLAYERS_PER_ROOM, deck);
  }
}
