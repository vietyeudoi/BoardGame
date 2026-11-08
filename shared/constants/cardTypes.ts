import { CardType, type CardDefinition, type CardPack } from '../types/gameObjects.js';

const baseCards: readonly CardDefinition[] = [
  { type: CardType.ExplodingKitten, name: 'Mèo Nổ', englishName: 'Exploding Kitten', count: 4, isNormalCat: false,
    description: 'Khi rút, lật cho mọi người thấy. Nếu không dùng được Gỡ Bom, bạn bị loại.' },
  { type: CardType.Defuse, name: 'Gỡ Bom', englishName: 'Defuse', count: 6, isNormalCat: false,
    description: 'Bỏ lá này để sống sót, rồi bí mật đặt Mèo Nổ vào vị trí tùy ý trong chồng.' },
  { type: CardType.Attack, name: 'Tấn công', englishName: 'Attack (2x)', count: 4, isNormalCat: false,
    description: 'Kết thúc lượt không rút. Người kế tiếp chơi 2 lượt. Nếu đánh tiếp Tấn công, cộng 2 vào số lượt còn lại và chuyển sang người kế.' },
  { type: CardType.Skip, name: 'Bỏ lượt', englishName: 'Skip', count: 4, isNormalCat: false,
    description: 'Kết thúc 1 lượt không rút, kể cả khi đang nợ nhiều lượt.' },
  { type: CardType.Favor, name: 'Xin bài', englishName: 'Favor', count: 4, isNormalCat: false,
    description: 'Chọn một đối thủ. Họ chọn 1 lá trên tay để đưa cho bạn.' },
  { type: CardType.Shuffle, name: 'Xáo bài', englishName: 'Shuffle', count: 4, isNormalCat: false,
    description: 'Xáo toàn bộ chồng rút mà không xem bài.' },
  { type: CardType.SeeTheFuture, name: 'Xem tương lai', englishName: 'See the Future (3x)', count: 5, isNormalCat: false,
    description: 'Xem riêng 3 lá trên cùng rồi trả lại đúng thứ tự.' },
  { type: CardType.Nope, name: 'Hủy hành động', englishName: 'Nope', count: 5, isNormalCat: false,
    description: 'Hủy hành động trước khi thực hiện, kể cả ngoài lượt hoặc để phản Nope. Mèo Nổ và Gỡ Bom được miễn.' },
  ...([
    [CardType.TacoCat, 'Tacocat'],
    [CardType.Cattermelon, 'Cattermelon'],
    [CardType.HairyPotatoCat, 'Hairy Potato Cat'],
    [CardType.BeardCat, 'Beard Cat'],
    [CardType.RainbowRalphingCat, 'Rainbow-Ralphing Cat'],
  ] as const).map(([type, name]) => ({ type, name, englishName: name, count: 4, isNormalCat: true,
    description: 'Mèo thường, dùng để ghép combo.' })),
];


export const BASE_CARD_DEFINITIONS: readonly CardDefinition[] = baseCards.map(card => ({
  ...card, pack: 'base', isBomb: card.type === CardType.ExplodingKitten,
}));

type ExpansionCard = [CardType, string, string, number, string, { bomb?: boolean; cat?: boolean }?];

function expansion(id: CardPack['id'], name: string, description: string, color: string, cards: ExpansionCard[]): CardPack {
  return { id, name, description, color, kind: 'expansion', cards: cards.map(([type, englishName, name, count, description, flags]) => ({
    type, englishName, name, count, description, pack: id, isBomb: flags?.bomb ?? false, isNormalCat: flags?.cat ?? false,
  })) };
}

export const CARD_PACKS: readonly CardPack[] = [
  { id: 'base', name: 'Bộ gốc', description: 'Bộ bài luôn có mặt trong mỗi ván.', color: '#475569',
    kind: 'base', cards: BASE_CARD_DEFINITIONS },
  expansion('imploding', 'Imploding Kittens', 'Mèo Nổ Lõm và các lá đổi hướng chơi hoặc rút bài.', '#9a3412', [
    [CardType.ImplodingKitten, 'Imploding Kitten', 'Mèo Nổ Lõm', 1, 'Rút lúc úp: bí mật chèn lại ngửa. Rút lúc ngửa: bị loại. Defuse và Nope không cứu được.', { bomb: true }],
    [CardType.Reverse, 'Reverse', 'Đảo chiều', 4, 'Đảo chiều chơi và kết thúc một lượt không rút. Khi có hai người, dùng như Skip.'],
    [CardType.DrawFromBottom, 'Draw from the Bottom', 'Rút từ đáy', 4, 'Rút lá dưới cùng của chồng để kết thúc lượt.'],
    [CardType.AlterFutureThree, 'Alter the Future (3x)', 'Đổi tương lai (3x)', 4, 'Xem riêng 3 lá trên cùng và sắp lại tùy ý.'],
    [CardType.TargetedAttack, 'Targeted Attack (2x)', 'Tấn công chỉ định (2x)', 3, 'Kết thúc lượt không rút, chọn một người phải chơi 2 lượt liên tiếp.'],
    [CardType.FeralCat, 'Feral Cat', 'Mèo hoang', 4, 'Đại diện cho một lá mèo bất kỳ khi ghép bộ, ví dụ ghép cùng Tacocat để tạo cặp.', { cat: true }],
  ]),
  expansion('streaking', 'Streaking Kittens', 'Mèo giấu bom và các lá tác động lên chồng hoặc tay bài.', '#6d28d9', [
    [CardType.StreakingKitten, 'Streaking Kitten', 'Mèo giấu bom', 1, 'Giữ lá này để giấu 1 Mèo Nổ trên tay. Mất lá khi còn giữ bom sẽ kích hoạt bom. Không bảo vệ khỏi Mèo Nổ Lõm.'],
    [CardType.StreakingExplodingKitten, 'Exploding Kitten (bổ sung)', 'Mèo Nổ bổ sung', 1, 'Mèo Nổ bổ sung để cân bằng cơ chế giữ bom trên tay.', { bomb: true }],
    [CardType.StreakingSuperSkip, 'Super Skip', 'Siêu bỏ lượt', 1, 'Kết thúc tất cả lượt còn lại không rút bài, kể cả các lượt do Attack.'],
    [CardType.SeeFutureFive, 'See the Future (5x)', 'Xem tương lai (5x)', 1, 'Xem riêng 5 lá trên cùng rồi giữ nguyên thứ tự.'],
    [CardType.AlterFutureFive, 'Alter the Future (5x)', 'Đổi tương lai (5x)', 1, 'Xem riêng 5 lá trên cùng rồi sắp lại tùy ý.'],
    [CardType.SwapTopBottom, 'Swap Top and Bottom', 'Đổi đỉnh và đáy', 3, 'Đổi chỗ lá trên cùng và dưới cùng mà không xem.'],
    [CardType.Mark, 'Mark', 'Đánh dấu', 3, 'Lật ngửa ngẫu nhiên một lá trong tay người được chọn. Lá vẫn thuộc tay họ và công khai đến khi đánh hoặc bị lấy.'],
    [CardType.CatomicBomb, 'Catomic Bomb', 'Bom nguyên tử mèo', 1, 'Lấy hết Mèo Nổ ra, xáo phần còn lại, rồi đặt các lá bom úp lên đầu chồng. Kết thúc lượt không rút.'],
    [CardType.GarbageCollection, 'Garbage Collection', 'Thu gom rác', 1, 'Mỗi người còn bài, kể cả người đánh, chọn 1 lá trên tay đưa vào chồng. Sau đó xáo chồng.'],
    [CardType.CurseCatButt, 'Curse of the Cat Butt', 'Lời nguyền mông mèo', 2, 'Người được chọn úp và xáo tay, đánh ngẫu nhiên cho tới khi rút được một lá hoặc gỡ bom thành công.'],
  ]),
  expansion('barking', 'Barking Kittens', 'Mèo sủa và các lá chia sẻ hoặc chôn bài.', '#0f766e', [
    [CardType.BarkingKitten, 'Barking Kitten', 'Mèo sủa', 2, 'Đặt ngửa. Ai giữ lá kia phải Gỡ Bom hoặc nổ. Nếu chưa có ai, lá nằm chờ và bạn là mục tiêu khi lá kia được đánh. Có cả hai thì chọn mục tiêu.'],
    [CardType.AlterFutureNow, 'Alter the Future (3x) Now', 'Đổi tương lai ngay (3x)', 2, 'Xem riêng và xếp lại 3 lá đầu. Có thể đánh ngoài lượt, miễn không chen giữa hành động đang diễn ra.'],
    [CardType.Bury, 'Bury', 'Chôn bài', 2, 'Rút lá đầu, xem riêng, rồi bí mật chèn lại vào vị trí tùy ý để kết thúc lượt.'],
    [CardType.PersonalAttack, 'Personal Attack (3x)', 'Tự tấn công (3x)', 4, 'Tự nhận 3 lượt liên tiếp. Attack đánh tiếp có thể cộng số lượt còn lại và chuyển sang mục tiêu mới.'],
    [CardType.ShareFuture, 'Share the Future (3x)', 'Chia sẻ tương lai (3x)', 2, 'Xem và sắp lại 3 lá đầu, cho người tiếp theo xem rồi đặt lại lên đầu chồng.'],
    [CardType.TowerOfPower, 'Tower of Power', 'Tháp quyền lực', 1, 'Nhận kho 6 lá dự trữ. Khi ai lấy bài của bạn bằng Favor, combo hoặc hiệu ứng tương tự, họ lấy ngẫu nhiên từ kho trước. Bạn không được đánh lá dự trữ.'],
    [CardType.IllTakeThat, "I'll Take That", 'Đưa tôi lá đó', 4, 'Đặt trước đối thủ. Lá họ rút lần tới phải đưa cho bạn. Nếu là Mèo Nổ, bạn xử lý bom.'],
    [CardType.BarkingSuperSkip, 'Super Skip', 'Siêu bỏ lượt', 1, 'Kết thúc tất cả lượt còn phải chơi mà không rút bài.'],
    [CardType.Potluck, 'Potluck', 'Góp bài', 2, 'Từ người đánh và theo chiều chơi, mỗi người chọn 1 lá trên tay và đặt úp lên đầu chồng.'],
  ]),
];

export const CARD_PACK_BY_ID = new Map(CARD_PACKS.map(pack => [pack.id, pack]));
export const CARD_DEFINITIONS = new Map(CARD_PACKS.flatMap(pack => pack.cards.map(card => [card.type, card] as const)));
export const MAX_EXPANSION_CARD_COUNT = 20;
export const MAX_SETUP_CARD_COUNT = 40;
export const STARTING_OTHER_CARDS = 5;

export function getEditableCardLimit(type: CardType): number | undefined {
  if (type === CardType.ExplodingKitten || type === CardType.Defuse) return MAX_SETUP_CARD_COUNT;
  const card = CARD_DEFINITIONS.get(type);
  return card && card.pack !== 'base' ? MAX_EXPANSION_CARD_COUNT : undefined;
}
