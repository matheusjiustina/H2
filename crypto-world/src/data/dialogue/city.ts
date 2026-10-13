import type { Conversation } from '../../gameplay/types';
import { active, all, avail, chatter, conv, done, not, obj, P } from './helpers';

export const CITY_DIALOGUE: Conversation[] = [
  // ======================================================================== NODE
  conv('node.m01.meet', 'node', 80, obj('m01', 'meet'), [
    { text: 'Oh! A new face. You came in on the morning shuttle? Nobody takes the morning shuttle.', anim: 'wave' },
    P('I’m here about the Messenger job.'),
    { text: 'The Messenger job. Right. Yes. That is a real job and I definitely posted it.', anim: 'think' },
    { text: 'Here’s the short version: this planet runs on The Chain — five districts, linked by relays, all the way around.', anim: 'talk' },
    { text: 'Lately the links keep dropping. Messages get stuck, parcels get lost, and Gas blames me. I blame physics.', anim: 'shrug' },
    { text: 'What we need is someone who walks. Someone who carries what the network can’t.', anim: 'point' },
    { text: 'Use the Messenger Terminal right here. It’ll register you on the network. Try not to break it — it’s older than me.', anim: 'talk', effects: [{ advance: ['m01', 'meet'] }] },
  ]),
  conv('node.m01.wait', 'node', 60, obj('m01', 'terminal'), [
    { text: 'The terminal’s right behind me. Big amber light. You can’t miss it — people have tried.', anim: 'point' },
  ]),
  conv('node.m01.report', 'node', 80, obj('m01', 'report'), [
    { text: 'There it is — “MESSENGER: ACTIVE”. The terminal hasn’t said anything that cheerful in years.', anim: 'cheer' },
    { text: 'Welcome to The Chain, Messenger. Every resident on this planet will want something delivered. Most of it will be urgent. Some of it will be soup.', anim: 'talk' },
    { text: 'Press J — or Tab — any time to see your journal. The little marker at the top shows where you’re headed.', anim: 'point' },
    { text: 'Start with the Merkle Library next door. Genesis has had a letter waiting for a courier since before I was born.', anim: 'talk' },
    P('Anything else I should know?'),
    { text: 'Only that the planet is small. Keep walking in one direction and you’ll end up right back here. Most people find that comforting.', anim: 'nod' },
  ]),
  conv('node.m11.offer', 'node', 50, avail('m11'), [
    { text: 'Messenger. Something’s wrong at Node Heights. Comms Station 5 stopped answering at dawn.', anim: 'phone' },
    { text: 'Station 5 is the fifth link of The Chain. With it dark, the ring is broken — and Luna’s mystery signal came from right there.', anim: 'think' },
    { text: 'Oracle is up at Consensus Control, but Oracle answers questions with more questions. I need eyes on that station.', anim: 'talk', choices: [
      { text: 'I’ll go to Node Heights.', effects: [{ startMission: 'm11' }] },
      { text: 'Not yet — I have other deliveries.', end: true },
    ] },
    { text: 'Take the switchback road up from The Chain, west of the city. Kai will want to validate you. Let him. It’s faster.', anim: 'point' },
  ]),
  conv('node.m11.wait', 'node', 30, active('m11'), [
    { text: 'Station 5 is on the plateau, north-east of the control centre. Watch for the big dish that isn’t turning.', anim: 'point' },
  ]),
  conv('node.m12.offer', 'node', 55, avail('m12'), [
    { text: 'Every district is talking again. The archive is whole. Old Faithful is purring. Station 5 is back.', anim: 'cheer' },
    { text: 'There’s one thing left — and I’ve wanted to say this since the day you arrived.', anim: 'talk' },
    { text: 'Each district has a beacon. When all five are lit, the relays sync and someone signs the next block of The Chain at Consensus Control.', anim: 'point' },
    { text: 'Nobody has done it since the First Messenger. I think it should be you.', anim: 'nod', choices: [
      { text: 'Let’s light the Chain.', effects: [{ startMission: 'm12' }] },
      { text: 'Give me a moment first.', end: true },
    ] },
    { text: 'Consensus Square, the Genesis Stone, the lighthouse, Hashrate Hall and the north antenna on Node Heights. Then up to Consensus Control.', anim: 'talk' },
  ]),
  conv('node.m12.wait', 'node', 30, active('m12'), [
    { text: 'Five beacons, Messenger. The square’s sculpture is the closest — touch it and it’ll know what to do.', anim: 'point' },
  ]),
  conv('node.after', 'node', 25, done('m12'), [
    { text: 'Zero dropped packets since you signed the block. Zero! I keep refreshing the graph to check it isn’t broken.', anim: 'laugh' },
    { text: 'Gas still blames me for things. Old habits. But he says it with a smile now.', anim: 'talk' },
  ]),
  conv('node.intro', 'node', 5, undefined, [
    { text: 'If you need anything delivered, routed, or explained, I’m the person to ask. If you need it explained simply, ask Byte.', anim: 'talk' },
  ], true),
  ...chatter('node', [
    'Latency to the coast is 42 milliseconds. To Gas’s patience, considerably more.',
    'Fun fact: if every resident sent one message at the same time, the relays would be fine. If Dex sent one, they wouldn’t.',
    [{ text: 'I wear the headphones so people think I’m listening to music. I’m listening to packets.', anim: 'think' }, { text: 'They sound like rain.', anim: 'nod' }],
    'The Relay Office used to have a slogan: “Delivered, block by block.” Then someone stole the sign. We printed another one.',
    [{ text: 'Oracle taught me to read latency charts. Oracle also said I would “meet a traveller bearing patience”.', anim: 'talk' }, { text: 'I assumed it meant a parcel. It may have meant you.', anim: 'shrug' }],
  ], done('m01')),

  // ======================================================================== BYTE
  conv('byte.intro', 'byte', 6, undefined, [
    { text: 'Welcome to Proof of Brew! Every cup is verified by at least two baristas. Usually me, twice.', anim: 'wave' },
    { text: 'Developers come here for coffee. They stay to argue about blockchains. I make money on both.', anim: 'laugh' },
    P('What’s good here?'),
    { text: 'The Hodl Latte. You buy it, you never finish it, and you swear it was worth it.', anim: 'talk' },
  ], true),
  conv('byte.m04.byte', 'byte', 80, obj('m04', 'byte'), [
    P('Nova fixed the coffee contract. Espresso costs money again.'),
    { text: 'Oh thank goodness. I gave away four hundred espressos this week. Four hundred! The machine kept saying “paid”.', anim: 'shrug' },
    { text: 'And what was the bug? Let me guess. One missing character.', anim: 'think' },
    P('“prce” instead of “price”.'),
    { text: 'I knew it. It’s always a typo. My whole menu once said “Hodl Late”. Nobody complained; they were.', anim: 'laugh' },
  ]),
  conv('byte.m10.offer', 'byte', 50, avail('m10'), [
    { text: 'Messenger, I have an idea, and it’s a good one, and you’re going to do most of it.', anim: 'talk' },
    { text: 'People keep telling me rumours from across the planet, but nobody ever talks to each other directly. The districts feel… far apart.', anim: 'think' },
    { text: 'What if we made one message — a line from someone in every district — and pinned it on the board in Consensus Square?', anim: 'point', choices: [
      { text: 'I’ll collect the lines.', effects: [{ startMission: 'm10' }] },
      { text: 'Maybe later.', end: true },
    ] },
    { text: 'Sat in the hills, Wallet on the coast, Hash in the mines, and Kai up on Node Heights. If Kai asks for twelve confirmations, just nod.', anim: 'talk' },
  ]),
  conv('byte.m10.wait', 'byte', 30, all(active('m10'), not(obj('m10', 'byte'))), [
    { text: 'How’s the community message coming along? Remember: Sat, Wallet, Hash, Kai — then the board in the square.', anim: 'talk' },
  ]),
  conv('byte.m10.end', 'byte', 80, obj('m10', 'byte'), [
    { text: 'I saw it! Half the city has been standing around the board reading it out loud.', anim: 'cheer' },
    { text: '“Run your own node. Provenance is love. Clean your fans. Verify, then trust.” It reads like a poem written by four very different people.', anim: 'talk' },
    { text: 'Which it is. Coffee’s on the house — properly paid for, by me, through the fixed contract.', anim: 'laugh' },
  ]),
  conv('byte.after', 'byte', 25, done('m12'), [
    { text: 'Since the Chain lit up, the rumours arrive faster. Yesterday I heard about something before it happened.', anim: 'think' },
    { text: 'Turned out to be Oracle. Still counts.', anim: 'laugh' },
  ]),
  ...chatter('byte', [
    'Nova owes me for forty lattes. She says she’ll pay “after the next airdrop”. She’s been saying that for three airdrops.',
    'Meme pays me in drawings. I have a wall of them in the back. One of them is just a frog saying “gm”. It’s my favourite.',
    [{ text: 'You want a rumour? Hash talks to his machines. Not about work. About feelings.', anim: 'talk' }, { text: 'Don’t tell him I told you.', anim: 'nod' }],
    'Gas came in this morning and ordered “whatever’s cheapest”. I gave him water. He tipped generously. Confusing man.',
    'People ask why the café is called Proof of Brew. It’s because I proved I could brew. Took a while.',
    [{ text: 'The Diamond Hands salon across the way has never had a customer leave. Not because they love it.', anim: 'think' }, { text: 'Their door sticks.', anim: 'laugh' }],
  ]),

  // ======================================================================== NOVA
  conv('nova.intro', 'nova', 6, undefined, [
    { text: 'Oh hey! Sorry, I’m mid-deploy. Or mid-debug. Hard to tell from the inside.', anim: 'wave' },
    { text: 'I’m Nova. I build decentralised apps. Some of them even work on purpose.', anim: 'talk' },
  ], true),
  conv('nova.m04.offer', 'nova', 50, avail('m04'), [
    { text: 'I’ve been debugging this contract for three days. Byte’s espresso machine runs on it, and it keeps pouring free coffee.', anim: 'think' },
    { text: 'The tests say everything’s fine. The tests are lying. Or I wrote the tests. Which is the same thing.', anim: 'shrug' },
    { text: 'Could you look at it with fresh eyes? The code’s on the NovaLabs terminal, just outside the office.', anim: 'point', choices: [
      { text: 'I’ll take a look.', effects: [{ startMission: 'm04' }] },
      { text: 'I don’t really read code…', goto: 'reassure' },
    ] },
    { text: 'You’re a lifesaver. Or at least an espresso-saver.', anim: 'cheer', end: true },
    { label: 'reassure', text: 'You don’t need to! Bugs are usually just something that looks almost right. Look for the word that’s a little bit wrong.', anim: 'talk', choices: [
      { text: 'Okay, I’ll try.', effects: [{ startMission: 'm04' }] },
      { text: 'Maybe later.', end: true },
    ] },
  ]),
  conv('nova.m04.wait', 'nova', 30, obj('m04', 'review'), [
    { text: 'The terminal’s outside NovaLabs, north side of the city. Read every line. Then read it again, slowly, like a villain.', anim: 'point' },
  ]),
  conv('nova.m04.found', 'nova', 80, obj('m04', 'nova'), [
    P('The require line checks “prce”, not “price”. The machine compares against nothing.'),
    { text: 'No. No no no. Let me see—', anim: 'type' },
    { text: 'Three days. Three days, and the problem was one missing character.', anim: 'shrug' },
    { text: 'Deploying the fix… and… confirmed. Coffee costs three again. You should tell Byte before she finds out from her bank balance.', anim: 'cheer' },
  ]),
  conv('nova.after4', 'nova', 20, all(done('m04'), not(done('m12'))), [
    { text: 'I added a test called “coffee_is_not_free”. It passes. It is my favourite test.', anim: 'laugh' },
  ], true),
  conv('nova.after', 'nova', 25, done('m12'), [
    { text: 'I’m building a dApp that maps every relay of The Chain in real time. It’s mostly green now. It’s beautiful.', anim: 'talk' },
    { text: 'Fork already forked it. His version is purple. I’m choosing to be flattered.', anim: 'shrug' },
  ]),
  ...chatter('nova', [
    'Pro tip: if your code works on the first try, you’re probably running the wrong file.',
    [{ text: 'Fork keeps forking my projects. Last week he forked my to-do list.', anim: 'talk' }, { text: 'His version had more items. I don’t want to talk about it.', anim: 'shrug' }],
    'I don’t drink coffee for the caffeine. I drink it for the excuse to sit in Byte’s café and think.',
    'Gas fees are like weather. Everyone complains, nobody can change it, and Gas personally takes it very hard.',
    [{ text: 'Did you know smart contracts can’t be edited once they’re deployed?', anim: 'think' }, { text: 'It’s like getting a tattoo of your homework.', anim: 'laugh' }],
  ]),

  // ======================================================================== GENESIS
  conv('genesis.intro', 'genesis', 6, undefined, [
    { text: 'Welcome to the Merkle Library, young one. Every record here is linked to the one before it.', anim: 'nod' },
    { text: 'Change a single page and every page after it knows. It makes the cataloguing exhausting and the gossip impossible.', anim: 'talk' },
  ], true),
  conv('genesis.m02.offer', 'genesis', 50, avail('m02'), [
    { text: 'Ah. So you’re the new Messenger. Node told me — eventually, after telling me about latency for nine minutes.', anim: 'read' },
    { text: 'I have a letter that has waited a very long time. It was found in the archive, sealed, addressed only to “the keeper of the first records”.', anim: 'talk' },
    { text: 'These days that means Block, the historian, out in Genesis Hills. Would you carry it?', anim: 'think', choices: [
      { text: 'Of course. It’s literally my job.', effects: [{ startMission: 'm02' }, { give: 'archived-message' }] },
      { text: 'Not right now.', end: true },
    ] },
    { text: 'Follow The Chain east until the land starts rolling, then take the dirt path through the wooden gate. Block will be on the cabin porch, buried in boxes.', anim: 'point' },
    { text: 'And Messenger — don’t open it. Not because it’s secret. Because Block will want to break the seal himself. He’s dramatic.', anim: 'nod' },
  ]),
  conv('genesis.m02.wait', 'genesis', 30, active('m02'), [
    { text: 'Genesis Hills is east along The Chain. The letter will be fine. It has survived worse than a walk.', anim: 'nod' },
  ]),
  conv('genesis.m05.offer', 'genesis', 50, avail('m05'), [
    { text: 'Block wrote back. By letter. Delivered by you, I assume, so thank you twice.', anim: 'read' },
    { text: 'There is a hole in my archive, Messenger. Five historical blocks went missing years ago — records of the planet’s most important moments.', anim: 'think' },
    { text: 'They didn’t vanish. Things in a chain don’t vanish; they drift. One in every district, I suspect, glowing like they want to be found.', anim: 'talk', choices: [
      { text: 'I’ll bring them home.', effects: [{ startMission: 'm05' }] },
      { text: 'Maybe another day.', end: true },
    ] },
    { text: 'They look like small amber cubes. Look high and low — a henge, an island, a catwalk, a rooftop, and somewhere very close to these steps.', anim: 'point' },
  ]),
  conv('genesis.m05.wait', 'genesis', 30, obj('m05', 'collect'), [
    { text: 'Five amber blocks, one per district. One of them is so close to this library I can almost hear it humming.', anim: 'read' },
  ]),
  conv('genesis.m05.return', 'genesis', 80, obj('m05', 'return'), [
    { text: 'All five. Let me see them…', anim: 'inspect' },
    { text: 'The genesis block. The pizza block — two pizzas, ten thousand coins, the most expensive lunch in history. The first halving. The great fork. The merge.', anim: 'read' },
    { text: 'Each one points to the one before it. Nothing missing. Nothing changed. That is the most beautiful sentence an archivist can say.', anim: 'nod' },
    { text: 'The Merkle Library is whole again. Thank you, Messenger.', anim: 'bow' },
  ]),
  conv('genesis.after', 'genesis', 25, done('m12'), [
    { text: 'I added a new record to the archive: the night The Chain was relit. Signed by you. Linked to everything before it.', anim: 'read' },
    { text: 'One day someone will read it and wonder who you were. Like we wonder about the First Messenger.', anim: 'nod' },
  ]),
  ...chatter('genesis', [
    'People think archives are about the past. They’re about trust. If you can’t check yesterday, you can’t believe today.',
    [{ text: 'Sat and I knew each other when the first block was mined. He wore the same hat.', anim: 'read' }, { text: 'I mean the exact same hat. I have the records.', anim: 'nod' }],
    'The library’s dome was built so that a whisper on one side can be heard on the other. Very useful. Very bad for secrets.',
    'Block and I write letters. On paper. Delivered by hand. It’s slow, and that’s the point.',
  ]),

  // ======================================================================== DEX
  conv('dex.intro', 'dex', 6, undefined, [
    { text: 'Welcome, welcome! DEX — Decentralised EXchange of Knowledge. All trades simulated, all lessons real!', anim: 'wave' },
    { text: 'Nothing here costs anything. Except your pride, when the simulated market does the opposite of what you predicted.', anim: 'laugh' },
  ], true),
  conv('dex.m03.offer', 'dex', 50, avail('m03'), [
    { text: 'Messenger! Perfect timing. I have a mystery, and mysteries are terrible for business.', anim: 'talk' },
    { text: 'This morning I sent a transaction — pretend coins, educational purposes — and it never arrived. Not confirmed, not rejected. Just… gone.', anim: 'shrug' },
    { text: 'The market terminal at the end of the street can search for it. Will you trace it for me?', anim: 'point', choices: [
      { text: 'I’ll follow the trail.', effects: [{ startMission: 'm03' }] },
      { text: 'Not right now.', end: true },
    ] },
    { text: 'The transaction starts with 0x7a1e and ends with c0de. I chose it because it looked lucky.', anim: 'nod' },
  ]),
  conv('dex.m03.wait', 'dex', 30, all(active('m03'), not(obj('m03', 'dex'))), [
    { text: 'Any sign of my transaction? 0x7a1e…c0de. Lucky. Allegedly.', anim: 'think' },
  ]),
  conv('dex.m03.end', 'dex', 80, obj('m03', 'dex'), [
    P('Your transaction was stuck in the mempool. The fee was too low, so nobody picked it up.'),
    { text: 'Too low? I paid one satoshi per byte! That’s… that’s the minimum, isn’t it.', anim: 'shrug' },
    P('Gas bumped the fee. It confirmed a minute ago.'),
    { text: 'Confirmed! You hear that, market? Confirmed!', anim: 'cheer' },
    { text: 'Lesson of the day, students: the network isn’t slow. It’s a queue, and fees decide who goes first. I’ll put it on a sign.', anim: 'point' },
  ]),
  conv('dex.after', 'dex', 25, done('m12'), [
    { text: 'Trading volume is up four hundred percent since the Chain relit! Simulated volume, but still.', anim: 'cheer' },
  ]),
  ...chatter('dex', [
    'Rule one of the simulated market: buy high, sell low, write a blog post about it.',
    [{ text: 'Wallet bought a receipt from me yesterday. Just the receipt.', anim: 'talk' }, { text: 'He says it has “provenance”. I say it has my handwriting.', anim: 'laugh' }],
    'Every price on my screens is fake. That’s why they’re so honest.',
    'Gas says my transactions are slow because I underpay. I say they’re slow because I’m patient. We are both right. He’s more right.',
    'People ask me where the market is going. Sideways, mostly. Sometimes diagonally.',
  ]),

  // ======================================================================== PIXEL
  conv('pixel.intro', 'pixel', 6, undefined, [
    { text: 'Oh! Hi. Don’t look at the canvas. Or do. Actually, tell me if you like it. No, don’t.', anim: 'paint' },
    { text: 'People think my artwork is just pixels. They never ask what the pixels mean.', anim: 'think' },
    P('What do the pixels mean?'),
    { text: 'Thank you for asking. This one means “Tuesday”.', anim: 'laugh' },
  ], true),
  conv('pixel.m06.offer', 'pixel', 50, avail('m06'), [
    { text: 'I finished it. My best piece. It’s called “Sunset.png” and it took me a whole year, one pixel a day.', anim: 'talk' },
    { text: 'Wallet wants it for the Floor Price Gallery on Degen Coast. But Wallet is… intense. He looks at art like it owes him money.', anim: 'shrug' },
    { text: 'Would you deliver it for me? Please? I’ll make you a tiny portrait. Very tiny. Eight by eight.', anim: 'talk', choices: [
      { text: 'I’ll deliver it.', effects: [{ startMission: 'm06' }, { give: 'pixel-artwork' }] },
      { text: 'Not just yet.', end: true },
    ] },
    { text: 'Degen Coast is past Genesis Hills, along The Chain. The gallery is the white building with the big windows. You’ll hear Wallet before you see him.', anim: 'point' },
  ]),
  conv('pixel.m06.wait', 'pixel', 30, active('m06'), [
    { text: 'Is it there yet? Did he like it? Did he say “interesting”? “Interesting” is bad.', anim: 'think' },
  ]),
  conv('pixel.after6', 'pixel', 22, all(done('m06'), not(done('m12'))), [
    { text: 'You did it! Wallet sent me a letter. It said “acceptable”. From him, that’s practically a parade.', anim: 'cheer' },
    { text: 'And Meme sent me a drawing of my drawing with a frog in it. I’m… choosing to frame it.', anim: 'laugh' },
  ], true),
  conv('pixel.after', 'pixel', 25, done('m12'), [
    { text: 'I’m painting the night the Chain lit up. Five beams, one ring. I’m using every amber pixel I own.', anim: 'paint' },
  ]),
  ...chatter('pixel', [
    'Art tip: if you stare at a pixel long enough, it stares back. That’s when you know it’s done.',
    [{ text: 'Meme remixed my last piece. He added sunglasses.', anim: 'shrug' }, { text: 'It was a landscape.', anim: 'think' }],
    'The Pixel Loft has the best light in the city. Mostly because I painted a sun on the ceiling.',
    'Someday I want to paint the whole planet from above. It would be a very small canvas. And very round.',
  ]),

  // ======================================================================== GAS
  conv('gas.intro', 'gas', 6, undefined, [
    { text: 'Welcome to the Gas Station. Fees go in, transactions go out, and I go slightly grey.', anim: 'shrug' },
    { text: 'The entire city is connected. Unfortunately, so is every network problem.', anim: 'think' },
  ], true),
  conv('gas.m03.gas', 'gas', 80, obj('m03', 'gas'), [
    P('Dex’s transaction is stuck at the bottom of your mempool monitor.'),
    { text: 'Let me guess. Zero-point-nothing fee, sent during the morning rush, signed “trust me”.', anim: 'inspect' },
    { text: 'Here’s the thing: blocks only have so much room. Miners pick the transactions that pay the most. Underpay, and you wait. Forever, sometimes.', anim: 'talk' },
    { text: 'But we can bump it — replace it with the same transaction and a better fee. There. Done. It’ll be in the next block.', anim: 'hammer' },
    { text: 'Tell Dex the network isn’t slow. It’s busy. There’s a difference, and it’s me.', anim: 'point' },
  ]),
  conv('gas.m07.offer', 'gas', 50, avail('m07'), [
    { text: 'Messenger, I need your legs. Mine are busy standing here worrying.', anim: 'think' },
    { text: 'The link between Chain City and the Mining District is jammed. Everything Hash sends me arrives an hour late, and everything I send him arrives as a complaint.', anim: 'shrug' },
    { text: 'Two things need a reset: the west relay pylon on The Chain, between Node Heights and here, and the relay panel in the Mining District.', anim: 'point', choices: [
      { text: 'I’ll clear the link.', effects: [{ startMission: 'm07' }] },
      { text: 'Later, maybe.', end: true },
    ] },
    { text: 'Then check in with Hash so he knows I tried. He never believes I try.', anim: 'talk' },
  ]),
  conv('gas.m07.wait', 'gas', 30, all(active('m07'), not(obj('m07', 'gas'))), [
    { text: 'West pylon, then the mining relay panel, then Hash. In that order, ideally. Networks love order.', anim: 'point' },
  ]),
  conv('gas.m07.end', 'gas', 80, obj('m07', 'gas'), [
    { text: 'I felt it the moment the link cleared. My shoulders went down two centimetres.', anim: 'stretch' },
    { text: 'Hash’s messages arrive instantly now. He sent me nine in a row. They all say “told you it wasn’t my fault”.', anim: 'laugh' },
    { text: 'Thank you, Messenger. The mempool monitor is green for the first time this season.', anim: 'nod' },
  ]),
  conv('gas.after', 'gas', 25, done('m12'), [
    { text: 'Since the Chain relit, fees are low, blocks are fast, and I have nothing to worry about.', anim: 'think' },
    { text: 'I hate it. I’ve started worrying about the weather.', anim: 'shrug' },
  ]),
  ...chatter('gas', [
    'People ask why fees go up. Because everybody wants to go at once. It’s like a café queue, but the café is the entire planet.',
    [{ text: 'Hash and I have been friends for twenty years.', anim: 'talk' }, { text: 'Nineteen of them were spent arguing about cables.', anim: 'laugh' }],
    'My moustache is not a fashion choice. It’s a stress response.',
    'The pumps don’t sell fuel. They show how busy the network is. People still try to fill their bikes.',
    'Node thinks congestion is my fault. I think it’s everybody’s fault. Mostly Dex.',
  ]),
];
