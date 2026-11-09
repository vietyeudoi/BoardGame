// Tệp sinh tự động bằng npm run generate:card-faces.
import type { CardType } from '../types/gameObjects.js';

export interface CardFaceAsset {
  readonly path: string;
  readonly format: 'png' | 'webp';
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
}

export const CARD_FACE_MANIFEST: Readonly<Partial<Record<CardType, readonly CardFaceAsset[]>>> = {
  "exploding-kitten": [
    {"path":"Original/Exploding-Kitten1.png","format":"webp","width":720,"height":1005,"bytes":150886,"sha256":"e778079bd3ecc35d3bfd7f5d96f897d0608888d591966c321a963ef388ee91f9"},
    {"path":"Original/Exploding-Kitten2.png","format":"webp","width":720,"height":1003,"bytes":120474,"sha256":"72ba33abdfb01679d704459eb4b69850d78603f6303bf83ea987f032cfaa46f4"},
    {"path":"Original/Exploding-Kitten3.png","format":"webp","width":720,"height":1011,"bytes":146346,"sha256":"ddbd754218d26d5c966f4495629642096e350550917ca05bbab8de36bd359a36"},
    {"path":"Original/Exploding-Kitten4.png","format":"webp","width":720,"height":1001,"bytes":170926,"sha256":"015dfb7fe22adf8e6aacbf420d95e35fd714e8e092c4fe6feb2c5e75f99e5c64"},
  ],
  "defuse": [
    {"path":"Original/Defuse1.png","format":"webp","width":720,"height":1002,"bytes":91948,"sha256":"d1369335e40ada2f2850df49797fee8b015b5b88c292b4f27b02dba5bdee6d61"},
    {"path":"Original/Defuse2.png","format":"webp","width":720,"height":1011,"bytes":91066,"sha256":"017f133c8c547c850f65cc0e170ed06d64ce8d65774fbfefd19e0e0c800f4203"},
    {"path":"Original/Defuse3.png","format":"webp","width":720,"height":1011,"bytes":95148,"sha256":"1de4b11c2e1ca7ad2054d1bf8328af963a1c00ade6e00a93880116950ecb29b1"},
    {"path":"Original/Defuse4.png","format":"webp","width":720,"height":1001,"bytes":100220,"sha256":"2fb6d311af649f2b6cdc8c5ae3bc8a85eed6c0ca7b6ec73412321448bcb4686f"},
    {"path":"Original/Defuse5.png","format":"webp","width":720,"height":999,"bytes":120484,"sha256":"df3fef63fbef44c331efb8541e773bd343b47ca54400b48b193e436e1ccc7380"},
  ],
  "attack": [
    {"path":"Original/Attack1.png","format":"webp","width":720,"height":994,"bytes":173196,"sha256":"324b1fa4a2f9150bb8827faa9f817969b680c85db1c257933922a9a5cfcc2a3f"},
    {"path":"Original/Attack2.png","format":"webp","width":720,"height":1005,"bytes":152182,"sha256":"1929964b0da80406ca55987cb96988d7905b79e5de7acb7e62ab94c9736e1b71"},
    {"path":"Original/Attack3.png","format":"webp","width":720,"height":998,"bytes":150880,"sha256":"862abf99ee643f35589fe6c5b9c8d55d4236931a575518ae757f39f66c1ec78a"},
    {"path":"Original/Attack4.png","format":"webp","width":720,"height":1003,"bytes":143218,"sha256":"10ae5038e3d885733373b5a2f5ad097d07528a724f7b3447f83171560f8377eb"},
  ],
  "skip": [
    {"path":"Original/Skip1.png","format":"webp","width":720,"height":1005,"bytes":110372,"sha256":"019ec169d73ae9123222e1dda8f27db1948366fd97fdba1507ce0a64158bdb1e"},
    {"path":"Original/Skip2.png","format":"webp","width":720,"height":1002,"bytes":106718,"sha256":"f6fbd5c67fc42e1c39f54575dffcea9f1b8b9608bb43ea7a86fbf16adf4f2101"},
    {"path":"Original/Skip3.png","format":"webp","width":720,"height":999,"bytes":110682,"sha256":"5b62d6ae30afd2bd84c9bc58ec9960a7d133e77c1be3067a62a1ba1598b9f0d8"},
    {"path":"Original/Skip4.png","format":"webp","width":720,"height":1005,"bytes":101386,"sha256":"a71037ec7ceca4a736fdd9df57aef02716f96f46ba33790add0d365ac7378112"},
  ],
  "favor": [
    {"path":"Original/Favor1.png","format":"webp","width":720,"height":1017,"bytes":133366,"sha256":"92bdf9f069519ba0d9b2372102656a4ccf093a0da6eb3d419c3a5c35f1d87afe"},
    {"path":"Original/Favor2.png","format":"webp","width":720,"height":998,"bytes":136882,"sha256":"ecb9510b882e0e6022695842f4b045028e9b23cff1d42f9fea8cc402643d5a94"},
    {"path":"Original/Favor3.png","format":"webp","width":720,"height":1003,"bytes":122896,"sha256":"8410493dd70498df96f80bca16ed8bb0b5d0a01d97b3320b7d95ac55cf4fd6d1"},
    {"path":"Original/Favor4.png","format":"webp","width":1628,"height":2257,"bytes":484388,"sha256":"a1ab3112df115b49aec751d97ee86cedb88d19e9aa785b6b338774c369cb084f"},
  ],
  "shuffle": [
    {"path":"Original/Shuffle1.png","format":"webp","width":720,"height":1000,"bytes":91702,"sha256":"0a2630bb773d6d876b010fb301089c17ea5d803ccbc41b5c97308515d32f2c48"},
    {"path":"Original/Shuffle2.png","format":"webp","width":720,"height":999,"bytes":132174,"sha256":"56edd1e039cadc317174a773d79981d6374c96208a81cd700ab3a48baf74f551"},
    {"path":"Original/Shuffle3.png","format":"webp","width":720,"height":1010,"bytes":130622,"sha256":"287f9eeedcba17985318e55cc84ba9beb1a128d3fd50974bb9b5a4e4c0553605"},
    {"path":"Original/Shuffle4.png","format":"webp","width":720,"height":1007,"bytes":148506,"sha256":"7e65d92938a909bd353bbf5056a92d96673632216e4619254e9dffbd8b1f709f"},
  ],
  "see-the-future": [
    {"path":"Original/See-the-Future1.png","format":"webp","width":720,"height":1003,"bytes":89740,"sha256":"7b0af4384cb94d441a68a2e38b9dac18b24d7a7699fd5f79d133add281007484"},
    {"path":"Original/See-the-Future2.png","format":"webp","width":720,"height":1016,"bytes":125356,"sha256":"f521e3ab8ec4a6050721c1284cb63f12ba4fafd0a83e201df0572b5495d93d79"},
    {"path":"Original/See-the-Future3.png","format":"webp","width":720,"height":1005,"bytes":96692,"sha256":"57f71e0951fceabe282818abecb82f812fe791b54be37e0b613a06c4e93698be"},
    {"path":"Original/See-the-Future4.png","format":"webp","width":720,"height":1009,"bytes":118426,"sha256":"8e67a64db8c67e16916eda9775207d0e1ff2776c645d8ffc388b7b329a5122af"},
    {"path":"Original/See-the-Future5.png","format":"webp","width":720,"height":1019,"bytes":96222,"sha256":"a00dce6f0ca87481634765fb5cac7e3eed162c17b308ca29f1fadd2ac9841614"},
  ],
  "nope": [
    {"path":"Original/Nope1.png","format":"webp","width":720,"height":1016,"bytes":131554,"sha256":"94951d3bc565ef1881017b3c719e0a4affb7c991317aa223fd4f978eca62b098"},
    {"path":"Original/Nope2.png","format":"webp","width":720,"height":1023,"bytes":136756,"sha256":"38fa945447db2c850c318eec373ea2aa5b289f2421072075a5704caf89aae4c2"},
    {"path":"Original/Nope3.png","format":"webp","width":720,"height":1015,"bytes":148334,"sha256":"c227a5364309b00637c91c1be1ab366202d49cc96c63668700c84118054d153e"},
    {"path":"Original/Nope4.png","format":"webp","width":720,"height":1026,"bytes":121396,"sha256":"11b39db2bd20f36ed200b09a2dfe5c3e935d6d2e3569f4fca7a1210f51216820"},
    {"path":"Original/Nope5.png","format":"webp","width":720,"height":1003,"bytes":98524,"sha256":"981d1a5aec97034a0674e038d0df02c5fb678aa8b6868348b638b665f35a84bb"},
  ],
  "taco-cat": [
    {"path":"Original/Tacocat.png","format":"webp","width":720,"height":1012,"bytes":81226,"sha256":"f7bc0c82b96e24551dd61fa8b59e7289339b7b603aec55f72edb68c80c5794d2"},
  ],
  "cattermelon": [
    {"path":"Original/Cattermelon.png","format":"webp","width":720,"height":1016,"bytes":83516,"sha256":"05b2dacd904bfbc2e526b3127307ba234c1a003ea8e23220855df06b65ab69d8"},
  ],
  "hairy-potato-cat": [
    {"path":"Original/Hairy-Potato-Cat.png","format":"webp","width":720,"height":1003,"bytes":81186,"sha256":"480c7fe67e4efee74f3c8ff38a765a589858c2f6843574564a054b9f617fb601"},
  ],
  "beard-cat": [
    {"path":"Original/Beard-Cat.png","format":"webp","width":720,"height":1005,"bytes":132192,"sha256":"d8b1ea618e3d5432ef3414c3906527cefb8add8df0e0c3b1305e1a9270b6a920"},
  ],
  "rainbow-ralphing-cat": [
    {"path":"Original/Rainbow-Ralphing-Cat.png","format":"webp","width":720,"height":1007,"bytes":87160,"sha256":"4b9bea0fb8e910b28200fcb8b503bf9ef3a0a15e8534fc52fa857566a7ec1187"},
  ],
  "zombie:exploding-kitten": [
    {"path":"Zombie/Exploding-Kitten1.png","format":"webp","width":1258,"height":1932,"bytes":243914,"sha256":"b6d5e18676467116a1435c8e246325c25f4b3d4ca447c418c85a2e8dfd41a2e3"},
    {"path":"Zombie/Exploding-Kitten2.png","format":"webp","width":862,"height":1304,"bytes":174608,"sha256":"8671c943d88a5f8604f788af26a0a3efdab4903c26e80bbd5e4b26a842f7ac8d"},
    {"path":"Zombie/Exploding-Kitten3.png","format":"webp","width":926,"height":1404,"bytes":157726,"sha256":"432f729ccc2ecd607c823bf73bcef495b5f389fc43742624ac9887538b6f2e6b"},
    {"path":"Zombie/Exploding-Kitten4.png","format":"webp","width":872,"height":1308,"bytes":160404,"sha256":"da77dcaaabfafc75f270fdbbd784e9049f04109434f0ac6b7e48a53eccb39f73"},
  ],
  "zombie:zombie-kitten": [
    {"path":"Zombie/Zombie-Kitten1.png","format":"webp","width":720,"height":1038,"bytes":136142,"sha256":"ac38ff02e8599e625150aee1cf72a0299882bf6777a3d7dab03fa5e2539163c5"},
    {"path":"Zombie/Zombie-Kitten3.png","format":"webp","width":720,"height":1000,"bytes":153444,"sha256":"b2cef535eb9d5bfd6720941b39d12ec2c914aa0953aab4c52dcf824fab997d96"},
    {"path":"Zombie/Zombie-Kitten4.png","format":"webp","width":720,"height":1031,"bytes":131190,"sha256":"9600c304485da853d76cf68237efb587fe7abcdc8e8ae4ee7a1dd70139d3ac43"},
    {"path":"Zombie/Zombie-Kitten5.png","format":"webp","width":720,"height":989,"bytes":164386,"sha256":"121de41113ce7faf4d5181662b06eeb8592c6cc9dd990a368405dc69dfa27423"},
    {"path":"Zombie/Zombie4.png","format":"webp","width":720,"height":991,"bytes":180678,"sha256":"d2f4ccb2d7b4b886cc04a6e951d07669000eac4c58d5b93c78414afad44f1852"},
  ],
  "zombie:attack": [
    {"path":"Zombie/Attack1.png","format":"webp","width":907,"height":1360,"bytes":131204,"sha256":"ec508d0b0fe71f2b98af7aed5b3574a96ad0fb5a6c82274665d52572b74247d5"},
    {"path":"Zombie/Attack2.png","format":"webp","width":1132,"height":1718,"bytes":163968,"sha256":"53aea7d12ead4cc6eccc4e0e2d1c6b9af367c6db7efce7f3089fbbad664b6281"},
  ],
  "zombie:attack-of-the-dead": [
    {"path":"Zombie/Attack-Of-The-Dead1.png","format":"webp","width":720,"height":1005,"bytes":161340,"sha256":"b97a0723ea1e044eacf9e695046fa65462b9f5b5e9fc8ff1866a6223adc4eec5"},
    {"path":"Zombie/Attack-Of-The-Dead2.png","format":"webp","width":720,"height":1005,"bytes":147152,"sha256":"0835d3c7043bcc51403964a53459b453454119dc4ea0ef8f0ddd5cc9bca80fa9"},
    {"path":"Zombie/Attack-Of-The-Dead3.png","format":"webp","width":720,"height":1012,"bytes":150936,"sha256":"2619ab67d2414575f404b6761b1ca55957341d27d3fa5c20028fd367bb369b90"},
  ],
  "zombie:skip": [
    {"path":"Zombie/Skip1.png","format":"webp","width":604,"height":914,"bytes":56720,"sha256":"2e7d67c17352aa15f2d4159889492f6a41e9bdd51df1faba93dd4280bdcbedcb"},
    {"path":"Zombie/Skip2.png","format":"webp","width":800,"height":1212,"bytes":84528,"sha256":"618ace8e06c6617b0c423e01faf4a051e1544069f85f2f7fc3b298194520b86b"},
    {"path":"Zombie/Skip3.png","format":"webp","width":842,"height":1282,"bytes":110852,"sha256":"afdfd0dfc70d9f0aafd7f1ed100f7da22da7bb54190bb9a4a348abf8f2dd9c04"},
  ],
  "zombie:super-skip": [
    {"path":"Zombie/Super-Skip1.png","format":"webp","width":876,"height":1334,"bytes":118480,"sha256":"a09dbda52d7a860ec7f2736682d69c7056436d654234b9534a2fda7d9c24f559"},
    {"path":"Zombie/Super-Skip2.png","format":"webp","width":926,"height":1408,"bytes":129950,"sha256":"91ffb15f5b730267bfee3169f5bcb030797919a849d1d630c77883b6140c2f67"},
  ],
  "zombie:see-the-future": [
    {"path":"Zombie/See-the-Future1.png","format":"webp","width":732,"height":1116,"bytes":89384,"sha256":"5fd125fa25c78515cb63155ecb1bc5507fea8145ade1d96980196f8e13561dd5"},
    {"path":"Zombie/See-The-Future2.png","format":"webp","width":822,"height":1250,"bytes":95922,"sha256":"096992a88cf605d5e60c1614ae68c77c2cbc1074835ba2c4ee9c53327a3343f1"},
    {"path":"Zombie/See-the-Future3.png","format":"webp","width":856,"height":1302,"bytes":101608,"sha256":"ca9c7789038fe92d804ec7daa1a191a4b30b0f9c69626c277b3b6caeed5a1863"},
    {"path":"Zombie/See-The-Future4.png","format":"webp","width":782,"height":1184,"bytes":94912,"sha256":"40bb82e991138d3ed2901088c288006d6e1a872c791d38f3027d0b1f809bb080"},
  ],
  "zombie:shuffle": [
    {"path":"Zombie/Shuffle1.png","format":"webp","width":822,"height":1252,"bytes":92694,"sha256":"aa3488ee5a8cc6eb69e1ca3a7bd1c2d389d3d8655752ac146c3a23bfee2601e7"},
    {"path":"Zombie/Shuffle2.png","format":"webp","width":757,"height":1150,"bytes":93786,"sha256":"39fac7caa30af0c0a8f79081c9adbf2e4e9db26c64f7b9c7b5d049f9ef5266a4"},
  ],
  "zombie:clairvoyance": [
    {"path":"Zombie/Clairvoyance.png","format":"webp","width":720,"height":1007,"bytes":147022,"sha256":"d7db43a9722fd220dcc6ea6cc9f4bb125bd63665142968ad33128f3f6ed937d1"},
    {"path":"Zombie/Clairvoyance1.png","format":"webp","width":720,"height":1008,"bytes":156814,"sha256":"edd0c175d232ddaf06181fc94683c02fb2058873a752acfd6240eb2c6bfb4aec"},
  ],
  "zombie:feed-the-dead": [
    {"path":"Zombie/Feed-The-Dead1.png","format":"webp","width":720,"height":989,"bytes":164384,"sha256":"eb720c79a4314a36d4a2b2dc035320e2d298ec91cc28423c70c9c662e871de6a"},
    {"path":"Zombie/Feed-The-Dead2.png","format":"webp","width":720,"height":1051,"bytes":174600,"sha256":"ef3ddeb373da914a2363e81515baed6e37bc1193e87f6a40ed34c4f41e9a5709"},
  ],
  "zombie:grave-robber": [
    {"path":"Zombie/Grave-Robber.png","format":"webp","width":720,"height":1015,"bytes":164394,"sha256":"1832b09baa4f63baf98ef3b0015d2f10b5f4ade103a6f4497b13df1cc4f196f7"},
  ],
  "zombie:clone": [
    {"path":"Zombie/Clone1.png","format":"webp","width":720,"height":1039,"bytes":154066,"sha256":"9b34f3cfd680b6cd3112b3d15f0524f2887845f717cee82e5f35e50d9a3ea341"},
    {"path":"Zombie/Clone2.png","format":"webp","width":720,"height":1028,"bytes":142826,"sha256":"4bd3cb5aafea37027d557f77555249de19be95d6e3b5f3b1aa21f4168d50d0f9"},
    {"path":"Zombie/Clone3.png","format":"webp","width":720,"height":1041,"bytes":158942,"sha256":"291a881a962df9d81b9187e8c36af0f42a97916cb0e101426913986a63dff00e"},
  ],
  "zombie:dig-deeper": [
    {"path":"Zombie/Dig-Deeper1.png","format":"webp","width":720,"height":1027,"bytes":176610,"sha256":"444a9b094d4a922876906e4c2659a44eaedd9282b578b5681ed0c7116432c77f"},
    {"path":"Zombie/Dig-Deeper2.png","format":"webp","width":720,"height":1063,"bytes":151194,"sha256":"abac09165eb3722e3b536729ca513dd63e9e6e91e9e62ea98157a1dcfd7f53ef"},
    {"path":"Zombie/Dig-Deeper3.png","format":"webp","width":720,"height":1036,"bytes":162850,"sha256":"6f8c34eb4fd9e171bc12e4d94ec561b47b74d7e93501881fc2e9a45c10808c70"},
    {"path":"Zombie/Dig-Deeper4.png","format":"webp","width":720,"height":993,"bytes":177834,"sha256":"5d2776e937efe6497406a0da778912e43727430e983a86466a8d51602f68e0d4"},
  ],
  "zombie:favor": [
    {"path":"Zombie/Favor1.png","format":"webp","width":982,"height":1490,"bytes":128778,"sha256":"1474c44442b5b4b0d39cb86980a99807c8e58fac813f8d8a73145e8614c19d5e"},
    {"path":"Zombie/Favor2.png","format":"webp","width":802,"height":1214,"bytes":109678,"sha256":"687933bcb4a3bd6cb51b9e3aa1932f6af30a7774c63e5426db3e4bc80eef39ab"},
    {"path":"Zombie/Favor3.png","format":"webp","width":906,"height":1386,"bytes":116638,"sha256":"673f415ca8932ffb775f3bcff5f126ae528f8aebe832bd64d233a85aca539754"},
  ],
  "zombie:nope": [
    {"path":"Zombie/Nope1.png","format":"webp","width":904,"height":1374,"bytes":120668,"sha256":"55be81ed8888a23404dfff08cd93c8dd18c4d90f1fd63d9e46f0ae61098f35b4"},
    {"path":"Zombie/Nope2.png","format":"webp","width":866,"height":1310,"bytes":107384,"sha256":"e741b2127c1f222f6c64486de710e194c55017ccd91dfbb7ee7c8965bbd1c621"},
    {"path":"Zombie/Nope3.png","format":"webp","width":986,"height":1506,"bytes":149392,"sha256":"fb5a8a7ab4405d0e8d73d6004f7a5cbcbaf7c8f7d10a7f203a5cb0816b67a38f"},
    {"path":"Zombie/Nope4.png","format":"webp","width":934,"height":1418,"bytes":103352,"sha256":"3bf91069d8f2d0f0937245aff2e5ac1364a5dbda6c44b5fe7ac64b76f1f982dc"},
    {"path":"Zombie/Nope5.png","format":"webp","width":972,"height":1480,"bytes":122068,"sha256":"9fcad3d1af68ec303ed58ad396b46683aa55c31eb40a213e58ffcd589a04d966"},
  ],
  "zombie:cat-o-lantern": [
    {"path":"Zombie/Cat-O-Lantern.png","format":"webp","width":720,"height":1009,"bytes":118408,"sha256":"ae6a52c0270e9088344512c72dff898f5a27fceb6336bafae3c43570a27a4efc"},
  ],
  "zombie:de-cat-ipated": [
    {"path":"Zombie/De-Cat-Ipated.png","format":"webp","width":720,"height":1034,"bytes":120882,"sha256":"20d339fdaa042be8490187554e62820588553a1c4a52bae5e039f22b3e327e95"},
  ],
  "zombie:electrocat": [
    {"path":"Zombie/Electrocat.png","format":"webp","width":720,"height":1004,"bytes":152246,"sha256":"ecf0e82f9baa951ec137d356cdc95ec4bb41cf13ea6864caa33d0f1d69f7e694"},
  ],
  "zombie:vampire-cat": [
    {"path":"Zombie/Vampire-Cat.png","format":"webp","width":720,"height":1017,"bytes":124478,"sha256":"efae95cd41ba2a018c8fc13cc0f1138998b2e3730a7f4763fecae886190bfe2a"},
  ],
  "imploding:imploding-kitten": [
    {"path":"ImplodingKittens/Imploding-Kitten.png","format":"webp","width":720,"height":1019,"bytes":118322,"sha256":"29dda16c81f7d3ff9cef45f7f030f28ee60830037bf797137e4599794a30816e"},
  ],
  "imploding:reverse": [
    {"path":"ImplodingKittens/Reverse1.png","format":"webp","width":720,"height":991,"bytes":142988,"sha256":"1477119d7a95fca67b9786c7c45359fed74201eb87eb676d0a5a3648b38fb287"},
    {"path":"ImplodingKittens/Reverse2.png","format":"webp","width":720,"height":1025,"bytes":120954,"sha256":"dfd871300708532acc19fc55293c24d0a58196826aa277fe22697d18e06062db"},
    {"path":"ImplodingKittens/Reverse3.png","format":"webp","width":720,"height":1046,"bytes":148466,"sha256":"9ce21befee3ef007395f2c395ceb616540773f51160305277c4fbf771d7c798f"},
    {"path":"ImplodingKittens/Reverse4.png","format":"webp","width":720,"height":1056,"bytes":140506,"sha256":"ac1f83f864ea12ae903eca8d30046ce73563cc7d94f5ff26a2227b814afcf4ef"},
  ],
  "imploding:draw-from-bottom": [
    {"path":"ImplodingKittens/Draw-from-the-Bottom1.png","format":"webp","width":720,"height":1009,"bytes":141034,"sha256":"cbfbbfcd154c46c805041adb709721baba2423cd25313d33e9a672659dea0b51"},
    {"path":"ImplodingKittens/Draw-from-the-Bottom2.png","format":"webp","width":962,"height":1484,"bytes":126714,"sha256":"6712ae20c9d1d15769c36167017f510c2f69f91601e4ae2ef2a2e9f37d0d1166"},
    {"path":"ImplodingKittens/Draw-from-the-Bottom3.png","format":"webp","width":1188,"height":1830,"bytes":275258,"sha256":"8bd87b92eac85c97512cfac1c7862290ede6aa42b23d266ea4e0bbff6f6e8da7"},
    {"path":"ImplodingKittens/Draw-from-the-Bottom4.png","format":"webp","width":898,"height":1392,"bytes":119412,"sha256":"270b1099a51e1c44e6712594e6d5413b4ca64998c5615ed301022fa1c50c5da6"},
  ],
  "imploding:alter-future-3": [
    {"path":"ImplodingKittens/Alter-the-Future1.png","format":"webp","width":720,"height":1017,"bytes":125208,"sha256":"2ae72c1b0d8fb22b44b9ce22bdc1ba3620b0eafb9b1874a2f33bc4e943a27d8c"},
    {"path":"ImplodingKittens/Alter-the-Future2.png","format":"webp","width":720,"height":1016,"bytes":115270,"sha256":"28fc025e8aa280b1bc006764dd105669e286410eeb7f5e13a404e793e2fa3809"},
    {"path":"ImplodingKittens/Alter-the-Future3.png","format":"webp","width":720,"height":1014,"bytes":130518,"sha256":"530abaf6aacce53126145e82e8524930fdf848834e69f19aae67a6749b67a9ea"},
    {"path":"ImplodingKittens/Alter-the-Future4.png","format":"webp","width":720,"height":995,"bytes":145162,"sha256":"86137c2c82ae491fec7cb51408cfdfbbbbbe6d2401d9ed209e797048505b1c66"},
  ],
  "imploding:targeted-attack": [
    {"path":"ImplodingKittens/Targeted-Attack1.png","format":"webp","width":720,"height":1015,"bytes":143132,"sha256":"13a43a22ef5e873c9fba4af611110e93718de297cc269821196283938af7dbb5"},
    {"path":"ImplodingKittens/Targeted-Attack2.png","format":"webp","width":720,"height":1021,"bytes":153708,"sha256":"9559338b7d5339e3e3ecb4cdd4c9252d1acfd68c2a4d7187cb6a57886ebbeba5"},
    {"path":"ImplodingKittens/Targeted-Attack3.png","format":"webp","width":720,"height":1010,"bytes":115234,"sha256":"9e437429e3f6d9e6e4379aeda5b66db3e8f91ae20d3cdc52e0708735ed75047e"},
  ],
  "imploding:feral-cat": [
    {"path":"ImplodingKittens/Feral-Cat.png","format":"webp","width":720,"height":1010,"bytes":77548,"sha256":"2705b70e927925573baa7b5ca279f629b8a9af0ae368e59b487c1be910ff5504"},
  ],
  "streaking:streaking-kitten": [
    {"path":"StreakingKittens/Streaking-Kitten.png","format":"webp","width":720,"height":1017,"bytes":135536,"sha256":"1167b874aacd1e167258e4f5f2a1ba536ca32f0087e50afab47d70e2c0f40318"},
  ],
  "streaking:exploding-kitten": [
    {"path":"StreakingKittens/Exploding-Kitten.png","format":"webp","width":720,"height":1024,"bytes":123232,"sha256":"78ecf17093e26f268507585321f8b18402a21d43f701c7f6d6d23a7e254c3733"},
  ],
  "streaking:super-skip": [
    {"path":"StreakingKittens/Super-Skip.png","format":"webp","width":720,"height":1038,"bytes":122572,"sha256":"cf8c642c48f7dd96a10c8f0828c2b0f555b340d740ecfe905984fbaa474341f1"},
  ],
  "streaking:see-future-5": [
    {"path":"StreakingKittens/See-the-Future.png","format":"webp","width":720,"height":1019,"bytes":106252,"sha256":"944faa26ffe966a55105638d44702af259b86749e4f322b31e307bd4122eafa2"},
  ],
  "streaking:alter-future-5": [
    {"path":"StreakingKittens/Alter-the-Future.png","format":"webp","width":720,"height":1040,"bytes":119550,"sha256":"71fe4ea0938e98240b705a4e4d501169029f91989657d8bcb889f547f1d76a69"},
  ],
  "streaking:swap-top-bottom": [
    {"path":"StreakingKittens/Swap-Top-and-Bottom.png","format":"webp","width":720,"height":1016,"bytes":133344,"sha256":"6d11f71acb6c95e7b8b4f14389c3130b38b692b3b6ea323b6d02705043e6883e"},
  ],
  "streaking:mark": [
    {"path":"StreakingKittens/Mark.png","format":"webp","width":720,"height":1012,"bytes":121828,"sha256":"5b3661a0abe9009a989f45bf931440f56dba2af4045971518e20dcdfbb803473"},
  ],
  "streaking:catomic-bomb": [
    {"path":"StreakingKittens/Catomic-Bomb.png","format":"webp","width":720,"height":1025,"bytes":131892,"sha256":"7da9fc11a610c03903b0220dfd48ea5bd3acadf6492ca7a6816b760fcd6b9322"},
  ],
  "streaking:garbage-collection": [
    {"path":"StreakingKittens/Garbage-Collection.png","format":"webp","width":720,"height":1013,"bytes":151092,"sha256":"112e8c34160c81d54077db9dcd3688a2708741de53ccb5086cdd4d32b2083bf5"},
  ],
  "streaking:curse-cat-butt": [
    {"path":"StreakingKittens/Curse-of-the-Cat-Butt.png","format":"webp","width":720,"height":1036,"bytes":149588,"sha256":"f43c235d5d60869dcac51e517afb7da5c90cb84e5d4c08d4b59b8e1b84b2cba7"},
  ],
  "barking:barking-kitten": [
    {"path":"BarkingKittens/Barking-Kitten1.png","format":"webp","width":712,"height":1005,"bytes":136658,"sha256":"1ca89ca3272106f67341411aa6ed86a8af41803cb6bd6a23faf09af3abdfa7a8"},
    {"path":"BarkingKittens/Barking-Kitten2.png","format":"webp","width":713,"height":997,"bytes":107748,"sha256":"16872fca5b175e20be0a84192276036a52d4d5155c925241741c697e59079e6e"},
  ],
  "barking:alter-future-now": [
    {"path":"BarkingKittens/Alter-the-Future.png","format":"webp","width":1004,"height":1554,"bytes":143452,"sha256":"e27dd32031186ecacfcba9b9492fc745c9e9b40ee0ba8b841c05787ebad97e71"},
  ],
  "barking:bury": [
    {"path":"BarkingKittens/Bury1.png","format":"webp","width":720,"height":1023,"bytes":146440,"sha256":"294f94a880a26f0d53be0516a22ca58356b7a73f913ff64d1892b1cade8ee785"},
    {"path":"BarkingKittens/Bury2.png","format":"webp","width":720,"height":1032,"bytes":152050,"sha256":"070ea0a37a0235ebaa3fa9e64401d5fb594c184c690c2487a3ad663c91d983a2"},
  ],
  "barking:personal-attack": [
    {"path":"BarkingKittens/Personal-Attack1.png","format":"webp","width":720,"height":1031,"bytes":162632,"sha256":"685f051ab80087293b17a7779be76db340bf04a522386bb2983b14b2abfd4a97"},
    {"path":"BarkingKittens/Personal-Attack2.png","format":"webp","width":720,"height":1012,"bytes":138162,"sha256":"165b93165a0780b7353f4f7916131f58c9def2eb5b4306cd18956836e775abde"},
    {"path":"BarkingKittens/Personal-Attack3.png","format":"webp","width":720,"height":1027,"bytes":133738,"sha256":"10be5d38dc740ccc8f1d3423fe7cae15fe65f8d5830c63221b4453805402cbcc"},
    {"path":"BarkingKittens/Personal-Attack4.png","format":"webp","width":720,"height":1027,"bytes":149702,"sha256":"80fe4e157bc28c7659d6a6062781964b9821b5e44a7fb95139d1ed765edb78d6"},
  ],
  "barking:share-future": [
    {"path":"BarkingKittens/Share-the-Future1.png","format":"webp","width":720,"height":1036,"bytes":151244,"sha256":"35fff4702af3855b9ecdc2ee67980c9639dc9a61283d97b12b195237a2e28bce"},
    {"path":"BarkingKittens/Share-the-Future2.png","format":"webp","width":720,"height":1033,"bytes":145006,"sha256":"53a8998cbbbcb0ca9fedc2e80eb69d83d7c302618725044d4c922d3f16d6c05a"},
  ],
  "barking:tower-of-power": [
    {"path":"BarkingKittens/Tower-of-Power.png","format":"webp","width":720,"height":1035,"bytes":187592,"sha256":"b72f94e31c359f9daf475a3bd0b8ca13668d2f605db7507b5830eec5dc3f93c5"},
  ],
  "barking:ill-take-that": [
    {"path":"BarkingKittens/Ill-Take-That1.png","format":"webp","width":720,"height":1019,"bytes":124928,"sha256":"6202dae6043d4d604eb1d30a1d9bbb993d655273977f876bed370717b15a9292"},
    {"path":"BarkingKittens/Ill-Take-That2.png","format":"webp","width":720,"height":1037,"bytes":139118,"sha256":"5c5b2290614ad005ccb11ae2ec570dcb6d1afe212c9fda627b66c32de5e0aefd"},
    {"path":"BarkingKittens/Ill-Take-That3.png","format":"webp","width":720,"height":1013,"bytes":130026,"sha256":"adfa74a69090fd09bf05cdc6f986c7cd60c52aabd57efa1a29c0f9d672a21f42"},
    {"path":"BarkingKittens/Ill-Take-That4.png","format":"webp","width":720,"height":1031,"bytes":153760,"sha256":"63e148b0a1a08ae8b2ae500b90b6a4cb28cbe3ccf8863aa86020d5c999d81582"},
  ],
  "barking:super-skip": [
    {"path":"BarkingKittens/Super-Skip.png","format":"webp","width":720,"height":1022,"bytes":143386,"sha256":"a9227e00c315673ee6c833c6c4ba6741a59442bb29aa7760151698c2132ad529"},
  ],
  "barking:potluck": [
    {"path":"BarkingKittens/Pot-Luck1.png","format":"webp","width":720,"height":1037,"bytes":160800,"sha256":"43b90f5038a7876eeceb0bd3d42a824263a10c51c3b95e75f4e5dcbb7636c9ef"},
    {"path":"BarkingKittens/Pot-Luck2.png","format":"webp","width":720,"height":1023,"bytes":148636,"sha256":"9344e3ba680f47c1fa75fb807db1a1ea2f8cbdb1d63b710aaf0411fa7d42e9e1"},
  ],
  "coffee:coffee-kitten": [
    {"path":"CoffeeKittens/Coffee Kitten.png","format":"png","width":1875,"height":2625,"bytes":722425,"sha256":"de9548d6a485e1ead3822c143fd81e6d27575ea3aef879e5f00fe0b104d8c152"},
  ],
  "coffee:caffeine": [
    {"path":"CoffeeKittens/Caffeine.png","format":"png","width":1875,"height":2625,"bytes":595303,"sha256":"0970bc783b6c4d8fb8f0d03bc53298d1ee6d6361b0159fe0b5c0bf71d9b40c6b"},
  ],
  "coffee:amateur-archaeology": [
    {"path":"CoffeeKittens/Amateur archaeology.png","format":"png","width":1875,"height":2625,"bytes":612126,"sha256":"79244b5fded94817e11593c8d83ee2e3e72eac43f0f644b79f214a53f5bf674b"},
  ],
  "coffee:change-seats": [
    {"path":"CoffeeKittens/Change Seats-1.png","format":"png","width":1875,"height":2625,"bytes":2060549,"sha256":"c4e4dafeb8525dc98aec442c338219facb3bcda19ad1d337a13eeb12f175e32e"},
    {"path":"CoffeeKittens/Change Seats-2.png","format":"png","width":1875,"height":2625,"bytes":1418076,"sha256":"ace8bb7d384f61ed1c4f7a01c6ef815c7d57268bd147b044f009de938917f040"},
    {"path":"CoffeeKittens/Change Seats-3.png","format":"png","width":1875,"height":2625,"bytes":1547369,"sha256":"40535884fdb89725a4e505c2e20bc21217a9daff6ec9c73c90965a1467d808c8"},
  ],
  "coffee:coin-toss": [
    {"path":"CoffeeKittens/Coin Toss-1.png","format":"png","width":1875,"height":2625,"bytes":760628,"sha256":"f66615b76849e9ea737310b2c7b74b94d2cd15edccd5d0876a1872b09af8333b"},
    {"path":"CoffeeKittens/Coin Toss-2.png","format":"png","width":1875,"height":2625,"bytes":759063,"sha256":"0f49ca3a96dffe990a7cd6c8d4601e5f5de744ddd3abeddfd7975be0debf01a4"},
  ],
  "coffee:copycat": [
    {"path":"CoffeeKittens/Copycat-1.png","format":"png","width":1875,"height":2625,"bytes":821630,"sha256":"4a529887fdc8cbae6931775163ef7606905186cb0591cc1df37f6feea258bb3a"},
    {"path":"CoffeeKittens/Copycat-2.png","format":"png","width":1875,"height":2625,"bytes":1298645,"sha256":"194bc5eb32d53d6203cc8f1c60ad6ae4b4627826f1c6c230d0fd321c5e8c2566"},
    {"path":"CoffeeKittens/Copycat-3.png","format":"png","width":1875,"height":2625,"bytes":1615915,"sha256":"06135a3adc90a09bcf089e94c5c536e153253b864a70ee18eda37eee2865964e"},
  ],
  "coffee:disable": [
    {"path":"CoffeeKittens/Disable-1.png","format":"png","width":1875,"height":2625,"bytes":753028,"sha256":"857f7697eca3c4ee139f44b57c9e5d71ca6105ee2bbc3341f408973c19614e8f"},
    {"path":"CoffeeKittens/Disable-2.png","format":"png","width":1875,"height":2625,"bytes":882402,"sha256":"300ccf318b008307866003d89e80e889814fd0cac3b65dc75eac533589fdd695"},
    {"path":"CoffeeKittens/Disable-3.png","format":"png","width":1875,"height":2625,"bytes":901839,"sha256":"020bce71b3b072c9082d63cac6bdbcfcb99ea65ed3045da444564601cf27bb1e"},
  ],
  "coffee:force-play": [
    {"path":"CoffeeKittens/Force Play-1.png","format":"png","width":1875,"height":2625,"bytes":538209,"sha256":"d1e844e881292bb0cb8b94e95d54de2717f3c5b67afbd91795dce116ae88f31c"},
    {"path":"CoffeeKittens/Force Play-2.png","format":"png","width":1875,"height":2625,"bytes":808741,"sha256":"960f367a417637eebf077d37229f170920c8df5ae0c75c6576f5c6a1350f0c62"},
    {"path":"CoffeeKittens/Force Play-3.png","format":"png","width":1875,"height":2625,"bytes":653894,"sha256":"c1257718afc2d5df83b9609ed5d295725066d1de0858ea114650e616f305a396"},
    {"path":"CoffeeKittens/Force Play-4.png","format":"png","width":1875,"height":2625,"bytes":675844,"sha256":"ede184164fd98816d4d8dc3df584a1f074af3c78b71af2535a5f6b0e405e4339"},
  ],
  "coffee:foresight": [
    {"path":"CoffeeKittens/Foresight v1.png","format":"png","width":1875,"height":2625,"bytes":5117616,"sha256":"2090ab84e6442718b380f37d26f8ff4f1b541170ca5a28d6be384dccc6ddabf8"},
    {"path":"CoffeeKittens/Foresight v2.png","format":"png","width":1875,"height":2625,"bytes":2436193,"sha256":"7eb4741cea66f1e072153550ca6c4d1e63284aaf2770d1358a663ba878b3da07"},
  ],
  "coffee:now-plus": [
    {"path":"CoffeeKittens/NOW+.png","format":"png","width":1875,"height":2625,"bytes":477809,"sha256":"20551bc9757eefea42951869bb691c2e6b42e2264a0a5f1428bdcc2bc348a444"},
  ],
  "coffee:super-nope": [
    {"path":"CoffeeKittens/Super NOPE.png","format":"png","width":1875,"height":2625,"bytes":1032011,"sha256":"43ddb631ab4dfa39a02ed11bbaad3f628db91f6da1af689daaabdf90db643711"},
  ],
  "coffee:the-chosen-one": [
    {"path":"CoffeeKittens/The Choosen One-1.png","format":"png","width":1875,"height":2625,"bytes":759876,"sha256":"ae63e13d496d65e98fe2f10697e443e8b4f9a970aca0a1b38c0bfc3087f3f914"},
    {"path":"CoffeeKittens/The Choosen One-2.png","format":"png","width":1875,"height":2625,"bytes":799862,"sha256":"b1b3c7f7e39d4062e31182dcf7d07804f1197bf5eff9fb43ac1c510eda56a147"},
  ],
  "coffee:garbage-pile": [
    {"path":"CoffeeKittens/Garbage Pile.png","format":"png","width":1875,"height":2625,"bytes":1047121,"sha256":"3059449b51d403729724aaba61901b26af0519bca05a11f23709bb0c73b4c74b"},
  ],
  "coffee:evil-plot": [
    {"path":"CoffeeKittens/Evil Plot.png","format":"png","width":1875,"height":2625,"bytes":717657,"sha256":"34c4a3ac31059123321618837e9b1b9793b49ce9c74c098d17cefe448eb6cf6e"},
  ],
  "timebomb:timebomb": [
    {"path":"TimebombKittens/Timebomb-Kitten1.png","format":"webp","width":878,"height":1364,"bytes":176402,"sha256":"5e5cd5573b0e44650fc16b71500c561076ad883f137753408c5c3dd654d7d0b0"},
    {"path":"TimebombKittens/Timebomb-Kitten2.png","format":"webp","width":772,"height":1198,"bytes":132356,"sha256":"41a6f95745a24a2495236c9bedbf702df3ec9d2044a843f85fdb7bec694343e6"},
  ],
  "timebomb:defuse-timebomb": [
    {"path":"TimebombKittens/Defuse-Timebomb1.png","format":"webp","width":692,"height":1084,"bytes":101794,"sha256":"35cc591b0b2933a1e351b35226674c7260ab97eb123b9de5372583b324ee3eeb"},
    {"path":"TimebombKittens/Defuse-Timebomb2.png","format":"webp","width":882,"height":1362,"bytes":134904,"sha256":"4059c16ba2957cacd2895e48205cee1ba594b594822eb619a3e647da8960bf62"},
    {"path":"TimebombKittens/Defuse-Timebomb3.png","format":"webp","width":730,"height":1128,"bytes":100080,"sha256":"84c74dc41e1999d69a49010819d7edc1baeb906bb6a49f36e032023e71b6048f"},
  ],
  "timebomb:blind": [
    {"path":"TimebombKittens/Blind.png","format":"webp","width":924,"height":1424,"bytes":97140,"sha256":"bec07aee52a6fc049a35a1aa4111ce764a79ceede706b6098be0e197fede434f"},
  ],
  "timebomb:search": [
    {"path":"TimebombKittens/Search1.png","format":"webp","width":784,"height":1214,"bytes":112072,"sha256":"a153505ae557053cae58efa0a20be5fe2aaf91dd3f1559ede32e8ef869d8f5e8"},
    {"path":"TimebombKittens/Search2.png","format":"webp","width":836,"height":1290,"bytes":138744,"sha256":"ffbe8249b66d14b384f4f4b330339c89bc9b9ca94f88de2afeb65f0c41a1362d"},
    {"path":"TimebombKittens/Search3.png","format":"webp","width":928,"height":1430,"bytes":153478,"sha256":"6815a4e93088a762bd533d85801474cc7430cc5f3fdae0d057f63f8af6b8832a"},
  ],
  "timebomb:discard": [
    {"path":"TimebombKittens/Discard1.png","format":"webp","width":728,"height":1128,"bytes":101952,"sha256":"23e162d248d3bd3d700a8b2930444248bda6db08ed36037d3b93e58acf2031aa"},
    {"path":"TimebombKittens/Discard2.png","format":"webp","width":830,"height":1286,"bytes":119090,"sha256":"843de1f29d7ca40b2607ce2d53574e1013d2c96eb29c14fb5282675582a52d39"},
    {"path":"TimebombKittens/Discard3.png","format":"webp","width":790,"height":1216,"bytes":117270,"sha256":"4a04d3e732658e6f6a776ffa0f384375c4ffdfd13fa6fb5af2a492de0b5fa782"},
  ],
  "timebomb:copy-cat": [
    {"path":"TimebombKittens/Copy1.png","format":"webp","width":1000,"height":1552,"bytes":157060,"sha256":"1b11e1a37429ea5b18589c44e952fe36cbd3317fc184671575089f726043a07a"},
    {"path":"TimebombKittens/Copy2.png","format":"webp","width":662,"height":1028,"bytes":98714,"sha256":"2638354017b5e73bc23f907c63da0c07de3b042248929abb63947444e389c78d"},
    {"path":"TimebombKittens/Copy3.png","format":"webp","width":840,"height":1298,"bytes":133710,"sha256":"64fdd159fc47eca37bfee3b05f9e71b0b33fb6d938a096d32e83e611419c5c9d"},
  ],
  "attack:kitty-rick": [
    {"path":"UnrylyKittens/Kitty Rick.png","format":"png","width":1875,"height":2625,"bytes":1606307,"sha256":"26c617f26599da22d5c2e84f750016c87c9840a568f8fb1ee2d35cb338b16b83"},
  ],
  "attack:corona-kitten": [
    {"path":"UnrylyKittens/Corona Kitten.png","format":"png","width":1875,"height":2625,"bytes":1784340,"sha256":"ef6f82bf9a8cc2bf8cd89b24a339b5f7fd271a276010d7376d3fb5548cc09494"},
  ],
  "attack:defuse": [
    {"path":"UnrylyKittens/Corona Defuse.png","format":"png","width":1875,"height":2625,"bytes":1264189,"sha256":"98ffda1b93ac1094ed059176e95b8908ec3adf041ad97031120d3f753ba21283"},
  ],
  "attack:streaking-kitten": [
    {"path":"UnrylyKittens/Streaking Corona Kitten.png","format":"png","width":1875,"height":2625,"bytes":938065,"sha256":"05e878076a7d974454d993982dae12872839f70846942d6619acddb1f29b15a7"},
  ],
  "attack:impending-imploding-kitten": [
    {"path":"UnrylyKittens/Impending Imploding Kitten.png","format":"png","width":1875,"height":2625,"bytes":1252836,"sha256":"c4148ed8580fe168266d2046ba771f8ff3ebb67ff8857b402c63c85032f63c2a"},
  ],
  "attack:black-hole": [
    {"path":"UnrylyKittens/Black Hole-V1.png","format":"png","width":1875,"height":2625,"bytes":385354,"sha256":"99b8dbbe323060ca631471f582fbc9e3b4e7741c5bcb98460d686c9c438e577c"},
    {"path":"UnrylyKittens/Black Hole-V2.png","format":"png","width":1875,"height":2625,"bytes":1931195,"sha256":"78044d7aaaa93f3c560cf9886b87e2fa8d66c2caf6d0feaaa1bd2de9b8db5ebf"},
  ],
  "attack:counting-kitten": [
    {"path":"UnrylyKittens/Counting Kitten.png","format":"png","width":1875,"height":2625,"bytes":789711,"sha256":"9402e1779ccb6af2948ee01e7edecc39c73b04fd67735a8573677f81d65468bc"},
  ],
  "attack:odd-kitten": [
    {"path":"UnrylyKittens/Odd Exploding Kitten.png","format":"png","width":1875,"height":2625,"bytes":2495003,"sha256":"81a9098b9df0f2f819e355d77d9d4efc84eaa99530fe59c14d753454fb838aa3"},
  ],
  "attack:unholy-kitten": [
    {"path":"UnrylyKittens/Unholy Kitten.png","format":"png","width":1875,"height":2625,"bytes":1193109,"sha256":"4edc657a2937f22b0ba59012c3baf06a6be0b1947463318901fe036eab6eea14"},
  ],
  "attack:super-defuse": [
    {"path":"UnrylyKittens/Super Defuse.png","format":"png","width":1875,"height":2625,"bytes":1443024,"sha256":"4cd494c74a72a6dbdc9369b2ff9eac960d8ab10df30f47263ac8bdb94836e373"},
  ],
  "attack:caternator": [
    {"path":"UnrylyKittens/Caternator.png","format":"png","width":1875,"height":2625,"bytes":3019677,"sha256":"7abdaeb1d0379efbe3d5a624976d0638c1b64cf21e7761285d37e1981c9232e7"},
  ],
  "attack:the-twins": [
    {"path":"UnrylyKittens/The twins.png","format":"png","width":1875,"height":2625,"bytes":1129439,"sha256":"1600540887de961ec1c72d4541c9aea069ccac27990128f9915fcc9dbe548295"},
  ],
  "attack:nope": [
    {"path":"UnrylyKittens/NOPE-1.png","format":"png","width":1875,"height":2625,"bytes":1384049,"sha256":"4a25428be481be32f8bafeb5397c426276ed0fbdca3d2b66eb5cd5c664a9045d"},
    {"path":"UnrylyKittens/NOPE-2.png","format":"png","width":1875,"height":2625,"bytes":661161,"sha256":"158ea20bd8e860bb08f46827e0a5b5be99be180f205a6689aeef6913c52ec380"},
  ],
  "attack:self-attack": [
    {"path":"UnrylyKittens/Self Attack-1.png","format":"png","width":1875,"height":2625,"bytes":1139530,"sha256":"a309d120b8f7165048f5c8b8602ffd2600cc5ddf27a86a768ba110859537ccad"},
    {"path":"UnrylyKittens/Self Attack-2.png","format":"png","width":1875,"height":2625,"bytes":1279296,"sha256":"f1c3f798d1fd01ae4b404acade22d7d047a737cc3454cc0a1f5f10eedff175b2"},
    {"path":"UnrylyKittens/Self Attack-3.png","format":"png","width":1875,"height":2625,"bytes":1325876,"sha256":"46f9e91ccca69e6599dcd6427a80138d8f956896a99846e287bada99e5d980c3"},
  ],
  "attack:creepy-peeky": [
    {"path":"UnrylyKittens/Creepy Peeky.png","format":"png","width":1875,"height":2625,"bytes":621894,"sha256":"7ba398225a2a8661905117714577cdaf8ca134ab89490c570ea44dea67750e53"},
  ],
  "attack:annoy-diarrhea-kitty": [
    {"path":"UnrylyKittens/Annoy Diarrhea Kitty-1.png","format":"png","width":1875,"height":2625,"bytes":1015108,"sha256":"5908a6832fbbde421f3500e4197adc55c074ab23b90359c1f8dd415effc2f24f"},
    {"path":"UnrylyKittens/Annoy Diarrhea Kitty-2.png","format":"png","width":1875,"height":2625,"bytes":980206,"sha256":"4d6bb60d0ebed370818a8c5c0c134863f0bebda68464a3f6eb5e8f95ede20bcf"},
  ],
  "attack:battle-hamster": [
    {"path":"UnrylyKittens/Battle hamster.png","format":"png","width":1875,"height":2625,"bytes":1079006,"sha256":"669b59568d16a2050b6198b08a0ae9c32a9bfeae37e2c6c89234a77bb95973f2"},
  ],
  "attack:hip-bat": [
    {"path":"UnrylyKittens/Hip bat.png","format":"png","width":1875,"height":2625,"bytes":756809,"sha256":"f82a28662873b8ffe395a9f4c6a27c12d4b8373de6d9ad282fd09180421a707e"},
  ],
  "gambling:disable": [
    {"path":"UnholyKittens/Disable.png","format":"png","width":1875,"height":2625,"bytes":1073414,"sha256":"2ce993e86c0b3f2644eb1562cb847b1d038c52b5f6789dff22330529eab76f6a"},
  ],
  "gambling:gambler": [
    {"path":"UnholyKittens/Gambler.png","format":"png","width":1875,"height":2625,"bytes":1231728,"sha256":"fde751fef83c7026bc86ab1e1de341b29c273ac6c81efa04fb166f0b1e2f830f"},
  ],
  "gambling:dig-deep": [
    {"path":"UnholyKittens/Dig Deep.png","format":"png","width":1875,"height":2625,"bytes":678997,"sha256":"2b3875db45df35563fec2aca3e12e48a1481117106044707d5a7196d2b5751f9"},
  ],
  "gambling:unholy-kitten": [
    {"path":"UnholyKittens/Unholy Kitten.png","format":"png","width":1875,"height":2625,"bytes":1193109,"sha256":"4edc657a2937f22b0ba59012c3baf06a6be0b1947463318901fe036eab6eea14"},
  ],
  "gambling:loaded-dice": [
    {"path":"UnholyKittens/Loaded Dice.png","format":"png","width":1875,"height":2625,"bytes":1031443,"sha256":"ff62d9087247133aa8d501cf6190c590772e9e7601a7572aa977885cc420d27f"},
  ],
  "gambling:alter-dice": [
    {"path":"UnholyKittens/Alter Dice.png","format":"png","width":1875,"height":2625,"bytes":1954970,"sha256":"eb3a625a91d21504c471121438228b1c93454f803214e3b53eb45c4a11785752"},
  ],
  "gambling:future-dice": [
    {"path":"UnholyKittens/Future Dice.png","format":"png","width":1875,"height":2625,"bytes":914621,"sha256":"75a41cd0787f8ae376cae499720be7adb4eb02966eb6198fce2fd36c2cf867be"},
  ],
  "gambling:unholy-hybrid": [
    {"path":"UnholyKittens/Unholy Hybrid-1.png","format":"png","width":1875,"height":2625,"bytes":898578,"sha256":"62384c9e49e8c08989c3f8175443479d80e9add8697c810d3c75662a3421498e"},
    {"path":"UnholyKittens/Unholy Hybrid-2.png","format":"png","width":1875,"height":2625,"bytes":1058903,"sha256":"7cebb69c3d31e9c87a2931dd04268a31b0f9f34d6f57b717be6565645ed79866"},
    {"path":"UnholyKittens/Unholy Hybrid-3.png","format":"png","width":1875,"height":2625,"bytes":1244209,"sha256":"3aa87e14a3ad3dcf5a0fb493b812b9b6b9768f174334428ced67d8b889021048"},
  ],
};
