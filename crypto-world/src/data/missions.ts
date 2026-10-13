import type { Mission } from '../gameplay/types';

/**
 * The twelve missions of THE LIVING CHAIN. Objectives complete through dialogue effects
 * (talk/deliver), interactions (interact), arriving somewhere (reach) or collecting (collect).
 */
export const MISSIONS: Mission[] = [
  {
    id: 'm01', number: 1, title: 'First Connection', giver: 'node', region: 'city',
    summary: 'Meet the city’s network operator and get yourself registered as a Messenger.',
    requires: { flag: 'game-started' },
    objectives: [
      { id: 'meet', type: 'talk', target: 'node', text: 'Find NODE at the Relay Office', marker: 'npc:node', hint: 'West side of Consensus Square.' },
      { id: 'terminal', type: 'interact', target: 'city.messenger.terminal', text: 'Activate the Messenger Terminal', marker: 'interact:city.messenger.terminal', manual: true },
      { id: 'report', type: 'talk', target: 'node', text: 'Report back to NODE', marker: 'npc:node' },
    ],
    onComplete: [{ setFlag: 'messenger' }],
    completeText: 'You are officially a Messenger of The Chain.',
  },
  {
    id: 'm02', number: 2, title: 'Genesis Message', giver: 'genesis', region: 'city',
    summary: 'Carry an archived letter from the Merkle Library to the historian in Genesis Hills.',
    requires: { mission: 'm01', status: 'done' },
    objectives: [
      { id: 'deliver', type: 'deliver', target: 'block', text: 'Deliver the archived message to BLOCK in Genesis Hills', marker: 'npc:block', hint: 'Follow The Chain east, then the dirt path north.' },
      { id: 'stone', type: 'interact', target: 'hills.memorial', text: 'Compare the message with the Genesis Stone', marker: 'interact:hills.memorial' },
      { id: 'return', type: 'talk', target: 'block', text: 'Tell BLOCK what the stone says', marker: 'npc:block' },
    ],
    onComplete: [{ setFlag: 'genesis-verified' }],
    completeText: 'The first message is authentic — and it mentions a chain that must never break.',
  },
  {
    id: 'm03', number: 3, title: 'Lost Transaction', giver: 'dex', region: 'city',
    summary: 'DEX sent a (pretend) transaction that never arrived. Trace it through the city’s terminals.',
    requires: { mission: 'm01', status: 'done' },
    objectives: [
      { id: 'market', type: 'interact', target: 'city.market.terminal', text: 'Search the Mempool Market terminal', marker: 'interact:city.market.terminal' },
      { id: 'cafe', type: 'interact', target: 'city.cafe.terminal', text: 'Check the guest log at Proof of Brew', marker: 'interact:city.cafe.terminal' },
      { id: 'monitor', type: 'interact', target: 'city.gas.monitor', text: 'Inspect the mempool monitor at the Gas Station', marker: 'interact:city.gas.monitor' },
      { id: 'gas', type: 'talk', target: 'gas', text: 'Ask GAS about the stuck transaction', marker: 'npc:gas' },
      { id: 'dex', type: 'talk', target: 'dex', text: 'Tell DEX what happened', marker: 'npc:dex' },
    ],
    onComplete: [{ setFlag: 'tx-confirmed' }],
    completeText: 'Transaction confirmed. DEX promises to pay a reasonable fee next time. Probably.',
  },
  {
    id: 'm04', number: 4, title: 'The Developer’s Mistake', giver: 'nova', region: 'city',
    summary: 'Something in NOVA’s coffee contract is giving away free espresso. Find the bug.',
    requires: { mission: 'm01', status: 'done' },
    objectives: [
      { id: 'review', type: 'interact', target: 'city.nova.terminal', text: 'Review the CoffeeVault contract at NovaLabs', marker: 'interact:city.nova.terminal', manual: true },
      { id: 'nova', type: 'talk', target: 'nova', text: 'Tell NOVA which line is broken', marker: 'npc:nova' },
      { id: 'byte', type: 'talk', target: 'byte', text: 'Let BYTE know espresso costs money again', marker: 'npc:byte' },
    ],
    onComplete: [{ setFlag: 'contract-fixed' }],
    completeText: 'One missing character, found. Byte’s espresso machine is solvent again.',
  },
  {
    id: 'm05', number: 5, title: 'Forgotten Blocks', giver: 'genesis', region: 'city',
    summary: 'Five historical blocks vanished from the archive. Recover them from across the planet.',
    requires: { mission: 'm02', status: 'done' },
    objectives: [
      { id: 'collect', type: 'collect', target: 'frag.', count: 5, text: 'Recover the five lost blocks', hint: 'Look for glowing amber cubes — one in every district.' },
      { id: 'return', type: 'talk', target: 'genesis', text: 'Return the blocks to GENESIS', marker: 'npc:genesis' },
    ],
    onComplete: [{ setFlag: 'archive-restored' }],
    completeText: 'The Merkle Library is whole again. Every record, verified.',
  },
  {
    id: 'm06', number: 6, title: 'The Artist’s Collection', giver: 'pixel', region: 'city',
    summary: 'Deliver PIXEL’s finished artwork to the Floor Price Gallery on Degen Coast.',
    requires: { mission: 'm01', status: 'done' },
    objectives: [
      { id: 'deliver', type: 'deliver', target: 'wallet', text: 'Deliver the artwork to WALLET at the Floor Price Gallery', marker: 'npc:wallet', hint: 'Degen Coast — follow The Chain past Genesis Hills.' },
      { id: 'meme', type: 'talk', target: 'meme', text: 'Find MEME — Wallet suspects a copy', marker: 'npc:meme' },
      { id: 'wallet', type: 'talk', target: 'wallet', text: 'Bring Meme’s explanation back to WALLET', marker: 'npc:wallet' },
      { id: 'install', type: 'interact', target: 'coast.gallery.display', text: 'Install the artwork on the gallery display', marker: 'interact:coast.gallery.display' },
    ],
    onComplete: [{ setFlag: 'gallery-art' }],
    completeText: '“Sunset.png” now hangs in the Floor Price Gallery. Provenance: verified.',
  },
  {
    id: 'm07', number: 7, title: 'Network Congestion', giver: 'gas', region: 'city',
    summary: 'Messages between Chain City and the Mining District are stuck. Clear the link.',
    requires: { mission: 'm03', status: 'done' },
    objectives: [
      { id: 'pylon', type: 'interact', target: 'wilds.pylon.west', text: 'Reboot the west relay pylon on The Chain', marker: 'interact:wilds.pylon.west', manual: true, hint: 'Between Node Heights and Chain City.' },
      { id: 'panel', type: 'interact', target: 'mining.relay.panel', text: 'Reset the relay panel in the Mining District', marker: 'interact:mining.relay.panel', manual: true },
      { id: 'hash', type: 'talk', target: 'hash', text: 'Check in with HASH', marker: 'npc:hash' },
      { id: 'gas', type: 'talk', target: 'gas', text: 'Tell GAS the link is clear', marker: 'npc:gas' },
    ],
    onComplete: [{ setFlag: 'link-mining' }, { event: 'congestion-cleared' }],
    completeText: 'The city and the mines are talking again — at a very reasonable fee.',
  },
  {
    id: 'm08', number: 8, title: 'The Mining Machine', giver: 'hash', region: 'mining',
    summary: 'Old Faithful needs a legendary “Quiet Storm” fan. Rumour says Fork has one.',
    requires: { mission: 'm07', status: 'done' },
    objectives: [
      { id: 'fork', type: 'talk', target: 'fork', text: 'Ask FORK at Degen Coast about a Quiet Storm fan', marker: 'npc:fork' },
      { id: 'test', type: 'interact', target: 'coast.fork.contraption', text: 'Help FORK test his contraption', marker: 'interact:coast.fork.contraption' },
      { id: 'collect', type: 'talk', target: 'fork', text: 'Collect the fan from FORK', marker: 'npc:fork' },
      { id: 'deliver', type: 'deliver', target: 'hash', text: 'Bring the Quiet Storm to HASH', marker: 'npc:hash' },
      { id: 'start', type: 'interact', target: 'mining.oldfaithful', text: 'Start Old Faithful', marker: 'interact:mining.oldfaithful', manual: true },
    ],
    onComplete: [{ setFlag: 'oldfaithful' }],
    completeText: 'Old Faithful hums back to life, quieter than ever.',
  },
  {
    id: 'm09', number: 9, title: 'Hidden Signal', giver: 'luna', region: 'hills',
    summary: 'A signal repeats every 21 seconds. Triangulate where it comes from.',
    requires: { mission: 'm02', status: 'done' },
    objectives: [
      { id: 'radio', type: 'interact', target: 'hills.observatory.console', text: 'Listen to the signal on the observatory radio', marker: 'interact:hills.observatory.console' },
      { id: 'post1', type: 'interact', target: 'heights.listening.post', text: 'Tune Listening Post 1 on Node Heights', marker: 'interact:heights.listening.post' },
      { id: 'post2', type: 'interact', target: 'woods.listening.post', text: 'Tune Listening Post 2 in Whitepaper Woods', marker: 'interact:woods.listening.post' },
      { id: 'luna', type: 'talk', target: 'luna', text: 'Report the readings to LUNA', marker: 'npc:luna' },
    ],
    onComplete: [{ setFlag: 'signal-found' }],
    completeText: 'The signal is a heartbeat from Comms Station 5 — the fifth link of The Chain.',
  },
  {
    id: 'm10', number: 10, title: 'The Community Message', giver: 'byte', region: 'city',
    summary: 'Gather words from residents all around the planet for one message on the square’s board.',
    requires: { all: [{ mission: 'm04', status: 'done' }, { mission: 'm06', status: 'done' }] },
    objectives: [
      { id: 'sat', type: 'talk', target: 'sat', text: 'Collect a line from SAT in Genesis Hills', marker: 'npc:sat' },
      { id: 'wallet', type: 'talk', target: 'wallet', text: 'Collect a line from WALLET on Degen Coast', marker: 'npc:wallet' },
      { id: 'hash', type: 'talk', target: 'hash', text: 'Collect a line from HASH in the Mining District', marker: 'npc:hash' },
      { id: 'kai', type: 'talk', target: 'kai', text: 'Collect a line from KAI on Node Heights', marker: 'npc:kai' },
      { id: 'pin', type: 'interact', target: 'city.bulletin', text: 'Pin the message on the Consensus Square board', marker: 'interact:city.bulletin' },
      { id: 'byte', type: 'talk', target: 'byte', text: 'Tell BYTE the message is up', marker: 'npc:byte' },
    ],
    onComplete: [{ setFlag: 'community-message' }],
    completeText: 'Four districts, one message. The board has never looked better.',
  },
  {
    id: 'm11', number: 11, title: 'The Missing Node', giver: 'node', region: 'city',
    summary: 'Comms Station 5 has gone dark. Find out why and bring it back online.',
    requires: { all: [{ mission: 'm07', status: 'done' }, { mission: 'm09', status: 'done' }] },
    objectives: [
      { id: 'travel', type: 'reach', target: 'heights.station', text: 'Travel to Comms Station 5 on Node Heights', marker: 'anchor:heights.station.console' },
      { id: 'console', type: 'interact', target: 'heights.station.console', text: 'Inspect the station console', marker: 'interact:heights.station.console' },
      { id: 'kai', type: 'talk', target: 'kai', text: 'Ask KAI who left the plateau', marker: 'npc:kai' },
      { id: 'alpha', type: 'talk', target: 'alpha', text: 'Find ALPHA in Whitepaper Woods', marker: 'npc:alpha' },
      { id: 'socket', type: 'interact', target: 'heights.station.socket', text: 'Return the relay crystal to the dish', marker: 'interact:heights.station.socket', manual: true },
      { id: 'oracle', type: 'talk', target: 'oracle', text: 'Report to ORACLE at Consensus Control', marker: 'npc:oracle' },
    ],
    onComplete: [{ setFlag: 'station-online' }],
    completeText: 'Comms Station 5 is back online. Four links lit — one last step remains.',
  },
  {
    id: 'm12', number: 12, title: 'The Living Chain', giver: 'node', region: 'city',
    summary: 'Light every district’s beacon and sign the final block to reconnect the whole planet.',
    requires: { all: [{ mission: 'm05', status: 'done' }, { mission: 'm08', status: 'done' }, { mission: 'm10', status: 'done' }, { mission: 'm11', status: 'done' }] },
    objectives: [
      { id: 'beacons', type: 'collect', target: 'beacon.', count: 5, text: 'Light the five district beacons', hint: 'Consensus Square, Genesis Stone, the lighthouse, Hashrate Hall and the north antenna.' },
      { id: 'sign', type: 'interact', target: 'heights.control.final', text: 'Sign the final block at Consensus Control', marker: 'interact:heights.control.final', manual: true },
    ],
    onComplete: [{ setFlag: 'living-chain' }, { event: 'finale' }],
    completeText: 'The Chain is whole. The planet remembers itself.',
  },
];

/** Readable names for inventory items. */
export const ITEMS: Record<string, { name: string; desc: string }> = {
  'archived-message': { name: 'Archived Message', desc: 'A sealed letter from the Merkle Library, addressed to BLOCK.' },
  'pixel-artwork': { name: '“Sunset.png”', desc: 'Pixel’s finished artwork, carefully wrapped.' },
  'meme-note': { name: 'Meme’s Explanation', desc: 'A napkin that says: “it was a TRIBUTE”.' },
  'quiet-storm': { name: 'Quiet Storm Fan', desc: 'A legendary 120 mm fan. Somehow still smells like the sea.' },
  'relay-crystal': { name: 'Relay Crystal', desc: 'The missing core of Comms Station 5’s dish.' },
  'note-sat': { name: 'Sat’s Line', desc: '“Run your own node. Or at least visit one.”' },
  'note-wallet': { name: 'Wallet’s Line', desc: '“Provenance is love.”' },
  'note-hash': { name: 'Hash’s Line', desc: '“Clean your fans.”' },
  'note-kai': { name: 'Kai’s Line', desc: '“Verify, then trust.”' },
};
