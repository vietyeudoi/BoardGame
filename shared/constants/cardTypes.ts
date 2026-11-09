import { CardType, type CardDefinition, type CardPack, type BaseCardPack, type BaseCardPackId } from '../types/gameObjects.js';

import { CARD_FACE_PATHS } from './cardFacePaths.generated.js';

function cardFaceImages(type: CardType): Pick<CardDefinition, 'faceImage'> {
  const paths = CARD_FACE_PATHS[type];
  return paths ? { faceImage: paths } : {};
}

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
  ...card, ...cardFaceImages(card.type), pack: 'base', isBomb: card.isBomb ?? false, isRescue: card.isRescue ?? false,
}));

type PackCard = [CardType, string, string, number, string, { bomb?: boolean; rescue?: boolean; cat?: boolean; noInitialDeal?: boolean }?];


function defineCards(id: CardPack['id'], cards: PackCard[]): CardDefinition[] {
  return cards.map(([type, englishName, name, count, description, flags]) => ({
    type, englishName, name, count, description, pack: id, isBomb: flags?.bomb ?? false,
    isRescue: flags?.rescue ?? false, isNormalCat: flags?.cat ?? false,
    ...(flags?.noInitialDeal ? { noInitialDeal: true } : {}),
    ...cardFaceImages(type),
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
  [CardType.Clone, 'Clone', 'Sao chép', 3, 'Sao chép lá vừa đánh ngay trước nó trên chồng bỏ, trừ Clone khác. Chỉ đánh trong lượt của mình khi còn sống.'],
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
  // TODO: Đối chiếu số lượng trên tờ Imploding; giữ số lượng hiện có.
  expansion('imploding', 'Imploding Kittens', 'Mèo Nổ Lõm và các lá đổi hướng chơi hoặc rút bài.', '#9a3412', [
    [CardType.ImplodingKitten, 'Imploding Kitten', 'Mèo Nổ Lõm', 1, 'Bốc úp: lật ngửa, đặt lại chồng bài. Ai bốc khi đang ngửa chết ngay, không gỡ được.', { bomb: true, noInitialDeal: true }],
    [CardType.Reverse, 'Reverse', 'Đảo chiều', 4, 'Kết thúc lượt của bạn và đổi chiều bốc các lá bài.'],
    [CardType.DrawFromBottom, 'Draw from the Bottom', 'Rút từ đáy', 4, 'Kết thúc lượt của bạn bằng cách rút một lá bài ở dưới đáy của bộ bài.'],
    [CardType.AlterFutureThree, 'Alter the Future (3x)', 'Đổi tương lai (3x)', 4, 'Lén nhìn 3 lá bài trên cùng của bộ bài và có thể thay đổi thứ tự của chúng.'],
    [CardType.TargetedAttack, 'Targeted Attack (2x)', 'Tấn công chỉ định (2x)', 3, 'Kết thúc lượt của bạn và chọn một người chơi tiếp theo phải bốc 2 lá bài.'],
    [CardType.FeralCat, 'Feral Cat', 'Mèo hoang', 4, 'Đại diện cho một lá mèo bất kỳ khi ghép bộ, ví dụ ghép cùng Tacocat để tạo cặp.', { cat: true }],
  ]),
  expansion('streaking', 'Streaking Kittens', 'Mèo giấu bom và các lá tác động lên chồng hoặc tay bài.', '#6d28d9', [
    [CardType.StreakingKitten, 'Streaking Kitten', 'Mèo giấu bom', 1, 'Bí mật giữ lá này. Khi còn nó trên tay, bạn có thể ngầm giữ thêm 1 lá mèo nổ mà không bị chết.'],
    [CardType.StreakingExplodingKitten, 'Exploding Kitten (bổ sung)', 'Mèo Nổ bổ sung', 1, 'Bạn phải cho mọi người xem lá này ngay khi bốc phải. Nếu trên tay không có lá gỡ bom thì bạn bị chết.', { bomb: true, noInitialDeal: true }],
    [CardType.StreakingSuperSkip, 'Super Skip', 'Siêu bỏ lượt', 1, 'Kết thúc tất cả các lượt còn lại của bạn mà không cần phải bốc bài.'],
    [CardType.SeeFutureFive, 'See the Future (5x)', 'Xem tương lai (5x)', 1, 'Lén nhìn 5 lá bài trên cùng của bộ bài và không được cho người khác xem.'],
    [CardType.AlterFutureFive, 'Alter the Future (5x)', 'Đổi tương lai (5x)', 1, 'Lén nhìn 5 lá bài trên cùng của bộ bài và có thể thay đổi thứ tự của chúng.'],
    [CardType.SwapTopBottom, 'Swap Top and Bottom', 'Đổi đỉnh và đáy', 3, 'Đổi vị trí lá đầu và lá cuối của chồng bài cho nhau.'],
    [CardType.Mark, 'Mark', 'Đánh dấu', 3, 'Chọn 1 người chơi và bốc 1 lá bài bất kỳ. Họ phải lật ngửa lá đó và để vậy cho đến khi đánh lá đó ra hoặc bị cướp đi.'],
    [CardType.CatomicBomb, 'Catomic Bomb', 'Bom nguyên tử mèo', 1, 'Lấy hết các lá mèo nổ ra khỏi chồng bài. Xào lại và bỏ các lá mèo nổ lên đầu chồng bài. Lượt của bạn kết thúc sau khi chơi lá bài này.'],
    [CardType.GarbageCollection, 'Garbage Collection', 'Thu gom rác', 1, 'Mọi người kể cả người đánh lá bài này chọn 1 lá bài của mình vào chồng bài bốc rồi xào lại.'],
    [CardType.CurseCatButt, 'Curse of the Cat Butt', 'Lời nguyền mông mèo', 2, 'Chọn làm mù 1 người chơi. Người đó phải xào bài của mình và chơi không nhìn cho đến khi hết lượt.'],
  ]),
  // TODO: Xác nhận số lượng Barking; giữ số lượng hiện có.
  expansion('barking', 'Barking Kittens', 'Mèo sủa và các lá chia sẻ hoặc chôn bài.', '#0f766e', [
    [CardType.BarkingKitten, 'Barking Kitten', 'Mèo sủa', 2, 'Người cầm lá Mèo sủa còn lại là mục tiêu: đưa bạn nửa số bài, bạn gộp rồi trả lại đúng số lá. Không bị Nope.'],
    [CardType.AlterFutureNow, 'Alter the Future (3x) Now', 'Đổi tương lai ngay (3x)', 2, 'Mở 3 lá bài trên cùng và thay đổi vị trí của chúng. Có thể dùng bất cứ lúc nào, không cần đến lượt (NOW).'],
    [CardType.Bury, 'Bury', 'Chôn bài', 2, 'Đánh xuống lá này và bốc thêm 1 lá, bí mật xem và đặt lại vào xấp bài ở bất cứ vị trí nào bạn muốn.'],
    [CardType.PersonalAttack, 'Personal Attack (3x)', 'Tự tấn công (3x)', 4, 'Bạn bốc 3 lượt thay vì 1. Dùng lên người khác: họ nhận số lượt còn lại của bạn + số lượt trên lá.'],
    [CardType.ShareFuture, 'Share the Future (3x)', 'Chia sẻ tương lai (3x)', 2, 'Bí mật xem 3 lá trên cùng của xấp bài, bạn có thể thay đổi thứ tự của chúng, sau đó bạn cho người kế tiếp xem 3 lá đó rồi đặt lên xấp bài.'],
    [CardType.TowerOfPower, 'Tower of Power', 'Tháp quyền lực', 1, 'Khi bạn có lá bài này, người khác muốn xin xỏ hoặc trộm bài của bạn thì thay vì lấy trên tay bạn thì sẽ lấy bài trên xấp bài.'],
    [CardType.IllTakeThat, "I'll Take That", 'Đưa tôi lá đó', 4, 'Đặt trước mặt 1 người. Lần bốc tới, họ bí mật xem lá bốc rồi đưa cho bạn.'],
    [CardType.BarkingSuperSkip, 'Super Skip', 'Siêu bỏ lượt', 1, 'Kết thúc lượt mà không phải bốc bài.'],
    [CardType.Potluck, 'Potluck', 'Góp bài', 2, 'Bắt đầu từ bạn và phải đi theo vòng, mỗi người chơi phải úp 1 lá bài lên đầu xấp bài.'],
  ]),
  expansion('coffee', 'Mèo Nổ Cà Phê', 'Coffee', '#854d0e', [
    // TODO: Xác nhận ghi chú viết tay về Defuse. Tạm dùng 0 lá bổ sung để giữ tổng 28.
    [CardType.CoffeeCoffeeKitten, 'Coffee Kitten', 'Mèo cà phê', 1, 'Đang giữ 3 lá Caffeine: phải gỡ bom hoặc chết. Ít hơn 3 lá: bỏ lại chồng bài và xào.', { noInitialDeal: true }],
    [CardType.CoffeeCaffeine, 'Caffeine', 'Caffeine', 3, 'Nếu bạn giữ trên tay 3 lá CAFFEINE và bốc phải lá COFFEE KITTEN bạn phải dùng lá DEFUSE gỡ nó không thì bị nổ chết.'],
    [CardType.CoffeeAmateurArchaeology, 'Amateur Archaeology', 'Khảo cổ nghiệp dư', 1, 'Chọn bất kỳ lá chức năng nào không phải là mèo (KITTEN) từ chồng bài bỏ, cho lại vào chồng bài bốc và xào bài.'],
    [CardType.CoffeeChangeSeats, 'Change Seats', 'Đổi chỗ', 3, 'Đổi chỗ với một người khác. Người đó sẽ tiếp tục đánh lượt của bạn.'],
    [CardType.CoffeeCoinToss, 'Coin Toss', 'Tung đồng xu', 2, 'Sau khi tung lá này: Mặt ngửa: Bốc 1 lá bài ở trên cùng của chồng bài. Mặt sấp: Bốc 2 lá bài ở dưới cùng của chồng bài.'],
    [CardType.CoffeeCopycat, 'Copycat', 'Sao chép', 3, 'Copy chức năng lá cuối cùng vừa được đánh ra. Bạn có thể đánh ra bất kỳ lúc nào.'],
    [CardType.CoffeeDisable, 'Disable', 'Vô hiệu hóa', 3, 'Chọn lá bất kỳ trên tay đối phương. Người đó sẽ không được phép sử dụng bài này cho đến khi họ bốc bài. Có thể đánh bài ra bất kỳ lúc nào.'],
    [CardType.CoffeeForcePlay, 'Force Play', 'Ép đánh bài', 4, 'Bắt đối thủ đang trong lượt đánh 1 lá bất kỳ; không đánh được thì bỏ lá đó. Đánh lúc nào cũng được.'],
    [CardType.CoffeeForesight, 'Foresight', 'Tiên đoán', 2, 'Bắt một người chơi phải tiết lộ số lượng lá của 1 chức năng nhất định mà họ đang có. Ví dụ: Tiết lộ họ đang có bao nhiêu lá ATTACK hoặc bao nhiêu lá NOPE.'],
    [CardType.CoffeeNowPlus, 'Now+', 'Ngay+', 1, 'Gắn NOW cho 1 lá trên tay: lá đó đánh được bất kỳ lúc nào. Ngay+ bị bỏ sau khi dùng.'],
    [CardType.CoffeeSuperNope, 'Super Nope', 'Siêu hủy hành động', 1, 'Vô hiệu hóa tác dụng của lá bài mà người chơi khác vừa đánh. Lá Super Nope này không thể bị NOPE bởi lá Nope khác. Bạn có thể đánh lá bài này ra bất kỳ lúc nào.'],
    [CardType.CoffeeTheChosenOne, 'The Chosen One', 'Người được chọn', 2, 'Lấy 2 lá bài ngẫu nhiên của người chơi vừa bị nổ chết. Bạn có thể đánh lá bài này ra bất kỳ lúc nào.'],
    [CardType.CoffeeGarbagePile, 'Garbage Pile', 'Đống rác', 1, 'Mỗi người chơi sẽ chọn 1 lá bất kỳ trên tay của đối thủ. Tập hợp tất cả các lá đó lại, xào lên và chia lại cho mọi người.'],
    [CardType.CoffeeEvilPlot, 'Evil Plot', 'Âm mưu đen tối', 1, 'Bốc úp: lật ngửa rồi xào lại vào chồng. Bốc ngửa: bỏ ngẫu nhiên 3 lá trên tay vào chồng rồi xào.', { noInitialDeal: true }],
  ]),
  expansion('timebomb', 'Timebomb Kittens', 'Bom hẹn giờ', '#9f1239', [
    [CardType.TimebombTimebomb, 'Timebomb', 'Bom hẹn giờ', 2, 'Đặt trước mặt. Trong 3 lượt bốc tới phải dùng Gỡ Bom Hẹn Giờ hoặc nổ. Gỡ Bom thường không gỡ được.', { noInitialDeal: true }],
    [CardType.TimebombDefuseTimebomb, 'Defuse Timebomb', 'Gỡ bom hẹn giờ', 3, 'Khi chơi lá bài này, bạn được hủy bỏ lá Time Bomb trước mặt. Nó cũng có thể được sử dụng như Defuse thông thường để gỡ Bomb.', { noInitialDeal: true }],
    [CardType.TimebombBlind, 'Blind', 'Làm mù', 1, 'Chọn một người, người đó phải úp tất cả các lá bài trên tay xuống bàn, không được sử dụng chúng trong lượt tiếp theo của mình.'],
    [CardType.TimebombSearch, 'Search', 'Tìm kiếm', 3, 'Xem 5 lá bài trên cùng của bộ bài, sau đó lấy một lá, bỏ các lá còn lại vào bộ bài và xào bộ bài lên.'],
    [CardType.TimebombDiscard, 'Discard', 'Hủy bài', 3, 'Hủy 2 lá bài ngẫu nhiên trên tay một người bạn chọn.'],
    [CardType.TimebombCopyCat, 'Copy Cat', 'Mèo sao chép', 3, 'Sử dụng giống như lá bài gần nhất mà người cạnh bạn trước đó đã đánh. Bạn không được copy lá Nope, Defuse và các Combo bài.'],
  ]),
  expansion('chaos', 'Mèo Nổ Hỗn Loạn', 'Chaos', '#9333ea', [
    // TODO: Xác nhận số lượng Chaos; tạm dùng 2 lá mỗi loại.
    [CardType.ChaosReturn, 'Return', 'Lấy lại', 2, 'Hãy đánh lá này khi bạn bị người chơi khác cướp bài. Bạn sẽ được lại 2 lá bài của người chơi đó.'],
    [CardType.ChaosSplit, 'Split', 'Chia đôi', 2, 'Chọn một người chơi bất kỳ và buộc người chơi đó phải bỏ 1/2 (một nửa) bộ bài của họ xuống (làm tròn lên).'],
    [CardType.ChaosDumpsterDive, 'Dumpster Dive', 'Lục thùng rác', 2, 'Xáo trộn chồng bài đã đánh (chồng bài hủy) và nhắm mắt bốc 1 lá bài để kết thúc lượt của bạn.'],
    [CardType.ChaosCreateTheFuture, 'Create the Future', 'Tạo tương lai', 2, 'Đặt lại 3 lá bài từ chồng bài đã đánh (chồng bài hủy) ngẫu nhiên vào chồng bài bốc.'],
    [CardType.ChaosPeek, 'Peek', 'Nhìn lén', 2, 'Chọn một người chơi bất kỳ và người chơi đó phải cho bạn xem toàn bộ lá bài của họ.'],
    [CardType.ChaosRefuse, 'Refuse', 'Từ chối', 2, 'Đưa lá bài vừa bốc gần nhất cho người chơi tiếp theo.'],
    [CardType.ChaosYouveTakeThat, 'You\'ve Take That', 'Bắt bạn bốc', 2, 'Chọn một người chơi và người đó phải bốc 1 lá bài. Khi người chơi đó bốc lá bài thì lượt của bạn kết thúc.'],
  ]),
  expansion('attack', 'Mèo Nổ Tấn Công', 'Tấn Công', '#b91c1c', [
    [CardType.AttackKittyRick, 'Kitty Rick', 'Mèo Rick', 1, 'Bốc phải: đặt ra trước mặt. Ai bốc đủ 5 lần đầu tiên phải gỡ bom, không thì chết ngay.', { noInitialDeal: true }],
    [CardType.AttackCoronaKitten, 'Corona Kitten', 'Mèo Corona', 1, 'Gỡ xong: bỏ lại chồng hoặc giữ công khai (nhiễm 5 lượt, không tương tác). Truyền cho ai tương tác với bạn.', { noInitialDeal: true }],
    // TODO: Xác nhận số lượng Gỡ Bom của bộ Tấn Công; tạm dùng 3 lá.
    [CardType.AttackDefuse, 'Defuse', 'Gỡ Bom', 3, 'Đặt mèo nổ vừa bốc vào chồng bài ở vị trí tùy ý. Gỡ Mèo Corona thì có thể truyền cho người khác.', { noInitialDeal: true }],
    [CardType.AttackStreakingKitten, 'Streaking Kitten', 'Mèo giấu bom', 1, 'Bí mật giữ lá này, khi còn nó trên tay bạn có thể ngầm giữ 1 lá mèo nổ mà không bị chết.'],
    [CardType.AttackImpendingImplodingKitten, 'Impending Imploding Kitten', 'Mèo Nổ Sập Sắp Đến', 1, 'Bốc phải: thêm 3 Hố đen vào chồng, đặt lá này lại và xào. Bốc đủ 3 Hố đen rồi bốc lá này thì chết.', { noInitialDeal: true }],
    [CardType.AttackBlackHole, 'Black Hole', 'Hố đen', 3, 'Giữ đủ 3 Hố đen trên tay: lập tức bốc Mèo Nổ Sập Sắp Đến, nổ chết và bị loại.'],
    [CardType.AttackCountingKitten, 'Counting Kitten', 'Mèo đếm bài', 1, 'Bốc úp: lật ngửa, đặt lại chồng. Bốc ngửa: bỏ bài đến khi còn đúng 8 lá, không thì chết. Không gỡ được.', { noInitialDeal: true }],
    [CardType.AttackOddKitten, 'Odd Kitten', 'Mèo số lẻ', 1, 'Bốc khi số bài trên tay lẻ: phải gỡ bom hoặc chết. Số bài chẵn: có thể đặt lại vào chồng.', { noInitialDeal: true }],
    [CardType.AttackUnholyKitten, 'Unholy Kitten', 'Mèo quỷ', 1, 'Sử dụng lá DEFUSE ngay lập tức để gỡ lá này, hoặc sử dụng xúc xắc để bỏ đi số lá bài tương ứng trên tay để tránh bị nổ chết.', { noInitialDeal: true }],
    [CardType.AttackSuperDefuse, 'Super Defuse', 'Siêu gỡ bom', 1, 'Bảo vệ bản thân trong 2 lượt liên tiếp khỏi bị nổ.', { noInitialDeal: true }],
    [CardType.AttackCaternator, 'Caternator', 'Mèo bắt đánh bài', 1, 'Đặt lá này trước mặt 1 đối thủ khác. Trong 3 lượt tiếp theo, người đó bắt buộc phải đánh 1 lá bài khi bắt đầu lượt của họ.'],
    [CardType.AttackTheTwins, 'The Twins', 'Cặp song sinh', 1, 'Tất cả người chơi phải bỏ đi cặp 2 lá giống nhau nào có trên tay.'],
    [CardType.AttackNope, 'Nope', 'Hủy hành động', 2, 'Vô hiệu hóa tác dụng của lá bài mà người chơi khác vừa đánh. Bạn có thể đánh lá bài này ra bất cứ lúc nào.'],
    [CardType.AttackSelfAttack, 'Self Attack', 'Tự tấn công', 3, 'Tự tấn công bản thân. Bạn có thêm lượt chơi khi đánh lá bài này ra.'],
    [CardType.AttackCreepyPeeky, 'Creepy Peeky', 'Nhìn lén', 1, 'Bạn được bí mật xem bài của 1 người khác khi đánh lá này ra.'],
    [CardType.AttackAnnoyDiarrheaKitty, 'Annoy Diarrhea Kitty', 'Mèo gây tiêu chảy', 2, 'Truyền bệnh tiêu chảy cho lá bài bất kỳ của người chơi khác. Người đó không thể sử dụng bài này cho đến khi họ bốc bài.'],
    [CardType.AttackBattleHamster, 'Battle Hamster', 'Hamster chiến đấu', 1, 'Chọn 1 đối thủ. Người đó phải bỏ đi 6 lá trên tay của mình.'],
    [CardType.AttackHipBat, 'Hip Bat', 'Dơi Hip', 1, 'Đặt lá bài này trước mặt 1 đối thủ. Trong 3 vòng tiếp theo, người đó phải bỏ đi 1 lá bài của mình bắt đầu lượt của họ.'],
  ]),
  expansion('gambling', 'Mèo Đỏ Đen', 'Đỏ Đen', '#166534', [
    [CardType.GamblingDisable, 'Disable', 'Vô hiệu hóa', 1, 'Chọn 3 lá trên tay đối thủ: họ không dùng được cho đến khi bốc bài. Đánh bất kỳ lúc nào.'],
    [CardType.GamblingGambler, 'Gambler', 'Con bạc', 1, 'Xào chồng bài. Có thể tung xúc xắc để chọn số lá phải bốc, và bốc từ trên hay từ dưới.'],
    [CardType.GamblingDigDeep, 'Dig Deep', 'Đào sâu', 1, 'Tung xúc xắc lên và chuyển từng đó lá bài tương ứng nằm trên cùng xuống dưới cùng chồng bài.'],
    [CardType.GamblingUnholyKitten, 'Unholy Kitten', 'Mèo quỷ', 1, 'Sử dụng lá DEFUSE ngay lập tức để gỡ lá này, hoặc sử dụng xúc xắc để bỏ đi số lá bài tương ứng trên tay để tránh bị nổ chết.', { noInitialDeal: true }],
    [CardType.GamblingLoadedDice, 'Loaded Dice', 'Xúc xắc gian lận', 1, 'Có thể bỏ qua bất kỳ kết quả tung xúc xắc nào vừa rồi của người chơi và tung xúc xắc lại. Bạn có thể đánh lá bài này ra bất kỳ lúc nào.'],
    [CardType.GamblingAlterDice, 'Alter Dice', 'Đổi tương lai bằng xúc xắc', 1, 'Tung xúc xắc và bí mật xem từng đó lá bài nằm trên cùng của chồng bài. Sau đó bạn có thể tùy ý sắp xếp vị trí của các lá bài đó và đặt lại vào chồng bài.'],
    [CardType.GamblingFutureDice, 'Future Dice', 'Xem tương lai bằng xúc xắc', 1, 'Tung xúc xắc và được bí mật xem số lượng lá bài tương ứng nằm trên cùng của chồng bài.'],
    // TODO: Xác nhận các chức năng được in trên lá Mèo quỷ lai.
    [CardType.GamblingUnholyHybrid, 'Unholy Hybrid', 'Mèo quỷ lai', 3, 'Bạn có thể sử dụng lá này như 1 trong các chức năng được ghi trên lá bài.'],
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

export function isRegularBomb(type?: string): boolean {

  return type === CardType.ExplodingKitten || type === CardType.ZombieExplodingKitten || type === CardType.StreakingExplodingKitten;
}
