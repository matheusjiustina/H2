import type { Conversation } from '../../gameplay/types';
import { active, all, avail, chatter, conv, done, not, obj, P } from './helpers';

export const HILLS_COAST_DIALOGUE: Conversation[] = [
  // ======================================================================== SAT
  conv('sat.intro', 'sat', 6, undefined, [
    { text: 'Well now. A new face out in the hills. Pull up a rock.', anim: 'wave' },
    { text: 'I remember when nobody on this planet believed decentralised networks would matter. Me and one beige computer, mining blocks nobody wanted.', anim: 'talk' },
    P('What happened to the computer?'),
    { text: 'It’s right there on the porch. Still running. Slower than a snail and twice as stubborn. Like its owner.', anim: 'point' },
  ], true),
  conv('sat.m10', 'sat', 80, obj('m10', 'sat'), [
    P('Byte is making a community message. One line from every district. Would you write one?'),
    { text: 'A message for everyone. Hm.', anim: 'think' },
    { text: 'Tell them: “Run your own node. Or at least visit one.” People forget the network is just neighbours checking each other’s homework.', anim: 'talk', effects: [{ give: 'note-sat' }] },
  ]),
  conv('sat.genesis', 'sat', 20, all(done('m02'), not(done('m12'))), [
    { text: 'So Block finally opened that letter. The First Messenger’s words, after all these years.', anim: 'think' },
    { text: 'I met them once, you know. The First Messenger. Long coat, muddy boots. Never told anyone their name.', anim: 'talk' },
    { text: 'They said the planet would only stay together if somebody kept walking between the districts. Looks like that somebody is you.', anim: 'nod' },
  ], true),
  conv('sat.after', 'sat', 25, done('m12'), [
    { text: 'Five beams in the sky last night. I haven’t seen the Chain lit like that since the very first block.', anim: 'think' },
    { text: 'The old rig mined a block in your honour. Took it four hours. Worth every minute.', anim: 'laugh' },
  ]),
  ...chatter('sat', [
    'Back in my day, a block took ten minutes and we were grateful. It still takes ten minutes. I’m still grateful.',
    [{ text: 'Hash was my apprentice. Couldn’t tell a fan from a heatsink.', anim: 'talk' }, { text: 'Now he can fix anything with a fan in it. Including, once, a cat.', anim: 'laugh' }],
    'Block and I argue about dates. He has the records. I have the memories. The records are usually right. Don’t tell him.',
    'The Genesis Stone has four dials behind it. Most folks spin them for fun. I spin them to the day it all began.',
    'If you ever get lost, walk the Chain. It goes all the way round and brings you home. That’s the whole point of a chain.',
  ]),

  // ======================================================================== BLOCK
  conv('block.intro', 'block', 6, undefined, [
    { text: 'Careful — those boxes are sorted. Chronologically. By block height. Then by mood.', anim: 'read' },
    { text: 'I’m Block. Historian. I study how this all began, which mostly means arguing with Sat and losing.', anim: 'talk' },
  ], true),
  conv('block.m02.deliver', 'block', 85, all(obj('m02', 'deliver'), { item: 'archived-message' }), [
    P('A letter from the Merkle Library. Genesis says it’s addressed to the keeper of the first records.'),
    { text: 'From Genesis? By hand? She hasn’t sent me anything but criticism in years. Let me see it.', anim: 'inspect' },
    { text: 'The seal… this is the First Messenger’s mark. This letter is older than the library itself.', anim: 'read', effects: [{ take: 'archived-message' }, { advance: ['m02', 'deliver'] }] },
    { text: '“To whoever keeps the chain: every block remembers the one before it. Keep every link lit, and the planet will always remember itself.”', anim: 'read' },
    { text: 'It’s signed with a quote. The same words carved into the Genesis Stone, up the path. Will you check them for me? My knees and that hill are not friends.', anim: 'point' },
  ]),
  conv('block.m02.stone', 'block', 60, obj('m02', 'stone'), [
    { text: 'The Genesis Stone is up the path, past the garden. Read the inscription and tell me if it matches.', anim: 'point' },
  ]),
  conv('block.m02.return', 'block', 85, obj('m02', 'return'), [
    P('It matches. “Chancellor on brink of second bailout for banks.” The same words, the same date.'),
    { text: 'Then it’s authentic. The First Messenger wrote this.', anim: 'think' },
    { text: 'And did you notice? “Keep every link lit.” The planet’s outages, the dropped districts… I’ve suspected for years The Chain was never just a road.', anim: 'talk' },
    { text: 'It’s a ring of relays. When a link goes dark, the planet forgets a little of itself. I just never had proof. Now I have a letter.', anim: 'nod' },
    { text: 'I’ll write to Genesis. On paper. She’ll pretend not to be impressed.', anim: 'laugh' },
  ]),
  conv('block.after2', 'block', 20, all(done('m02'), not(done('m12'))), [
    { text: 'I’ve been mapping every outage in my notebook. They always start at the fifth link. Node Heights.', anim: 'read' },
    { text: 'If you ever end up up there, take a look at Comms Station 5 for me.', anim: 'think' },
  ], true),
  conv('block.after', 'block', 25, done('m12'), [
    { text: 'I’m writing the history of the night the Chain was relit. Chapter one is called “The Messenger Walked”.', anim: 'read' },
    { text: 'Chapter two is also called that. It was a lot of walking.', anim: 'laugh' },
  ]),
  ...chatter('block', [
    'History is just gossip that waited long enough to become reliable.',
    [{ text: 'Sat says the first block was mined on a Tuesday. My records say Saturday.', anim: 'read' }, { text: 'My records also say Sat once mined a block wearing pyjamas, so they are thorough.', anim: 'laugh' }],
    'The windmill powers the cabin and, emotionally, me.',
    'Server Henge, down the hill? Those cabinets once ran the whole network. Now they run mostly on nostalgia.',
  ]),

  // ======================================================================== LUNA
  conv('luna.intro', 'luna', 6, undefined, [
    { text: 'Shh — sorry. Habit. I spend most nights listening to very quiet things.', anim: 'think' },
    { text: 'I’m Luna. I study the sky, and the network, which turns out to be a smaller sky with more arguments.', anim: 'talk' },
  ], true),
  conv('luna.m09.offer', 'luna', 50, avail('m09'), [
    { text: 'Can I show you something strange? There’s a signal on 21.0 megahertz. A pulse, every 21 seconds. Like a heartbeat.', anim: 'talk' },
    { text: 'Nothing on this planet should be transmitting on that frequency. Nothing has, since the founders’ time.', anim: 'think' },
    { text: 'I can hear it, but I can’t tell where it’s from. If you tuned the two listening posts — one on Node Heights, one in Whitepaper Woods — I could triangulate it.', anim: 'point', choices: [
      { text: 'Let’s find the source.', effects: [{ startMission: 'm09' }] },
      { text: 'Another time.', end: true },
    ] },
    { text: 'Start with my radio console here. Listen to it once, so you know what you’re looking for.', anim: 'point' },
  ]),
  conv('luna.m09.wait', 'luna', 30, all(active('m09'), not(obj('m09', 'luna'))), [
    { text: 'Post 1 is on Node Heights, by the road up the plateau. Post 2 is in Whitepaper Woods, at the far north. Follow the trails.', anim: 'point' },
  ]),
  conv('luna.m09.end', 'luna', 80, obj('m09', 'luna'), [
    P('Post 1 heard it to the north-east. Post 2 heard it to the south-west.'),
    { text: 'Then the lines cross… right on Node Heights. Comms Station 5.', anim: 'think' },
    { text: 'And the pattern — I decoded it while you walked. It isn’t random. It says: “PING. LINK FIVE UNREACHABLE. PING.”', anim: 'read' },
    { text: 'The station is crying for help in the oldest language on the planet. Someone should tell Node.', anim: 'nod' },
  ]),
  conv('luna.after', 'luna', 25, done('m12'), [
    { text: 'The 21-second pulse stopped the moment the Chain relit. Now there’s a new signal. A steady hum.', anim: 'think' },
    { text: 'I think it’s the planet, purring.', anim: 'laugh' },
  ]),
  ...chatter('luna', [
    'From the summit you can see the planet curve away on every side. It makes you feel very small and very looked-after.',
    [{ text: 'Fork and I used to share a lab.', anim: 'think' }, { text: 'We don’t discuss the explosion. It was a very small explosion. Emotionally it was large.', anim: 'shrug' }],
    'Stars don’t twinkle in space. They only twinkle here, because the air is busy. A bit like the mempool.',
    'Oracle sends me data. I send Oracle predictions. Somehow it works.',
  ]),

  // ======================================================================== WALLET
  conv('wallet.intro', 'wallet', 6, undefined, [
    { text: 'Welcome to the Floor Price Gallery. Please do not touch anything. Please do not breathe on anything.', anim: 'inspect' },
    { text: 'I collect historical digital objects. Receipts, first editions, a commemorative screenshot of a screenshot.', anim: 'talk' },
    P('Is any of it for sale?'),
    { text: 'Everything is for sale. Nothing is for sale to you.', anim: 'shrug' },
  ], true),
  conv('wallet.m06.deliver', 'wallet', 85, all(obj('m06', 'deliver'), { item: 'pixel-artwork' }), [
    P('A delivery from Pixel. “Sunset.png”.'),
    { text: 'Finally. Let me see the provenance…', anim: 'inspect', effects: [{ take: 'pixel-artwork' }, { advance: ['m06', 'deliver'] }] },
    { text: 'Hm. Hmmm. It’s exquisite. It is also, unfortunately, already on the seawall outside. Twelve metres tall. Wearing sunglasses.', anim: 'think' },
    { text: 'Meme. It’s always Meme. I can’t display a piece that has been… remixed… without knowing which came first.', anim: 'shrug' },
    { text: 'Go and talk to that “street artist”. Get an explanation. In writing, ideally on something that isn’t a napkin.', anim: 'point' },
  ]),
  conv('wallet.m06.wait', 'wallet', 60, obj('m06', 'meme'), [
    { text: 'Meme is usually by the seawall with the mural. Follow the smell of spray paint and confidence.', anim: 'point' },
  ]),
  conv('wallet.m06.back', 'wallet', 85, obj('m06', 'wallet'), [
    P('Meme says the mural is a tribute. He painted it after Pixel showed him the original.'),
    { text: '“It was a TRIBUTE.” On a napkin. Signed with a frog.', anim: 'read', effects: [{ take: 'meme-note' }] },
    { text: 'Well. The original predates the tribute. Provenance verified. That’s all I ever ask.', anim: 'nod' },
    { text: 'Please install it on the centre display. Gently. As if it were the last copy of anything, which, technically, it is.', anim: 'point' },
  ]),
  conv('wallet.m06.install', 'wallet', 60, obj('m06', 'install'), [
    { text: 'The centre display is right in front of the gallery doors. Mind the plinth.', anim: 'point' },
  ]),
  conv('wallet.m10', 'wallet', 80, obj('m10', 'wallet'), [
    P('Byte is collecting one line from each district for a community message.'),
    { text: 'A community message. How quaint. How… public.', anim: 'think' },
    { text: 'Very well. Write this down: “Provenance is love.” It means knowing where things came from. Including people.', anim: 'talk', effects: [{ give: 'note-wallet' }] },
  ]),
  conv('wallet.after6', 'wallet', 22, all(done('m06'), not(done('m12'))), [
    { text: 'Visitors have doubled since “Sunset.png” went up. Doubled! From two to four.', anim: 'cheer' },
  ], true),
  conv('wallet.after', 'wallet', 25, done('m12'), [
    { text: 'I acquired a fragment of last night’s light. It’s a photograph of a beam. Priceless. Also, I took it myself.', anim: 'inspect' },
  ]),
  ...chatter('wallet', [
    'The floor price of this gallery is the floor. I had it polished.',
    [{ text: 'Dex sold me a receipt. Just a receipt.', anim: 'think' }, { text: 'It is now the most valuable item in my collection. Don’t tell Dex.', anim: 'nod' }],
    'Art isn’t about owning something. It’s about knowing where it came from. And then owning it.',
    'Meme asked if he could exhibit here. I asked if his work had provenance. He showed me a frog.',
  ]),

  // ======================================================================== MEME
  conv('meme.intro', 'meme', 6, undefined, [
    { text: 'gm! You like the mural? Don’t answer. If you understand it, it’s not finished.', anim: 'paint' },
    { text: 'Nobody understands my latest artwork. That’s how I know it belongs in the gallery.', anim: 'laugh' },
  ], true),
  conv('meme.m06', 'meme', 85, obj('m06', 'meme'), [
    P('Wallet says your mural copies Pixel’s “Sunset.png”.'),
    { text: 'Copies? COPIES? It’s a tribute! I saw Pixel’s sunset and thought: what if it was cooler. With sunglasses. And twelve metres tall.', anim: 'talk' },
    { text: 'Pixel’s the original. Everybody knows that. I just make things… louder.', anim: 'shrug' },
    { text: 'Here, give Wallet this. It’s an official statement.', anim: 'point', effects: [{ give: 'meme-note' }] },
    P('It’s a napkin.'),
    { text: 'It’s an official napkin.', anim: 'laugh' },
  ]),
  conv('meme.after', 'meme', 25, done('m12'), [
    { text: 'I’m painting a mural of you lighting the beacons. You’re wearing sunglasses. Everybody’s wearing sunglasses.', anim: 'paint' },
    { text: 'It’s a tribute.', anim: 'laugh' },
  ]),
  ...chatter('meme', [
    'WAGMI means “we’re all gonna make it”. I painted it on the wall so the wall could make it too.',
    [{ text: 'Byte lets me pay in drawings.', anim: 'talk' }, { text: 'I’ve drawn her forty frogs. She says the economy is “frog-backed” now.', anim: 'laugh' }],
    'Art is just a meme that stayed still long enough.',
    'The best thing about painting on a seawall is the ocean is a very honest critic. It erases everything eventually.',
    'Have you seen the shiba on the beach? Very good boy. Much loyal. Wow.',
  ]),

  // ======================================================================== FORK
  conv('fork.intro', 'fork', 6, undefined, [
    { text: 'Welcome to Fork & Spoon Labs! Experimental! Unaudited! Fun!', anim: 'cheer' },
    { text: 'I take good ideas and make different ideas out of them. Sometimes better. Sometimes on fire.', anim: 'talk' },
  ], true),
  conv('fork.m08.ask', 'fork', 80, obj('m08', 'fork'), [
    P('Hash says you have a Quiet Storm fan.'),
    { text: 'The Quiet Storm! Legendary fan. One hundred and twenty millimetres of silence. Yes, I have one.', anim: 'think' },
    { text: 'It’s… currently inside my contraption. The bathtub computer boat. It cools the computer, and the computer steers the bathtub.', anim: 'point' },
    { text: 'Help me run one last test and you can have it. Just give it a gentle poke. A scientific poke.', anim: 'talk' },
  ]),
  conv('fork.m08.waittest', 'fork', 60, obj('m08', 'test'), [
    { text: 'The contraption is right next to the workshop. Poke it with confidence. Machines can smell fear.', anim: 'point' },
  ]),
  conv('fork.m08.collect', 'fork', 85, obj('m08', 'collect'), [
    { text: 'IT FLOATED! For four seconds! That’s a record! That’s THE record!', anim: 'cheer' },
    { text: 'A deal is a deal. One Quiet Storm, gently used, slightly salty. Tell Hash I said he still owes me a soldering iron.', anim: 'talk', effects: [{ give: 'quiet-storm' }] },
  ]),
  conv('fork.after', 'fork', 25, done('m12'), [
    { text: 'I’m forking the whole Chain! Version two will have a sixth district. Underwater. With bubbles.', anim: 'cheer' },
    { text: 'Nova says it “won’t reach consensus”. Consensus has never stopped me before.', anim: 'shrug' },
  ]),
  ...chatter('fork', [
    'A fork is just an argument that got its own address.',
    [{ text: 'Nova thinks I copy her projects.', anim: 'think' }, { text: 'I improve them. Sometimes into something worse. That’s still a direction.', anim: 'laugh' }],
    'The sign says Fork & Spoon Labs. There is no Spoon. There was, briefly. It quit.',
    'Rule of the lab: if it beeps, step back. If it stops beeping, step further back.',
    [{ text: 'Luna and I used to share a lab.', anim: 'think' }, { text: 'I maintain the explosion was a feature.', anim: 'shrug' }],
  ]),
];

export const HILLS_COAST_EXTRA: Conversation[] = [
  conv('wallet.m06.wait2', 'wallet', 30, all(active('m06'), not(obj('m06', 'deliver')), not(obj('m06', 'meme')), not(obj('m06', 'wallet')), not(obj('m06', 'install'))), [
    { text: 'The display awaits.', anim: 'nod' },
  ]),
  conv('fork.waiting', 'fork', 3, avail('m08'), [
    { text: 'Hash is looking for a fan? Every mechanic on this planet ends up at my door eventually.', anim: 'laugh' },
  ]),
  conv('luna.signal.hint', 'luna', 3, not(done('m02')), [
    { text: 'I’m picking up something odd on the radio. When you have time — after your first deliveries — come back and listen with me.', anim: 'think' },
  ]),
  conv('hash.notyet', 'hash', 2, not(done('m07')), [
    { text: 'Gas sends his regards. Late. Everything from the city arrives late.', anim: 'shrug' },
  ]),
  conv('sat.pizza', 'sat', 4, { secret: 'pizza' }, [
    { text: 'You found the pizza boxes on the bakery roof? Ha! Ten thousand coins for two pizzas.', anim: 'laugh' },
    { text: 'Best lunch in history. Most expensive too. Somebody always has to go first.', anim: 'nod' },
  ], true),
  conv('genesis.mural', 'genesis', 4, { secret: 'mural' }, [
    { text: 'You found the carvings in the grotto. The founders cut that timeline by hand, before there was a library to keep it.', anim: 'read' },
  ], true),
  conv('dex.done.alt', 'dex', 3, all(done('m03'), not(done('m12'))), [
    { text: 'I’ve set my default fee to “reasonable”. Gas says that’s not a number. I say it’s a lifestyle.', anim: 'laugh' },
  ]),
  conv('gas.after3', 'gas', 3, all(done('m03'), not(avail('m07')), not(active('m07')), not(done('m07'))), [
    { text: 'You know your way around a mempool now. Come back if you want real work.', anim: 'nod' },
  ]),
  conv('node.after1', 'node', 3, all(done('m01'), not(done('m12'))), [
    { text: 'Every delivery you make strengthens the links. I can see it on the relay map. Little green lines.', anim: 'point' },
  ]),
];
