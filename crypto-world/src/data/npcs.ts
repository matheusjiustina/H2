import type { Appearance } from '../characters/Appearance';
import type { ActionName } from '../characters/CharacterAnimator';
import type { RegionId } from '../world/layout/LayoutBuilder';

/** Where an NPC stands: a named world anchor (from a kit) or region-local coordinates. */
export type Spot =
  | { anchor: string; dx?: number; dz?: number; turn?: number }
  | { region: RegionId; x: number; y: number; heading: number };

export type Activity =
  | { kind: 'idle'; actions?: ActionName[] }
  | { kind: 'work'; action: ActionName }
  | { kind: 'sit' }
  | { kind: 'chat'; with: string }
  | { kind: 'wander'; radius: number }
  | { kind: 'watch' };

export interface RoutineEntry {
  /** Hours (0–24); windows may wrap past midnight. */
  from: number;
  to: number;
  spot: string;
  activity: Activity;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  region: RegionId;
  look: Appearance;
  voice: { pitch: number; rate: number };
  bio: string;
  concern: string;
  relationships: { id: string; note: string }[];
  spots: Record<string, Spot>;
  routine: RoutineEntry[];
  talkRadius?: number;
}

export const NPCS: NpcDef[] = [
  {
    id: 'node', name: 'NODE', title: 'Network Operator', region: 'city',
    look: { skin: '#5e3a26', hair: '#2b2321', hairStyle: 'afro', top: '#2f6c78', topStyle: 'jacket', topAccent: '#f4efe6', bottom: '#2a2430', shoes: '#f0b04a', hat: 'headphones', hatColor: '#f0b04a', accessory: 'badge', accessoryColor: '#f0b04a', height: 1.05 },
    voice: { pitch: 0.95, rate: 1.0 },
    bio: 'Keeps the Relay Office humming and knows every link of The Chain by its latency.',
    concern: 'Districts keep dropping off the network, and nobody can say why.',
    relationships: [{ id: 'gas', note: 'Argues with GAS about whose fault congestion is.' }, { id: 'oracle', note: 'Old colleague at Node Heights.' }],
    spots: {
      office: { region: 'city', x: -10.9, y: -5.6, heading: 95 },
      terminal: { region: 'city', x: -9.4, y: -3.4, heading: -60 },
      bench: { anchor: 'city.bench.208' },
    },
    routine: [
      { from: 6, to: 12, spot: 'office', activity: { kind: 'work', action: 'phone' } },
      { from: 12, to: 13, spot: 'terminal', activity: { kind: 'work', action: 'type' } },
      { from: 13, to: 20, spot: 'office', activity: { kind: 'idle', actions: ['phone', 'lookAround', 'think'] } },
      { from: 20, to: 6, spot: 'bench', activity: { kind: 'sit' } },
    ],
  },
  {
    id: 'byte', name: 'BYTE', title: 'Café Owner', region: 'city',
    look: { skin: '#e0a982', hair: '#7a4d2c', hairStyle: 'bun', top: '#f4efe6', topStyle: 'apron', topAccent: '#4f9ea3', bottom: '#3a3336', shoes: '#7a4d2c', accessory: 'bowtie', accessoryColor: '#d9584a', build: 1.12 },
    voice: { pitch: 1.15, rate: 1.1 },
    bio: 'Runs Proof of Brew. Hears every rumour on the planet before the network does.',
    concern: 'The new espresso contract has been giving away free coffee all week.',
    relationships: [{ id: 'nova', note: 'Nova is her best customer and worst debtor.' }, { id: 'meme', note: 'Lets Meme pay in drawings.' }],
    spots: {
      counter: { region: 'city', x: 12.3, y: 6.4, heading: -90 },
      terrace: { region: 'city', x: 10.1, y: 6.6, heading: -100 },
      table: { anchor: 'city.cafe.table1.chair1' },
    },
    routine: [
      { from: 6, to: 9, spot: 'counter', activity: { kind: 'chat', with: 'nova' } },
      { from: 9, to: 18, spot: 'counter', activity: { kind: 'idle', actions: ['drink', 'sweep', 'lookAround', 'talk'] } },
      { from: 18, to: 22, spot: 'terrace', activity: { kind: 'work', action: 'sweep' } },
      { from: 22, to: 6, spot: 'table', activity: { kind: 'sit' } },
    ],
  },
  {
    id: 'nova', name: 'NOVA', title: 'Developer', region: 'city',
    look: { skin: '#c98b62', hair: '#9d6fc9', hairStyle: 'bob', top: '#7f6cc9', topStyle: 'hoodie', topAccent: '#f4efe6', bottom: '#2d4060', shoes: '#f0b04a', hat: 'headphones', hatColor: '#2a2430', glasses: 'square', bag: 'backpack', bagColor: '#f0b04a', freckles: true },
    voice: { pitch: 1.25, rate: 1.25 },
    bio: 'Builds decentralised apps at NovaLabs, usually from a café table.',
    concern: 'Somewhere in her coffee contract is a one-character bug.',
    relationships: [{ id: 'byte', note: 'Owes Byte for roughly forty lattes.' }, { id: 'fork', note: 'Rival-friend; they fork each other’s ideas.' }],
    spots: {
      cafe: { region: 'city', x: 11.6, y: 6.5, heading: 90 },
      table: { anchor: 'city.cafe.table2.chair1' },
      lab: { region: 'city', x: 11.5, y: 21.4, heading: 180 },
    },
    routine: [
      { from: 6, to: 9, spot: 'cafe', activity: { kind: 'chat', with: 'byte' } },
      { from: 9, to: 15, spot: 'table', activity: { kind: 'sit' } },
      { from: 15, to: 20, spot: 'lab', activity: { kind: 'work', action: 'type' } },
      { from: 20, to: 6, spot: 'table', activity: { kind: 'sit' } },
    ],
  },
  {
    id: 'genesis', name: 'GENESIS', title: 'Archivist', region: 'city',
    look: { skin: '#e0a982', hair: '#a8a29a', hairStyle: 'bun', top: '#4f6fa8', topStyle: 'sweater', topAccent: '#e9e2d4', bottom: '#5b4a3a', shoes: '#3a3336', glasses: 'round', glassesColor: '#c89a3c', accessory: 'scarf', accessoryColor: '#c9bdee', height: 0.92, brows: 'arched' },
    voice: { pitch: 0.9, rate: 0.85 },
    bio: 'Guards the Merkle Library and every record that ever passed through it.',
    concern: 'Five historical blocks went missing from the archive years ago.',
    relationships: [{ id: 'block', note: 'Corresponds with Block by archived letter only.' }, { id: 'sat', note: 'Knew Sat when the first block was mined.' }],
    spots: {
      steps: { region: 'city', x: -9.7, y: 9.6, heading: 95 },
      desk: { region: 'city', x: -9.9, y: 5.4, heading: 110 },
    },
    routine: [
      { from: 7, to: 17, spot: 'steps', activity: { kind: 'work', action: 'read' } },
      { from: 17, to: 7, spot: 'desk', activity: { kind: 'idle', actions: ['read', 'think'] } },
    ],
  },
  {
    id: 'dex', name: 'DEX', title: 'Shopkeeper', region: 'city', talkRadius: 3.4,
    look: { skin: '#f6d5bf', hair: '#4a3226', hairStyle: 'ponytail', top: '#f0b04a', topStyle: 'vest', topAccent: '#f4efe6', bottom: '#2d4060', shoes: '#2d4060', hat: 'visor', hatColor: '#2f6c78', accessory: 'badge', accessoryColor: '#2f6c78' },
    voice: { pitch: 1.1, rate: 1.35 },
    bio: 'Runs a strictly educational exchange kiosk in Mempool Market. Every trade is pretend.',
    concern: 'A transaction he swears he sent never arrived anywhere.',
    relationships: [{ id: 'gas', note: 'Blames Gas for every slow trade.' }, { id: 'wallet', note: 'Sells Wallet "rare" receipts.' }],
    spots: { kiosk: { region: 'city', x: 4.7, y: -21.5, heading: -90 }, stroll: { region: 'city', x: 1.6, y: -24, heading: 180 } },
    routine: [
      { from: 7, to: 21, spot: 'kiosk', activity: { kind: 'idle', actions: ['type', 'talk', 'think', 'point'] } },
      { from: 21, to: 7, spot: 'stroll', activity: { kind: 'idle', actions: ['phone', 'lookAround'] } },
    ],
  },
  {
    id: 'pixel', name: 'PIXEL', title: 'NFT Artist', region: 'city',
    look: { skin: '#efc3a1', hair: '#e88fb0', hairStyle: 'pigtails', top: '#a6dcc3', topStyle: 'sweater', topAccent: '#f29db0', bottom: '#8a5a7c', shoes: '#e9a8a1', hat: 'beret', hatColor: '#2a2430', glasses: 'round', glassesColor: '#e8644a', freckles: true, height: 0.95 },
    voice: { pitch: 1.35, rate: 1.05 },
    bio: 'Paints pixels by hand, one at a time, outside the Pixel Loft.',
    concern: 'Her best piece is finished but she is too nervous to deliver it to the gallery.',
    relationships: [{ id: 'wallet', note: 'Wallet collects her work; she finds him terrifying.' }, { id: 'meme', note: 'Meme keeps "remixing" her art.' }],
    spots: { easel: { region: 'city', x: -5.7, y: -23.6, heading: -100 }, square: { region: 'city', x: -5.2, y: 5.6, heading: 135 } },
    routine: [
      { from: 8, to: 18, spot: 'easel', activity: { kind: 'work', action: 'paint' } },
      { from: 18, to: 8, spot: 'square', activity: { kind: 'idle', actions: ['lookAround', 'think', 'stretch'] } },
    ],
  },
  {
    id: 'gas', name: 'GAS', title: 'Engineer', region: 'city',
    look: { skin: '#f6d5bf', hair: '#c4563f', hairStyle: 'spiky', top: '#d9584a', topStyle: 'shirt', topAccent: '#f4efe6', bottom: '#2f3542', shoes: '#2a2430', hat: 'visor', hatColor: '#d9584a', accessory: 'badge', accessoryColor: '#f0b04a', mustache: '#c4563f', brows: 'worried', build: 1.15 },
    voice: { pitch: 0.85, rate: 1.4 },
    bio: 'Runs the Gas Station, where network fees are measured, mourned and occasionally paid.',
    concern: 'The link between Chain City and the Mining District is hopelessly congested.',
    relationships: [{ id: 'hash', note: 'Hash is his oldest friend and favourite person to complain to.' }, { id: 'node', note: 'Thinks Node blames him unfairly.' }],
    spots: { pumps: { region: 'city', x: 27.6, y: -16.2, heading: 160 }, booth: { region: 'city', x: 26, y: -21, heading: 0 } },
    routine: [
      { from: 6, to: 22, spot: 'pumps', activity: { kind: 'idle', actions: ['inspect', 'hammer', 'think', 'shrug'] } },
      { from: 22, to: 6, spot: 'booth', activity: { kind: 'idle', actions: ['phone', 'lookAround'] } },
    ],
  },
  {
    id: 'sat', name: 'SAT', title: 'The Old Miner', region: 'hills',
    look: { skin: '#e0a982', hair: '#e8e1d6', hairStyle: 'short', top: '#7a5234', topStyle: 'vest', topAccent: '#d9cdb6', bottom: '#5d6670', shoes: '#5b3a2a', hat: 'flatcap', hatColor: '#6b5a4a', glasses: 'round', beard: '#e8e1d6', height: 0.95, build: 1.1 },
    voice: { pitch: 0.75, rate: 0.8 },
    bio: 'Mined the planet’s first blocks on a beige desktop. Still keeps it running.',
    concern: 'Worries the young ones have forgotten why any of this started.',
    relationships: [{ id: 'block', note: 'Old friends; they argue about dates.' }, { id: 'hash', note: 'Taught Hash everything about rigs.' }],
    spots: { chair: { anchor: 'hills.shack.chair' }, stone: { anchor: 'hills.memorial.visitor' } },
    routine: [
      { from: 6, to: 14, spot: 'chair', activity: { kind: 'sit' } },
      { from: 14, to: 19, spot: 'stone', activity: { kind: 'chat', with: 'block' } },
      { from: 19, to: 6, spot: 'chair', activity: { kind: 'sit' } },
    ],
  },
  {
    id: 'block', name: 'BLOCK', title: 'Historian', region: 'hills',
    look: { skin: '#a86b47', hair: '#8f8b88', hairStyle: 'curly', top: '#8a6a48', topStyle: 'coat', topAccent: '#e9e2d4', bottom: '#5b4a3a', shoes: '#3a3336', glasses: 'square', accessory: 'bowtie', accessoryColor: '#4f9ea3', height: 1.08, build: 0.95 },
    voice: { pitch: 0.9, rate: 0.95 },
    bio: 'Studies the origins of the chain from a cabin full of boxes in Genesis Hills.',
    concern: 'Has a theory about the planet’s network outages but no proof.',
    relationships: [{ id: 'sat', note: 'Sat remembers; Block writes it down.' }, { id: 'genesis', note: 'Pen-pal of the Archivist.' }],
    spots: { porch: { anchor: 'hills.cabin.porch' }, desk: { anchor: 'hills.cabin.desk' }, stone: { anchor: 'hills.memorial.visitor', dx: -1.3, dz: 0.4, turn: 0.9 } },
    routine: [
      { from: 6, to: 14, spot: 'porch', activity: { kind: 'work', action: 'read' } },
      { from: 14, to: 19, spot: 'stone', activity: { kind: 'chat', with: 'sat' } },
      { from: 19, to: 6, spot: 'desk', activity: { kind: 'idle', actions: ['read', 'think'] } },
    ],
  },
  {
    id: 'luna', name: 'LUNA', title: 'Researcher', region: 'hills',
    look: { skin: '#f6d5bf', hair: '#2b2321', hairStyle: 'long', top: '#f4f6f8', topStyle: 'labcoat', topAccent: '#2d4060', bottom: '#2d4060', shoes: '#9aa6b2', glasses: 'round', glassesColor: '#9aa6b2', accessory: 'necklace', height: 1.05 },
    voice: { pitch: 1.05, rate: 0.95 },
    bio: 'Listens to the sky from the observatory and to the network from its radio.',
    concern: 'A signal repeats every 21 seconds. It should not exist.',
    relationships: [{ id: 'fork', note: 'Former lab partner of Fork — before the explosion.' }, { id: 'oracle', note: 'Trades data with Oracle.' }],
    spots: { console: { anchor: 'hills.observatory.console' }, door: { anchor: 'hills.observatory.door' } },
    routine: [
      { from: 18, to: 9, spot: 'console', activity: { kind: 'work', action: 'type' } },
      { from: 9, to: 18, spot: 'door', activity: { kind: 'idle', actions: ['think', 'lookAround', 'read'] } },
    ],
  },
  {
    id: 'wallet', name: 'WALLET', title: 'The Collector', region: 'coast',
    look: { skin: '#c98b62', hair: '#e8e1d6', hairStyle: 'swoop', top: '#1d2433', topStyle: 'jacket', topAccent: '#f0b04a', bottom: '#1d2433', shoes: '#f0b04a', glasses: 'shades', accessory: 'necklace', height: 1.1 },
    voice: { pitch: 0.85, rate: 0.9 },
    bio: 'Owns the Floor Price Gallery and, by his own account, most of history.',
    concern: 'The centrepiece display has been empty for a month. Unacceptable.',
    relationships: [{ id: 'pixel', note: 'Collects Pixel’s work obsessively.' }, { id: 'meme', note: 'Suspects Meme of copying everything.' }],
    spots: { display: { anchor: 'coast.gallery.display' }, door: { anchor: 'coast.gallery.door' } },
    routine: [
      { from: 7, to: 19, spot: 'display', activity: { kind: 'idle', actions: ['inspect', 'think', 'phone', 'drink'] } },
      { from: 19, to: 7, spot: 'door', activity: { kind: 'idle', actions: ['lookAround', 'phone'] } },
    ],
  },
  {
    id: 'meme', name: 'MEME', title: 'Street Artist', region: 'coast',
    look: { skin: '#a86b47', hair: '#58d6a0', hairStyle: 'spiky', top: '#e8644a', topStyle: 'hoodie', topAccent: '#f6d55c', bottom: '#2a2430', shorts: true, shoes: '#f6d55c', hat: 'bucket', hatColor: '#f6d55c', height: 0.97 },
    voice: { pitch: 1.2, rate: 1.3 },
    bio: 'Paints the seawall with jokes only the internet understands.',
    concern: 'Nobody gets the latest mural. That is how Meme knows it is good.',
    relationships: [{ id: 'pixel', note: 'Calls remixing Pixel’s art "a tribute".' }, { id: 'byte', note: 'Pays Byte in sketches.' }],
    spots: { wall: { anchor: 'coast.mural.front' }, beach: { region: 'coast', x: -4, y: -4.5, heading: 180 } },
    routine: [
      { from: 9, to: 17, spot: 'wall', activity: { kind: 'work', action: 'paint' } },
      { from: 17, to: 21, spot: 'beach', activity: { kind: 'idle', actions: ['lookAround', 'laugh', 'stretch'] } },
      { from: 21, to: 9, spot: 'wall', activity: { kind: 'idle', actions: ['think', 'phone'] } },
    ],
  },
  {
    id: 'fork', name: 'FORK', title: 'Inventor', region: 'coast',
    look: { skin: '#efc3a1', hair: '#d9b36a', hairStyle: 'mohawk', top: '#e9e2d4', topStyle: 'labcoat', topAccent: '#d9584a', bottom: '#5d6670', shorts: true, shoes: '#4f9ea3', glasses: 'goggles', glassesColor: '#f0b04a', brows: 'thick' },
    voice: { pitch: 1.05, rate: 1.45 },
    bio: 'Runs Fork & Spoon Labs, where software is experimental and so is the plumbing.',
    concern: 'His bathtub-computer-boat refuses to boot, float or both.',
    relationships: [{ id: 'nova', note: 'Constantly forks Nova’s projects.' }, { id: 'luna', note: 'They no longer discuss the explosion.' }],
    spots: { bench: { anchor: 'coast.workshop.bench' }, tinker: { region: 'coast', x: 22.4, y: -0.8, heading: 120 } },
    routine: [
      { from: 7, to: 13, spot: 'bench', activity: { kind: 'work', action: 'hammer' } },
      { from: 13, to: 20, spot: 'tinker', activity: { kind: 'idle', actions: ['think', 'inspect', 'hammer', 'shrug'] } },
      { from: 20, to: 7, spot: 'bench', activity: { kind: 'idle', actions: ['think', 'drink'] } },
    ],
  },
  {
    id: 'hash', name: 'HASH', title: 'Mechanic', region: 'mining',
    look: { skin: '#7f4f33', hair: '#2b2321', hairStyle: 'short', top: '#f0b04a', topStyle: 'overalls', topAccent: '#f0b04a', bottom: '#4f6f8f', shoes: '#3a3336', hat: 'beanie', hatColor: '#d9584a', accessory: 'toolbelt', build: 1.25, height: 1.05 },
    voice: { pitch: 0.8, rate: 1.0 },
    bio: 'Repairs anything with a fan in Hash’s Repair Bay. Talks to machines more than people.',
    concern: 'Old Faithful, the district’s oldest rig, needs a part nobody makes any more.',
    relationships: [{ id: 'gas', note: 'Gas’s best friend and patient listener.' }, { id: 'sat', note: 'Learned the trade from Sat.' }],
    spots: { bench: { anchor: 'mining.bay.bench' }, machine: { anchor: 'mining.bay.machine', dx: -1.2, dz: 1.4, turn: 2.4 }, front: { anchor: 'mining.bay.front' } },
    routine: [
      { from: 6, to: 12, spot: 'machine', activity: { kind: 'work', action: 'hammer' } },
      { from: 12, to: 18, spot: 'bench', activity: { kind: 'work', action: 'inspect' } },
      { from: 18, to: 6, spot: 'front', activity: { kind: 'idle', actions: ['drink', 'stretch', 'lookAround'] } },
    ],
  },
  {
    id: 'alpha', name: 'ALPHA', title: 'Explorer', region: 'woods',
    look: { skin: '#c98b62', hair: '#7a4d2c', hairStyle: 'short', top: '#8a9a5b', topStyle: 'vest', topAccent: '#f4efe6', bottom: '#6b5a4a', shorts: true, shoes: '#5b3a2a', hat: 'bucket', hatColor: '#b9a073', bag: 'backpack', bagColor: '#c9663e', accessory: 'camera' },
    voice: { pitch: 1.0, rate: 1.2 },
    bio: 'Maps abandoned structures and takes home anything that looks forgotten.',
    concern: 'Found a "relic" near Node Heights and is very proud of it.',
    relationships: [{ id: 'node', note: 'Has no idea Node has been looking for the relic.' }, { id: 'luna', note: 'Brings Luna strange antennas.' }],
    spots: { camp: { anchor: 'woods.camp.alpha' }, grotto: { anchor: 'woods.grotto.entrance', dz: 1.5, turn: Math.PI } },
    routine: [
      { from: 6, to: 11, spot: 'camp', activity: { kind: 'idle', actions: ['read', 'stretch', 'lookAround'] } },
      { from: 11, to: 16, spot: 'grotto', activity: { kind: 'idle', actions: ['inspect', 'point', 'think'] } },
      { from: 16, to: 6, spot: 'camp', activity: { kind: 'idle', actions: ['drink', 'read', 'lookAround'] } },
    ],
  },
  {
    id: 'oracle', name: 'ORACLE', title: 'Signal Keeper', region: 'heights',
    look: { skin: '#7f4f33', hair: '#e8e1d6', hairStyle: 'bald', top: '#2d4060', topStyle: 'coat', topAccent: '#c9bdee', bottom: '#2d4060', shoes: '#1d2433', glasses: 'round', glassesColor: '#f0b04a', beard: '#e8e1d6', accessory: 'necklace', height: 1.02 },
    voice: { pitch: 0.7, rate: 0.75 },
    bio: 'Watches Consensus Control and answers questions with predictions.',
    concern: 'Comms Station 5 went dark. The prophecy did not mention that.',
    relationships: [{ id: 'kai', note: 'Kai validates; Oracle predicts. They rarely agree.' }, { id: 'node', note: 'Taught Node to read latency like tea leaves.' }],
    spots: { front: { anchor: 'heights.control.front' }, lookout: { anchor: 'heights.institute.roof' } },
    routine: [
      { from: 6, to: 20, spot: 'front', activity: { kind: 'idle', actions: ['think', 'lookAround', 'nod'] } },
      { from: 20, to: 6, spot: 'front', activity: { kind: 'watch' } },
    ],
  },
  {
    id: 'kai', name: 'KAI', title: 'Validator', region: 'heights',
    look: { skin: '#efc3a1', hair: '#2b2321', hairStyle: 'short', top: '#f4efe6', topStyle: 'shirt', topAccent: '#2d4060', bottom: '#2d4060', shoes: '#1d2433', hat: 'cap', hatColor: '#2d4060', accessory: 'tie', accessoryColor: '#2d4060', brows: 'thick', build: 1.05 },
    voice: { pitch: 0.95, rate: 1.1 },
    bio: 'Guards the Validator Checkpoint. Requires twelve confirmations for everything.',
    concern: 'Something left the plateau without being validated.',
    relationships: [{ id: 'oracle', note: 'Finds Oracle’s predictions unverifiable.' }, { id: 'alpha', note: 'Saw Alpha leave with a suspicious box.' }],
    spots: { gate: { anchor: 'heights.checkpoint.guard' } },
    routine: [{ from: 0, to: 24, spot: 'gate', activity: { kind: 'idle', actions: ['think', 'lookAround', 'phone', 'nod'] } }],
  },
];

export function npcById(id: string): NpcDef | undefined {
  return NPCS.find((n) => n.id === id);
}
