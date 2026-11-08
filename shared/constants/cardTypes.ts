import { CardType, type CardDefinition, type CardPack, type BaseCardPack, type BaseCardPackId } from '../types/gameObjects.js';

const baseCards: readonly CardDefinition[] = [
  { type: CardType.ExplodingKitten, name: 'Mèo Nổ', englishName: 'Exploding Kitten', count: 4, isNormalCat: false, isBomb: true,
    description: 'Khi rút, lật cho mọi người thấy. Nếu không dùng được Gỡ Bom, bạn bị loại.' },
  { type: CardType.Defuse, name: 'Gỡ Bom', englishName: 'Defuse', count: 6, isNormalCat: false, isRescue: true,
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
  ...card, pack: 'base', isBomb: card.isBomb ?? false, isRescue: card.isRescue ?? false,
}));

type PackCard = [CardType, string, string, number, string, { bomb?: boolean; rescue?: boolean; cat?: boolean }?];


function defineCards(id: CardPack['id'], cards: PackCard[]): CardDefinition[] {
  return cards.map(([type, englishName, name, count, description, flags]) => ({
    type, englishName, name, count, description, pack: id, isBomb: flags?.bomb ?? false,
    isRescue: flags?.rescue ?? false, isNormalCat: flags?.cat ?? false,
  }));
}

function expansion(id: CardPack['id'], name: string, description: string, color: string, cards: PackCard[]): CardPack {
  return { id, name, description, color, kind: 'expansion', cards: defineCards(id, cards) };
}

function base(id: BaseCardPackId, name: string, description: string, color: string, cards: readonly CardDefinition[]): BaseCardPack {
  return { id, name, description, color, kind: 'base', cards,
    bomb: cards.find(card => card.isBomb)!, rescue: cards.find(card => card.isRescue)! };
}

const zombieCards = defineCards('zombie', [
  [CardType.ZombieExplodingKitten, 'Exploding Kitten', 'Mèo Nổ', 4, 'Lật khi rút. Nếu không dùng Zombie Kitten, bạn chết, đặt bom ngửa trước mặt và giữ bài trên tay.', { bomb: true }],
  [CardType.ZombieKitten, 'Zombie Kitten', 'Mèo Thây Ma', 5, 'Gỡ bom. Nếu có người đã chết, phải hồi sinh một người. Bí mật chèn lại bom vừa rút và bom của người hồi sinh, rồi hết lượt.', { rescue: true }],
  [CardType.ZombieAttack, 'Attack (2x)', 'Tấn công', 2, 'Kết thúc lượt không rút. Người kế tiếp chơi 2 lượt. Attack đánh tiếp có thể cộng dồn lượt còn lại.'],
  [CardType.AttackOfTheDead, 'Attack of the Dead', 'Tấn công của người chết', 3, 'Kết thúc lượt không rút. Người kế tiếp chơi 3 lượt cho mỗi người đang chết. Chỉ dùng khi có người chết.'],
  [CardType.ZombieSkip, 'Skip', 'Bỏ lượt', 3, 'Bỏ một lượt mà không rút bài.'],
  [CardType.ZombieSuperSkip, 'Super Skip', 'Siêu bỏ lượt', 2, 'Bỏ toàn bộ lượt còn phải chơi mà không rút.'],
  [CardType.ZombieSeeTheFuture, 'See the Future (3x)', 'Xem tương lai (3x)', 4, 'Xem riêng 3 lá đầu chồng rút rồi trả lại đúng thứ tự.'],
  [CardType.ZombieShuffle, 'Shuffle ⚡ NOW', 'Xáo bài ngay', 2, 'Xáo toàn bộ chồng rút. Có thể đánh ngoài lượt hoặc khi đã chết.'],
  [CardType.Clairvoyance, 'Clairvoyance ⚡ NOW', 'Thấu thị ngay', 2, 'Khi người khác gỡ bom, xem họ đặt bom lại ở đâu. Nếu họ đặt hai lá bom, bạn được xem cả hai vị trí.'],
  [CardType.FeedTheDead, 'Feed the Dead ⚡ NOW', 'Nuôi người chết ngay', 2, 'Chọn một người đã chết. Mỗi người sống còn bài, trừ người đánh, chọn một lá đưa cho người đó.'],
  [CardType.GraveRobber, 'Grave Robber', 'Đào mộ', 1, 'Mỗi người đã chết còn bài chọn một lá trên tay để xáo vào chồng rút. Chỉ dùng khi có người chết.'],
  [CardType.Clone, 'Clone', 'Sao chép', 3, 'Sao chép lá ngay dưới trên chồng bỏ, trừ Clone khác. Chỉ đánh trong lượt của mình khi còn sống.'],
  [CardType.DigDeeper, 'Dig Deeper', 'Đào sâu', 4, 'Xem lá đầu. Giữ lá đó hoặc rút lá kế và đặt lá đã từ chối lại trên đầu chồng. Sau đó kết thúc lượt.'],
  [CardType.ZombieFavor, 'Favor', 'Xin bài', 3, 'Chọn một người còn sống. Họ tự chọn một lá đưa cho bạn.'],
  [CardType.ZombieNope, 'Nope', 'Hủy hành động', 5, 'Hủy hành động trước khi diễn ra, kể cả ngoài lượt hoặc khi đã chết. Có thể phản Nope, trừ Exploding Kitten và Zombie Kitten.'],
  [CardType.CatOLantern, 'Cat-O-Lantern', 'Mèo bí ngô', 4, 'Mèo thường, dùng để ghép combo.', { cat: true }],
  [CardType.DeCatIpated, 'De-Cat-Ipated', 'Mèo mất đầu', 4, 'Mèo thường, dùng để ghép combo.', { cat: true }],
  [CardType.Electrocat, 'Electrocat', 'Mèo điện', 4, 'Mèo thường, dùng để ghép combo.', { cat: true }],
  [CardType.VampireCat, 'Vampire Cat', 'Mèo ma cà rồng', 4, 'Mèo thường, dùng để ghép combo.', { cat: true }],
]);

export const DEFAULT_BASE_PACK = base('base', 'Exploding Kittens', 'Bộ gốc mặc định.', '#475569', BASE_CARD_DEFINITIONS);
export const BASE_CARD_PACKS = [
  DEFAULT_BASE_PACK, base('zombie', 'Zombie Kittens', 'Bộ gốc dùng Zombie Kitten làm lá cứu.', '#3f6212', zombieCards),
];

export function getBasePack(id?: BaseCardPackId): BaseCardPack {
  return BASE_CARD_PACKS.find(pack => pack.id === id) ?? DEFAULT_BASE_PACK;
}

export const CARD_PACKS: readonly CardPack[] = [
  ...BASE_CARD_PACKS,
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

  const card = CARD_DEFINITIONS.get(type);
  const pack = card?.pack ? CARD_PACK_BY_ID.get(card.pack) : undefined;
  if (pack?.kind === 'expansion') return MAX_EXPANSION_CARD_COUNT;
  if (card?.isBomb || card?.isRescue) return MAX_SETUP_CARD_COUNT;
}
