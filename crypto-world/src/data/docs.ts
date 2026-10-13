/** Readable texts attached to plaques, boards, logs and viewpoints. */
export interface Doc {
  title: string;
  body: string[];
  style?: 'plaque' | 'note' | 'board' | 'terminal' | 'view';
}

export const DOCS: Record<string, Doc> = {
  'plaque.firstblock': {
    title: 'The First Block',
    style: 'plaque',
    body: [
      'This sculpture balances eight blocks on a single corner. Remove any one of them and the others would fall.',
      'It was placed here on the day Chain City was founded, as a reminder: every block depends on the one before it.',
      '“Don’t trust. Verify. Then have a coffee.” — Founders’ motto (coffee clause added later)',
    ],
  },
  'board.city': {
    title: 'Consensus Square Community Board',
    style: 'board',
    body: [
      'LOST: one transaction, 0x7a1e…c0de. Answers to “lucky”. — Dex',
      'FOR SALE: receipt. Excellent provenance. Ask at the gallery. — W.',
      'Reminder: the café contract has been updated. Coffee is no longer free. We know. We’re sad too. — Byte',
      'Has anyone seen my relay crystal? Asking for a dish. — Node Heights maintenance',
      'Weekly meetup: “gm” at dawn by the sculpture. Bring your own sunrise.',
    ],
  },
  'cafe.machine': {
    title: 'Espresso Machine',
    style: 'note',
    body: ['A chrome espresso machine running the CoffeeVault contract. A sticky note says: “If it says PAID and nobody paid, call Nova.”'],
  },
  'busstop.timetable': {
    title: 'Arrivals — Chain City',
    style: 'board',
    body: [
      'Morning shuttle: arrives at dawn, carries one passenger, rarely anyone.',
      'Afternoon shuttle: cancelled (driver went to see the beacons).',
      'Night shuttle: theoretical.',
      'Tip: the planet is small. Walking is usually faster.',
    ],
  },
  'cabin.archive': {
    title: 'Block’s Archive Boxes',
    style: 'note',
    body: [
      'BOX 1: Block 0 — the genesis block. Reward unspendable. Message priceless.',
      'BOX 7: Block 210,000 — the first halving. Rewards cut in half. Morale, oddly, doubled.',
      'BOX 12: Outage log. Every outage begins at the fifth link. Coincidence? (No.)',
    ],
  },
  'sat.rig': {
    title: 'Sat’s Old Rig',
    style: 'note',
    body: [
      'A beige desktop tower humming on the porch. A strip of tape on the side reads “CPU MINER — DO NOT UNPLUG — NOT EVEN FOR TOAST”.',
      'Its little green light blinks once every few seconds. It has been mining since before there were roads.',
    ],
  },
  'henge.terminal': {
    title: 'Server Henge — Ancient Terminal',
    style: 'terminal',
    body: [
      '> uptime: 5,113 days',
      '> These cabinets once ran the entire network. Now they hold up the sky, or at least the lintels.',
      '> Visitors are asked not to “reboot the henge”. It takes a decade.',
    ],
  },
  'lookout.halving': {
    title: 'Halving Hill Lookout',
    style: 'view',
    body: [
      'From here the planet curves away on every side. To the south-west, Chain City. To the north, the dark green of Whitepaper Woods.',
      'Local legend: every view from Halving Hill is half as far as it looks. Nobody has measured. Everybody believes it.',
    ],
  },
  'memorial.genesis': {
    title: 'The Genesis Stone',
    style: 'plaque',
    body: [
      'Carved into the stone, in letters worn soft by weather:',
      '“The Times 03/Jan/2009 Chancellor on brink of second bailout for banks”',
      'Beneath it, newer letters: “Every block remembers the one before it.”',
      'Four stone dials stand in an arc behind the monolith. Each turns through the digits 0–9. A small inscription: “Set us to the day it began — the day, then the month.”',
    ],
  },
  'lighthouse.log': {
    title: 'Lighthouse Log',
    style: 'note',
    body: [
      'Day 1: Lit the lamp. Saw a boat. Boat saw lamp. Success.',
      'Day 214: A whale. Or a very large wallet. Hard to tell at night.',
      'Day 3,001: The beacon on top only answers the Chain. Leave it be until the Chain is ready.',
    ],
  },
  'gallery.sculpture': {
    title: '“Diamond Hand” — artist unknown',
    style: 'plaque',
    body: ['A crystal hand that refuses to let go of anything. Acquired by the gallery for an undisclosed amount, which was, in fact, disclosed, many times, by Wallet.'],
  },
  'mural.wagmi': {
    title: 'WAGMI — a mural by MEME',
    style: 'board',
    body: [
      'Twelve metres of blue wave, a frog in sunglasses, and four letters: W A G M I.',
      'A tiny note painted in the corner: “inspired by Sunset.png (Pixel). this is a TRIBUTE.”',
    ],
  },
  'checkpoint.rules': {
    title: 'Validator Checkpoint — Rules',
    style: 'board',
    body: [
      '1. All visitors will be validated.',
      '2. Validation requires twelve confirmations. The validator will provide them.',
      '3. Objects leaving the plateau must be logged. (See rule 1.)',
      '4. Please do not lean on the barrier.',
    ],
  },
  'institute.telescope': {
    title: 'Rooftop Telescope',
    style: 'view',
    body: ['Through the eyepiece the whole curve of the planet slides by — the coast glittering, the mining fans spinning, and far away the tiny sculpture of the First Block turning in its square.'],
  },
  'lookout.heights': {
    title: 'Edge of the Network',
    style: 'view',
    body: ['Below you, The Chain wraps around the planet like a ribbon. From here you can see three districts at once, and the horizon bending to hide the other two.'],
  },
  'lookout.sunset': {
    title: 'Sunset Validator',
    style: 'view',
    body: ['The best sunset on the planet, according to Kai, who validated it personally. Twelve confirmations.'],
  },
  'camp.map': {
    title: 'Alpha’s Map',
    style: 'note',
    body: [
      'X — Grotto (carvings!! do not lick)',
      'X — desk in clearing (someone left mid-sentence??)',
      'X — glowing thing at Node Heights (TAKEN, clearly abandoned) — UPDATE: NOT ABANDONED. LOAD-BEARING.',
      'X — Cold Storage vault, south pole (locked. rude.)',
    ],
  },
  'pole.north': {
    title: 'True North',
    style: 'plaque',
    body: ['You are standing at the top of the world. From here, every direction is south.', 'Population: you, and a confused squirrel.'],
  },
  snowman: {
    title: 'The Snowman',
    style: 'note',
    body: ['A cheerful snowman holds a tiny hardware wallet in one twig hand. A note at its feet: “Cold storage. Get it?”'],
  },
};

export interface SecretDef {
  title: string;
  body: string[];
}

/** The seven discoveries. */
export const SECRETS: Record<string, SecretDef> = {
  pizza: {
    title: 'The Most Expensive Lunch',
    body: [
      'Two pizza boxes on the bakery roof, long empty. A receipt is taped to the lid:',
      '“2 large pizzas — paid: 10,000 coins.”',
      'Years later those coins would be worth a small city. Somebody had to buy the first thing. Somebody had to prove it could be done.',
    ],
  },
  devnotes: {
    title: 'The Overlooked Terminal',
    body: [
      'A terminal behind Hashrate Hall, covered in sticky notes:',
      '“// TODO: remove before mainnet” (it was not removed)',
      '“if it works, don’t touch it. if it doesn’t, also don’t touch it, call Hash”',
      '“password is NOT ‘hunter2’” (it is)',
    ],
  },
  mural: {
    title: 'The Chain Remembers',
    body: [
      'A timeline carved into the grotto wall by the founders, block by block:',
      'Genesis. The first transaction. Two pizzas. The first halving. A great fork, and a friendly one. The merge.',
      'At the end of the carving, a small figure in a long coat walks between five circles. Underneath: “the Messenger”.',
    ],
  },
  'genesis-computer': {
    title: 'The Genesis Machine',
    body: [
      'A computer older than every building on the planet. You press the key, and the green screen wakes:',
      '“BLOCK 0 … MINED. MESSAGE ATTACHED. HELLO, WHOEVER COMES NEXT.”',
      'It goes back to sleep, looking very pleased with itself.',
    ],
  },
  devdesk: {
    title: 'The Abandoned Desk',
    body: [
      'A laptop still open, a cold coffee, a pyramid of energy-drink cans. The last line in the editor reads:',
      '“function fixEverything() { // back in five minutes”',
      'The calendar on the wall is three years old.',
    ],
  },
  vault: {
    title: 'Cold Storage',
    body: [
      'You type 2-1-0-0-0-0-0-0 into the keypad. Twenty-one, then six zeros. The door does not open — but a tiny screen lights up:',
      '“Correct. There will only ever be twenty-one million. The vault is full of something more valuable: patience.”',
      'Frost sparkles around the door as it settles back to sleep.',
    ],
  },
  'genesis-dials': {
    title: 'The Day It Began',
    body: [
      'The four dials click into place: 0 3 — 0 1. The third of January.',
      'A stone panel slides open at the foot of the monolith. Inside, a single folded note:',
      '“If you are reading this, the chain remembered you too. — the First Messenger”',
    ],
  },
};
