import type { Conversation } from '../../gameplay/types';
import { active, all, avail, chatter, conv, done, not, obj, P } from './helpers';

export const EAST_DIALOGUE: Conversation[] = [
  // ======================================================================== HASH
  conv('hash.intro', 'hash', 6, undefined, [
    { text: 'Mind the cables. And the fans. And the other cables.', anim: 'hammer' },
    { text: 'I’m Hash. If it spins, I fix it. If it doesn’t spin, I make it spin, and then I fix it.', anim: 'talk' },
  ], true),
  conv('hash.m07', 'hash', 80, obj('m07', 'hash'), [
    { text: 'There it is — Gas’s messages arriving on time. All nine of them. All complaints. Beautiful.', anim: 'phone' },
    { text: 'Tell him I said thanks. Actually don’t. Tell him it was obviously his fault. He likes that.', anim: 'laugh' },
  ]),
  conv('hash.m08.offer', 'hash', 50, avail('m08'), [
    { text: 'Now that the link’s clear, maybe you can help me with something personal. Meet Old Faithful.', anim: 'point' },
    { text: 'Oldest rig in the district. Mined blocks before most of this district had a roof. Sat built her. I keep her alive.', anim: 'inspect' },
    { text: 'Her main fan died. She needs a Quiet Storm — a 120-millimetre legend they stopped making ages ago. I heard Fork has one on Degen Coast.', anim: 'think', choices: [
      { text: 'I’ll get the fan.', effects: [{ startMission: 'm08' }] },
      { text: 'Not right now.', end: true },
    ] },
    { text: 'Fork will want something in return. Fork always wants something in return. Usually your time.', anim: 'shrug' },
  ]),
  conv('hash.m08.wait', 'hash', 30, all(active('m08'), not(obj('m08', 'deliver')), not(obj('m08', 'start'))), [
    { text: 'Any luck with the fan? Fork’s workshop is at the east end of Degen Coast, by the rocks.', anim: 'point' },
  ]),
  conv('hash.m08.deliver', 'hash', 85, all(obj('m08', 'deliver'), { item: 'quiet-storm' }), [
    P('One Quiet Storm. Fork says you still owe him a soldering iron.'),
    { text: 'I owe him nothing. He owes me three. Look at this fan… not a scratch. Smells like the ocean. Why does it smell like the ocean?', anim: 'inspect', effects: [{ take: 'quiet-storm' }, { advance: ['m08', 'deliver'] }] },
    { text: 'Fitted. Now you do the honours — flip the big switch on Old Faithful. She likes new people.', anim: 'point' },
  ]),
  conv('hash.m08.start', 'hash', 60, obj('m08', 'start'), [
    { text: 'The switch is on her side. Big red lever. You can’t miss it, and if you do, she’ll let you know.', anim: 'point' },
  ]),
  conv('hash.m10', 'hash', 82, obj('m10', 'hash'), [
    P('Byte wants a line from every district for a community message.'),
    { text: 'A line from me? Easy. “Clean your fans.”', anim: 'talk' },
    { text: 'That’s it. That’s the whole philosophy. Clean fans, cool heads.', anim: 'nod', effects: [{ give: 'note-hash' }] },
  ]),
  conv('hash.after8', 'hash', 22, all(done('m08'), not(done('m12'))), [
    { text: 'Old Faithful is purring. Quieter than she’s been in twenty years. I may have cried a little. Fan dust. Definitely fan dust.', anim: 'stretch' },
  ], true),
  conv('hash.after', 'hash', 25, done('m12'), [
    { text: 'When the beacons lit, every fan in the district spun up at once. Sounded like applause.', anim: 'cheer' },
  ]),
  ...chatter('hash', [
    'Mining isn’t about the machines. It’s about keeping them cool, fed and listened to. Like pets.',
    [{ text: 'Sat taught me everything.', anim: 'talk' }, { text: 'Mostly by doing it wrong first and letting me watch.', anim: 'laugh' }],
    'Gas says the Mining District is noisy. It isn’t noisy. It’s busy. There’s a difference, and it’s about forty decibels.',
    'The GPU farm sign says “please do not feed the fans”. Someone fed the fans. We know who. We’re not saying.',
    'Proof of work means you can’t fake the effort. I like that. Same with fixing things.',
  ]),

  // ======================================================================== ALPHA
  conv('alpha.intro', 'alpha', 6, undefined, [
    { text: 'Oh! A visitor! Nobody visits the woods except mushrooms and me.', anim: 'wave' },
    { text: 'I’m Alpha. I search for abandoned technological structures. Abandoned, forgotten, or just poorly labelled.', anim: 'talk' },
    { text: 'There’s a grotto up the path with carvings older than the library. And a desk in a clearing where someone just… left. Mid-sentence.', anim: 'point' },
  ], true),
  conv('alpha.m11', 'alpha', 85, obj('m11', 'alpha'), [
    P('Kai says you left Node Heights with a box. Comms Station 5 is missing its relay crystal.'),
    { text: 'The glowy thing? From the dish? It was lying in an open hatch! Covered in dust! It looked SO abandoned.', anim: 'shrug' },
    { text: 'Oh no. Oh no, it was holding the planet together, wasn’t it.', anim: 'think' },
    { text: 'Here — take it back, please. I’ll label things better in my map. “Not abandoned: load-bearing.”', anim: 'talk', effects: [{ give: 'relay-crystal' }] },
  ]),
  conv('alpha.after11', 'alpha', 22, all(done('m11'), not(done('m12'))), [
    { text: 'I’ve started asking things if they’re abandoned before I take them. So far, nothing has answered. Suspicious.', anim: 'think' },
  ], true),
  conv('alpha.after', 'alpha', 25, done('m12'), [
    { text: 'I saw the beams from the woods! Five of them, all leaning toward each other. It looked like the planet was holding hands.', anim: 'cheer' },
  ]),
  ...chatter('alpha', [
    'Rule of exploring: if a door says “do not open”, it’s a strong suggestion, not a law of physics.',
    [{ text: 'The North Pole marker says every direction is south.', anim: 'think' }, { text: 'I checked. It’s true. Even up.', anim: 'laugh' }],
    'I bring Luna weird antennas. She says “thank you” in the tone people use for cats bringing them birds.',
    'There’s a vault at the south pole called Cold Storage. Kept offline. I’ve never been able to open it. Yet.',
  ]),

  // ======================================================================== ORACLE
  conv('oracle.intro', 'oracle', 6, undefined, [
    { text: 'I foresaw your arrival, Messenger.', anim: 'think' },
    P('Really?'),
    { text: 'No. Kai radioed ahead. But I would have foreseen it, given time.', anim: 'nod' },
  ], true),
  conv('oracle.m11.hint', 'oracle', 40, all(active('m11'), not(obj('m11', 'oracle'))), [
    { text: 'The fifth link sleeps. Its heart was carried into the forest by a curious hand.', anim: 'think' },
    P('…Alpha?'),
    { text: 'I could not possibly say. But yes. Ask Kai; he validates everyone who leaves.', anim: 'nod' },
  ]),
  conv('oracle.m11.end', 'oracle', 80, obj('m11', 'oracle'), [
    { text: 'Station 5 sings again. The relay map shows four links… and a fifth waiting to be signed.', anim: 'think' },
    { text: 'I predicted this. I predicted many things, so statistically one of them was this.', anim: 'nod' },
    { text: 'Return to Node, Messenger. The last step is not mine to give.', anim: 'point' },
  ]),
  conv('oracle.m12.wait', 'oracle', 40, all(active('m12'), not(obj('m12', 'sign'))), [
    { text: 'The beacons first, Messenger. The block cannot be signed until every district has spoken.', anim: 'think' },
  ]),
  conv('oracle.m12.sign', 'oracle', 45, obj('m12', 'sign'), [
    { text: 'All five beacons burn. The master console is ready. Sign the block, and the Chain will remember itself.', anim: 'point' },
  ]),
  conv('oracle.after', 'oracle', 25, done('m12'), [
    { text: 'I foresee a long, quiet stretch of uptime. Also rain on Tuesday.', anim: 'think' },
    { text: 'The rain part is from Luna. She has instruments.', anim: 'nod' },
  ]),
  ...chatter('oracle', [
    'An oracle brings outside truth onto the chain. I bring inside truth out. Mostly about the weather.',
    [{ text: 'Kai validates. I predict.', anim: 'think' }, { text: 'Between us we are almost certain about almost everything.', anim: 'nod' }],
    'From up here you can watch the curve of the world. Everything you see is a promise that more world is coming.',
    'The future is uncertain. That is what makes it worth signing.',
  ]),

  // ======================================================================== KAI
  conv('kai.intro', 'kai', 6, undefined, [
    { text: 'Halt. Validator Checkpoint. State your name, purpose, and number of confirmations.', anim: 'think' },
    P('I’m the new Messenger. I… don’t have confirmations.'),
    { text: 'Hm. I will confirm you myself. One. Two. Three…', anim: 'nod' },
    { text: '…Twelve. Validated. Welcome to Node Heights. Please enjoy the view responsibly.', anim: 'point' },
  ], true),
  conv('kai.m10', 'kai', 82, obj('m10', 'kai'), [
    P('Byte is collecting one line from every district for the square’s board.'),
    { text: 'A public message. It will require validation.', anim: 'think' },
    { text: 'Very well: “Verify, then trust.” Not the other way around. I have validated my own sentence. It is valid.', anim: 'nod', effects: [{ give: 'note-kai' }] },
  ]),
  conv('kai.m11', 'kai', 84, obj('m11', 'kai'), [
    P('Something was taken from Comms Station 5. Did anyone leave the plateau with a box?'),
    { text: 'Yesterday at 14:12. Explorer. Bucket hat. Carried a glowing object. Claimed it was “clearly abandoned”.', anim: 'think' },
    { text: 'I logged it. I did not validate it. I disapproved quietly, which is my strongest setting.', anim: 'shrug' },
    { text: 'The explorer camps in Whitepaper Woods. Take the trail north from the plateau.', anim: 'point' },
  ]),
  conv('kai.after', 'kai', 25, done('m12'), [
    { text: 'I validated the final block myself. Twelve confirmations. Then twelve more, for luck. Luck is not a valid parameter. I did it anyway.', anim: 'nod' },
  ]),
  ...chatter('kai', [
    'Trust is good. Verification is better. Verified trust is best, and it is very tiring.',
    [{ text: 'Oracle predicted I would smile today.', anim: 'think' }, { text: 'I did not. The prediction remains unconfirmed.', anim: 'nod' }],
    'A validator does not decide what is true. A validator checks that everyone agreed on what is true. It is a humble job with an excellent hat.',
    'Please do not lean on the barrier. It is decorative. And emotionally load-bearing.',
  ]),
];
