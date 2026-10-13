import type { Conversation } from '../../gameplay/types';
import { active, all, conv, done, not, obj } from './helpers';

/** Display names for objects that "speak" in the dialogue box. */
export const OBJECT_SPEAKERS: Record<string, string> = {
  'city.messenger.terminal': 'MESSENGER TERMINAL',
  'city.market.terminal': 'MARKET TERMINAL',
  'city.cafe.terminal': 'GUEST TERMINAL',
  'city.gas.monitor': 'MEMPOOL MONITOR',
  'city.nova.terminal': 'NOVALABS TERMINAL',
  'wilds.pylon.west': 'RELAY PYLON W-5',
  'mining.relay.panel': 'MINING RELAY',
  'coast.fork.contraption': 'THE CONTRAPTION',
  'mining.oldfaithful': 'OLD FAITHFUL',
  'heights.listening.post': 'LISTENING POST 1',
  'woods.listening.post': 'LISTENING POST 2',
  'hills.observatory.console': 'OBSERVATORY RADIO',
  'heights.station.console': 'COMMS STATION 5',
  'heights.station.socket': 'DISH PEDESTAL',
  'heights.control.final': 'MASTER CONSOLE',
  'city.bulletin': 'COMMUNITY BOARD',
  'coast.gallery.display': 'GALLERY DISPLAY',
  'beacon.city': 'CITY BEACON',
  'beacon.hills': 'HILLS BEACON',
  'beacon.coast': 'COAST BEACON',
  'beacon.mining': 'MINING BEACON',
  'beacon.heights': 'HEIGHTS BEACON',
  'secret.vault': 'VAULT KEYPAD',
  terminal: 'TERMINAL',
};

const beacon = (id: string, place: string): Conversation[] => [
  conv(`${id}.light`, id, 80, all(active('m12'), not({ flag: `lit.${id}` })), [
    { text: `The ${place} beacon stirs under your hand. Deep inside, something counts: one link… two… three…`, anim: 'interact' },
    { text: 'A column of amber light climbs into the sky.', effects: [{ setFlag: `lit.${id}` }, { collect: id }, { event: 'beacon-lit', data: id }] },
  ]),
  conv(`${id}.lit`, id, 40, { flag: `lit.${id}` }, [{ text: 'The beacon burns steadily, humming in time with the others.' }]),
  conv(`${id}.dormant`, id, 10, undefined, [{ text: 'A dormant beacon. Faint letters on its base read: “Light me when the Chain is ready.”' }]),
];

export const OBJECT_DIALOGUE: Conversation[] = [
  // ---- M01 -------------------------------------------------------------------------------------------
  conv('term.m01', 'city.messenger.terminal', 80, obj('m01', 'terminal'), [
    { text: 'MESSENGER TERMINAL v0.9 — booting… booting… still booting…' },
    { text: 'Scanning courier… New face detected. Shoes: comfortable. Bag: roomy. Sense of direction: pending.' },
    { text: 'Register as a Messenger of The Chain?', choices: [
      { text: 'Register', effects: [{ advance: ['m01', 'terminal'] }, { event: 'messenger-registered' }] },
      { text: 'Cancel', end: true },
    ] },
    { text: 'Registration complete. Status: MESSENGER — ACTIVE. Please report to your network operator.' },
  ]),
  conv('term.m01.after', 'city.messenger.terminal', 5, done('m01'), [
    { text: 'MESSENGER — ACTIVE. Deliveries completed: many. Packages lost: none. Soup incidents: classified.' },
  ]),

  // ---- M03 -------------------------------------------------------------------------------------------
  conv('term.m03.market', 'city.market.terminal', 80, obj('m03', 'market'), [
    { text: 'PUBLIC EXPLORER — search: 0x7a1e…c0de' },
    { text: 'Result: NOT FOUND in the last 144 blocks. Not confirmed. Not rejected.' },
    { text: 'Broadcast origin: guest network “ProofOfBrew_Guest”. Suggest checking the café’s guest log.' },
  ]),
  conv('term.m03.cafe', 'city.cafe.terminal', 80, obj('m03', 'cafe'), [
    { text: 'GUEST WI-FI LOG — Proof of Brew' },
    { text: '08:14 — DEX connected. Broadcast tx 0x7a1e…c0de. Fee: 1 sat/vB. Message: “trust me”.' },
    { text: '08:15 — NOVA connected. 08:16 — NOVA: “why is the coffee free”. 08:16 — BYTE: “WHY IS THE COFFEE FREE”.' },
    { text: 'The transaction was sent… but with almost no fee. The Gas Station keeps the city’s mempool monitor.' },
  ]),
  conv('term.m03.monitor', 'city.gas.monitor', 80, obj('m03', 'monitor'), [
    { text: 'MEMPOOL MONITOR — 41,209 transactions waiting.' },
    { text: 'Found 0x7a1e…c0de at position 41,207 of 41,209. Fee: 1 sat/vB. Estimated wait: until the heat death of the universe.' },
    { text: 'Hint: ask a fee engineer about bumping it.' },
  ]),

  // ---- M04: code review puzzle ---------------------------------------------------------------------------
  conv('term.m04', 'city.nova.terminal', 80, obj('m04', 'review'), [
    { text: 'CoffeeVault.sol — tests: 12 passed, 0 failed. Espressos given away this week: 400.' },
    { text: '`uint price = 3;`  `function buy(uint paid) {`  `require(paid >= prce);`  `pour(msg.sender);`  `}`' },
    { label: 'ask', text: 'Which line hides the bug?', choices: [
      { text: '`uint price = 3;`', goto: 'wrong-price' },
      { text: '`require(paid >= prce);`', goto: 'right' },
      { text: '`pour(msg.sender);`', goto: 'wrong-pour' },
      { text: 'Come back later', end: true },
    ] },
    { label: 'wrong-price', text: 'The price is fine. Three is a lovely number for an espresso. Keep looking.', goto: 'ask' },
    { label: 'wrong-pour', text: 'Pouring coffee to whoever paid is the whole point of the contract. Keep looking.', goto: 'ask' },
    { label: 'right', text: '“prce” is not “price”. The undefined name quietly defaults to zero — so every payment, even zero, passes the check.', effects: [{ advance: ['m04', 'review'] }, { setFlag: 'bug-found' }] },
    { text: 'BUG FLAGGED. One missing character. Tell Nova before she drinks another free espresso.' },
  ]),
  conv('term.m04.after', 'city.nova.terminal', 5, done('m04'), [
    { text: 'CoffeeVault.sol — tests: 13 passed (new: coffee_is_not_free). Espressos given away this week: 0.' },
  ]),

  // ---- M07 -------------------------------------------------------------------------------------------
  conv('pylon.m07', 'wilds.pylon.west', 80, obj('m07', 'pylon'), [
    { text: 'RELAY PYLON W-5 — STATUS: CONGESTED. Queue: 9,413 messages. Oldest: “are you there?” (sent 3 days ago).' },
    { text: 'Reboot the pylon and flush the queue?', choices: [
      { text: 'Reboot', effects: [{ advance: ['m07', 'pylon'] }, { event: 'pylon-rebooted' }] },
      { text: 'Cancel', end: true },
    ] },
    { text: 'Rebooting… The orb flickers, then glows steady. Queue: 0. “are you there?” has been delivered. Someone, somewhere, is relieved.' },
  ]),
  conv('pylon.idle', 'wilds.pylon.west', 5, undefined, [
    { text: 'RELAY PYLON W-5 — STATUS: ONLINE. Queue: 0. Have a nice day.' },
  ]),
  conv('panel.m07', 'mining.relay.panel', 80, obj('m07', 'panel'), [
    { text: 'MINING RELAY — Link to CHAIN CITY: DEGRADED. Packet loss: 61%. Most lost packet: “where’s my sandwich” (Hash).' },
    { text: 'Reset the relay?', choices: [
      { text: 'Reset', effects: [{ advance: ['m07', 'panel'] }] },
      { text: 'Cancel', end: true },
    ] },
    { text: 'Link to CHAIN CITY: OK. Latency: 18 ms. The sandwich message arrives. It was not urgent.' },
  ]),
  conv('panel.idle', 'mining.relay.panel', 5, undefined, [{ text: 'MINING RELAY — all links nominal. Fans: enthusiastic.' }]),

  // ---- M08 -------------------------------------------------------------------------------------------
  conv('fork.contraption.m08', 'coast.fork.contraption', 80, obj('m08', 'test'), [
    { text: 'You give the contraption a gentle, scientific poke.', anim: 'interact' },
    { text: 'It beeps. It whirs. A tiny screen reads FLOAT_MODE=TRUE.' },
    { text: 'The bathtub rises four centimetres off the sand… and hovers… for exactly four seconds.' },
    { text: 'From the workshop, a voice shouts: “IT FLOATED!”' },
  ]),
  conv('fork.contraption.idle', 'coast.fork.contraption', 5, undefined, [
    { text: 'The contraption beeps reproachfully. A sticker says: “DO NOT POKE (unless Fork says so)”.' },
  ]),
  conv('oldfaithful.m08', 'mining.oldfaithful', 80, obj('m08', 'start'), [
    { text: 'OLD FAITHFUL — firmware 0.1.0 (genesis edition). Main fan: QUIET STORM (new!).' },
    { text: 'Throw the big red switch?', choices: [
      { text: 'Throw it', effects: [{ advance: ['m08', 'start'] }, { event: 'oldfaithful-start' }] },
      { text: 'Not yet', end: true },
    ] },
    { text: 'Clunk. A pause. Then a low, contented hum — and the fans begin to spin. Hash makes a noise that is definitely not a sob.' },
  ]),
  conv('oldfaithful.done', 'mining.oldfaithful', 10, done('m08'), [{ text: 'Old Faithful hums happily. Hashrate: modest. Spirit: immense.' }]),
  conv('oldfaithful.idle', 'mining.oldfaithful', 5, undefined, [{ text: 'A dusty old mining rig with an empty fan bay. A label reads: “OLD FAITHFUL — built by Sat, kept alive by Hash”.' }]),

  // ---- M09 -------------------------------------------------------------------------------------------
  conv('radio.m09', 'hills.observatory.console', 80, obj('m09', 'radio'), [
    { text: 'The radio crackles. Beneath the static: a pulse. Then silence. Then the pulse again.' },
    { text: 'Every twenty-one seconds, regular as a heartbeat. 21.0 MHz. Nothing should be transmitting there.' },
  ]),
  conv('post1.m09', 'heights.listening.post', 80, obj('m09', 'post1'), [
    { text: 'You turn the dial until the static thins…' },
    { text: 'PING… PING… The needle swings and settles: the signal is strongest to the north-east of here.' },
  ]),
  conv('post1.idle', 'heights.listening.post', 5, undefined, [{ text: 'The listening post hums quietly, ears open to the whole planet.' }]),
  conv('post2.m09', 'woods.listening.post', 80, obj('m09', 'post2'), [
    { text: 'Static, birdsong, more static… then the pulse, faint between the trees.' },
    { text: 'The needle swings and settles: the signal comes from the south-west. Toward Node Heights.' },
  ]),
  conv('post2.idle', 'woods.listening.post', 5, undefined, [{ text: 'The listening post creaks in the wind. A squirrel is filing a noise complaint.' }]),

  // ---- M10 -------------------------------------------------------------------------------------------
  conv('board.m10', 'city.bulletin', 80, obj('m10', 'pin'), [
    { text: 'You pin the four lines to the board, side by side:', effects: [{ take: 'note-sat' }, { take: 'note-wallet' }, { take: 'note-hash' }, { take: 'note-kai' }] },
    { text: '“Run your own node. Or at least visit one.” — Sat. “Provenance is love.” — Wallet. “Clean your fans.” — Hash. “Verify, then trust.” — Kai.' },
    { text: 'Underneath, someone has already added a small drawing of a frog.' },
  ]),

  // ---- M06 -------------------------------------------------------------------------------------------
  conv('display.m06', 'coast.gallery.display', 80, obj('m06', 'install'), [
    { text: 'You lift “Sunset.png” onto the display. The gallery lights warm to meet it.', anim: 'deliver' },
    { text: 'A small card appears beside it: “SUNSET.PNG — by PIXEL. Provenance: verified.”' },
  ]),
  conv('display.after', 'coast.gallery.display', 10, done('m06'), [{ text: '“Sunset.png” by Pixel. One pixel a day, for a year. Provenance: verified.' }]),
  conv('display.idle', 'coast.gallery.display', 5, undefined, [{ text: 'An empty display. A card reads: “Reserved for something worthy.”' }]),

  // ---- M11 -------------------------------------------------------------------------------------------
  conv('station.m11', 'heights.station.console', 80, obj('m11', 'console'), [
    { text: 'COMMS STATION 5 — STATUS: OFFLINE. Broadcasting emergency heartbeat on 21.0 MHz.' },
    { text: 'Diagnostic: dish relay crystal… MISSING. Last maintenance: 3,104 days ago. Last visitor: yesterday, 14:12.' },
    { text: 'The checkpoint log would know who left the plateau. Kai logs everything.' },
  ]),
  conv('station.done', 'heights.station.console', 10, done('m11'), [{ text: 'COMMS STATION 5 — STATUS: ONLINE. Link 5 ↔ Link 1: 12 ms. Heartbeat: no longer needed.' }]),
  conv('station.idle', 'heights.station.console', 5, undefined, [{ text: 'COMMS STATION 5 — STATUS: OFFLINE. The screen flickers with an emergency heartbeat.' }]),
  conv('socket.m11', 'heights.station.socket', 80, all(obj('m11', 'socket'), { item: 'relay-crystal' }), [
    { text: 'You slot the relay crystal into the pedestal. It clicks, glows — and the great dish begins to turn.', anim: 'interact', effects: [{ take: 'relay-crystal' }, { advance: ['m11', 'socket'] }, { event: 'station-online' }] },
  ]),
  conv('socket.empty', 'heights.station.socket', 10, not(done('m11')), [{ text: 'An empty socket in the dish pedestal. Something round and glowing used to live here.' }]),
  conv('socket.full', 'heights.station.socket', 10, done('m11'), [{ text: 'The relay crystal glows steadily in its socket. Clearly not abandoned. Clearly load-bearing.' }]),

  // ---- Cold Storage keypad (a secret) -----------------------------------------------------------------
  conv('vault.code', 'secret.vault', 50, not({ secret: 'vault' }), [
    { text: 'COLD STORAGE — KEYPAD. A label reads: “Enter the number that can never grow.”' },
    { label: 'ask', text: 'The keypad waits, glowing faintly in the cold.', choices: [
      { text: '21,000,000', goto: 'ok' },
      { text: '1,000,000', goto: 'small' },
      { text: '42', goto: 'other' },
      { text: 'Leave it', end: true },
    ] },
    { label: 'small', text: 'BZZT. “Close. Think twenty-one times bigger.”', goto: 'ask' },
    { label: 'other', text: 'BZZT. “That is the answer to a different question.”', goto: 'ask' },
    { label: 'ok', text: 'CLICK. The keypad glows green.', effects: [{ secret: 'vault' }], end: true },
  ]),
  conv('vault.done', 'secret.vault', 40, { secret: 'vault' }, [{ text: 'COLD STORAGE — “Already verified. Twenty-one million. Not one more.”' }]),

  // ---- M12 -------------------------------------------------------------------------------------------
  ...beacon('beacon.city', 'Chain City'),
  ...beacon('beacon.hills', 'Genesis Hills'),
  ...beacon('beacon.coast', 'Degen Coast'),
  ...beacon('beacon.mining', 'Mining District'),
  ...beacon('beacon.heights', 'Node Heights'),
  conv('final.sign', 'heights.control.final', 90, obj('m12', 'sign'), [
    { text: 'CONSENSUS CONTROL — MASTER CONSOLE. All five beacons: LIT. All relays: SYNCED.' },
    { text: 'Block 1,000,000 of The Chain is ready. It contains every delivery you have made since you arrived.' },
    { text: 'Sign the block?', choices: [
      { text: 'Sign', effects: [{ advance: ['m12', 'sign'] }] },
      { text: 'Not yet', end: true },
    ] },
  ]),
  conv('final.waiting', 'heights.control.final', 40, active('m12'), [{ text: 'MASTER CONSOLE — waiting for district beacons. The block cannot be signed until every district has spoken.' }]),
  conv('final.done', 'heights.control.final', 30, done('m12'), [{ text: 'MASTER CONSOLE — Block 1,000,000: SIGNED. Signer: THE MESSENGER. The Chain is whole.' }]),
  conv('final.idle', 'heights.control.final', 5, undefined, [{ text: 'MASTER CONSOLE — standing by. “Sign only when every link is lit.”' }]),
];
