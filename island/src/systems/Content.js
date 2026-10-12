// Content for the archipelago expansion: relics, containers, clues and missions.
// Pure data. Positions are world metres; `y` is filled in from the ground when omitted.
// Credits are a fictional in-game currency with no real-world value.

export const RARITY = {
  common: { label: 'Common', rank: 0, color: '#b8b2a4' },
  uncommon: { label: 'Uncommon', rank: 1, color: '#8fb59a' },
  rare: { label: 'Rare', rank: 2, color: '#7fa6c9' },
  epic: { label: 'Epic', rank: 3, color: '#b19ad0' },
  legendary: { label: 'Legendary', rank: 4, color: '#d8b56a' },
};

// Digital relics: fictional collectibles kept in the Relic Archive. The `serial` is the
// relic's unique identifier (in-game only; nothing is minted or traded).
export const RELICS = {
  tideCoin: {
    serial: 'TMK-0001', name: 'Tide Coin', rarity: 'common', icon: 'coin',
    desc: 'A heavy bronze token stamped with a ring of tiny hexagons and a block number: 000117.',
    where: 'Under the old pier, main island',
    lore: 'The survey crews used these as tokens for the supply drops. Each one carries a ledger number; no two match.',
  },
  driftglass: {
    serial: 'TMK-0002', name: 'Driftglass Lens', rarity: 'common', icon: 'lens',
    desc: 'A lens of sea-frosted glass ground into a perfect disc. Etched on the rim: NODE C.',
    where: 'Beach cache, Relic Island',
    lore: 'Pieces like this were used to focus the ruins’ old signal mirrors long before anyone strung wire between the islands.',
  },
  coralKey: {
    serial: 'TMK-0101', name: 'Coral Key', rarity: 'uncommon', icon: 'key',
    desc: 'A key cast in pale alloy, grown over with a lace of coral. Its bit is a binary pattern.',
    where: 'Offshore cache on the Lost Sandbar',
    lore: 'The smugglers kept a key to every cache under water, where only someone who knew the shoals would ever look.',
  },
  wings: {
    serial: 'TMK-0102', name: 'Pilot’s Wings', rarity: 'uncommon', icon: 'wings',
    desc: 'Enamel pilot’s wings with a serial number where the airline name should be.',
    where: 'Cache at Needle Rock',
    lore: 'Awarded to the network’s courier pilots after a hundred flights between the nodes. Only seven were ever issued.',
  },
  genesisCompass: {
    serial: 'TMK-1000', name: 'Genesis Compass', rarity: 'rare', icon: 'compass',
    desc: 'An old brass compass whose card is printed with the islands instead of the cardinal points. Under the glass, a string of hex digits runs around the rim.',
    where: 'Secret storage above Smuggler’s Cove',
    lore: 'The first object registered on the island ledger, entry zero. Its needle does not point north. It points at the ridge station.',
  },
  keepersSeal: {
    serial: 'TMK-1001', name: 'Keeper’s Seal', rarity: 'rare', icon: 'seal',
    desc: 'A wax-sealed steel disc. The seal carries the outpost’s call sign; the back is engraved with a signature hash.',
    where: 'Underground storage, the Forgotten Outpost',
    lore: 'Every node had a keeper who countersigned each block that passed through it. The outpost’s keeper left in a hurry.',
  },
  signalCrystal: {
    serial: 'TMK-1002', name: 'Signal Crystal', rarity: 'rare', icon: 'crystal',
    desc: 'A finger-long quartz oscillator in a copper cradle. Hold it near a radio and the static thins.',
    where: 'The cave on Relic Island',
    lore: 'The network’s clocks were cut from crystal found in this cave. The builders believed the island remembered time better than they did.',
  },
  encryptedCore: {
    serial: 'TMK-2000', name: 'Encrypted Core', rarity: 'epic', icon: 'core',
    desc: 'A sealed storage core the size of a fist, warm to the touch. Its status light still blinks once a minute.',
    where: 'Research shelter locker, Airstrip Island',
    lore: 'The expedition carried a full copy of the ledger off the network the night it went dark. This is it, or part of it.',
  },
  oceanFragment: {
    serial: 'TMK-2001', name: 'Ocean Fragment', rarity: 'epic', icon: 'fragment',
    desc: 'A shard of dark glass set in a steel frame, recovered from the Lost Vessel. Light passing through it splits into lines like text.',
    where: 'Hidden compartment aboard the Lost Vessel',
    lore: 'The freighter was carrying the network’s backup keys from island to island when she went onto the shoal.',
  },
  firstRelic: {
    serial: 'TMK-9999', name: 'The First Relic', rarity: 'legendary', icon: 'relic',
    desc: 'A small slab of black stone with a single gold inlay: the hash of the network’s very first block, cut by hand.',
    where: 'The vault beneath the observation point, Relic Island',
    lore: 'Before the antennas, before the ledger, someone carved the first entry into stone and hid it where the signal began. The network was only ever a copy.',
  },
};

// Items added to the regular inventory by the expansion.
export const EXPANSION_ITEMS = {
  supplies: { name: 'Survival supplies', desc: 'Ration packs, water tablets and a first aid kit, still sealed.', stack: true },
  mapFragment: { name: 'Chart fragments', desc: 'Torn pieces of a survey chart. Their marks appear on your chart (M).', stack: true },
  signalFragment: { name: 'Signal fragments', desc: 'Data shards recovered from the network. Three are needed to rebuild the vault message.', stack: true },
  navLog: { name: 'Navigation log', desc: 'The Lost Vessel’s log. The last entry is enciphered.' },
  accessCode: { name: 'Access code', desc: 'Six digits decoded at the cove radio: 4 1 7 0 2 9. "Panel behind the master\u2019s chart."' },
  transmitter: { name: 'Transmitter module', desc: 'The outpost antenna’s missing transmitter, recovered from the research shelter.' },
  expeditionNotes: { name: 'Expedition notes', desc: 'Water-stained pages from the missing expedition’s last camp.' },
};

// Containers: tier = supply | crypto | encrypted | vault. `code` locks an encrypted one.
export const CONTAINERS = {
  pier: { tier: 'crypto', name: 'Weathered case', x: 9.05, z: -24.2, yaw: 1.4, site: 'main', contents: { credits: 150, relic: 'tideCoin', items: { mapFragment: 1 } }, note: 'pierManifest', flag: 'container.pier' },
  headland: { tier: 'supply', name: 'Supply cache', x: 230.5, z: -77.5, yaw: 0.4, site: 'main', contents: { credits: 40, items: { supplies: 1 } } },
  falls: { tier: 'supply', name: 'Supply cache', x: -83.5, z: 214, yaw: 2.6, site: 'main', contents: { credits: 60, items: { supplies: 1, mapFragment: 1 } } },
  outpostDock: { tier: 'supply', name: 'Supply crate', x: -568.5, z: -536.5, yaw: 0.6, site: 'outpost', contents: { credits: 30, items: { supplies: 1 } } },
  outpostVault: { tier: 'encrypted', name: 'Steel strongbox', anchor: 'outpost.vault', site: 'outpost', code: '0318', codeHint: 'operatorLog', contents: { credits: 200, relic: 'keepersSeal', items: { signalFragment: 1 } }, flag: 'container.outpostVault', hidden: 'outpost.hatchOpen' },
  coveContainer: { tier: 'crypto', name: 'Hard case', anchor: 'coveYard.containerCase', site: 'cove', contents: { credits: 120, items: { mapFragment: 1 } }, note: 'sandbarCoords', flag: 'container.coveContainer' },
  coveDock: { tier: 'supply', name: 'Concealed cache', x: 622.6, z: -401.2, yaw: 0.9, site: 'cove', contents: { credits: 50, items: { supplies: 1 } } },
  coveSecret: { tier: 'vault', name: 'Camouflaged strongbox', x: 731.6, z: -400.6, yaw: -0.4, site: 'cove', contents: { credits: 250, relic: 'genesisCompass' }, flag: 'container.coveSecret' },
  relicBeach: { tier: 'supply', name: 'Supply cache', x: -684.5, z: 334, yaw: 1.9, site: 'relic', contents: { credits: 30, relic: 'driftglass' } },
  relicBuried: { tier: 'crypto', name: 'Buried container', x: -700, z: 296, yaw: 0.4, site: 'relic', buried: true, contents: { credits: 150, items: { signalFragment: 1 } }, flag: 'container.relicBuried' },
  stripFuel: { tier: 'supply', name: 'Fuel store locker', anchor: 'stripFuel.locker', site: 'airstrip', contents: { credits: 40, items: { supplies: 1 } } },
  stripLocker: { tier: 'encrypted', name: 'Research locker', anchor: 'airstrip.locker', site: 'airstrip', code: '2611', codeHint: 'expeditionJournal', contents: { credits: 300, relic: 'encryptedCore' }, flag: 'container.stripLocker' },
  sandbar: { tier: 'crypto', name: 'Weighted crate', x: -330, z: -640, yaw: 0.25, site: 'sandbar', contents: { credits: 250, relic: 'coralKey' }, flag: 'container.sandbar' },
  needle: { tier: 'supply', name: 'Courier’s cache', x: 396, z: -770.5, yaw: 0.2, site: 'needle', contents: { credits: 180, relic: 'wings' }, flag: 'container.needle' },
  wreckLocker: { tier: 'supply', name: 'Deck locker', site: 'wreck', anchor: 'wreck.locker', contents: { credits: 40, items: { supplies: 1 } } },
  wreckSecret: { tier: 'encrypted', name: 'Encrypted container', site: 'wreck', anchor: 'wreck.secret', unlockedBy: 'wreck.panelOpen', contents: { credits: 400, relic: 'oceanFragment' }, note: 'wreckLore', flag: 'container.wreckSecret', hidden: 'wreck.panelOpen' },
  finalVault: { tier: 'vault', name: 'The vault', site: 'relic', anchor: 'relicTower.vault', contents: { credits: 1000, relic: 'firstRelic' }, note: 'finalLore', flag: 'container.finalVault', hidden: 'relic.slabOpen' },
};

// Readable clues, logs and transmissions (shown in a reader and kept in the journal).
export const NOTES = {
  stationLog: { title: 'Station logbook', text: 'Day 212. Main breaker keeps tripping. Line A is scorched through — leave it isolated. Close B and C, then the main.\nCarrier for the island net is 147.30. If the board is ever powered again, tune there first.' },
  transmission1: { title: 'Transmission 001', text: '...carrier... node keeper to anyone on the net. The supply drop never came. I left the ledger case where the old pier meets the water, between the posts. The rest of the cargo goes to the cove. Ask at the harbour ledger.\n...end of transmission.' },
  pierManifest: { title: 'Cargo manifest', text: 'SEALED SUPPLY CASE — consignee: COVE.\nDeliver by water. Leave it at the cove’s loading dock. The harbour ledger on the pier has the job.' },
  smugglerNote: { title: 'Note left at the cove', text: 'Got the case. Good.\nIf you are reading this you are not one of us, so here is a kindness: what we kept for ourselves is up the narrow trail, where the rocks split. The ledger starts there.' },
  sandbarCoords: { title: 'Chart fragment: offshore cache', text: 'A torn corner of chart. Pencil cross on a shoal north-west of the reef, out past the channel. Written beside it: "low water, knee deep, the weighted one".' },
  transmission2: { title: 'Transmission 002', text: '...repeating. This is the outpost, north-west, past the reef. Antenna dark, transmitter pulled for repair and flown south to the research shelter. If you can hear this you have the station. Come to the outpost.' },
  operatorLog: { title: 'Outpost operator’s log', text: 'The network went quiet on the night of the 3rd. Keeper’s orders: anything that matters goes under the floor, combination is the date we lost the signal — month, then day: 03 18.\nThe transmitter went south with the expedition. Without it this mast is just a mast.' },
  transmission3: { title: 'Transmission 003', text: 'Outpost node online. Three nodes remain dark: the outpost’s own vault, the south beacon and the old stones on the western island. Each one holds a fragment of the vault message. Bring them to the station.' },
  beaconLog: { title: 'Beacon housing', text: 'A printed slip taped inside the housing: BEACON NODE — fragment held locally. Do not power down.' },
  expeditionJournal: { title: 'Expedition journal', text: 'Last entry. We took the ledger core off the net before it went dark. Locked it in the shelter locker: 26 11, the day we landed. The weather is turning. If we do not come back, someone should know the vault is under the lookout on the western island.' },
  researchNote: { title: 'Research shelter notice', text: 'MEDICAL SUPPLIES REQUESTED. Expedition overdue four days. Last known position: the south beach, past the ridge.' },
  fragmentsJoined: { title: 'Vault message', text: 'THE FIRST ENTRY LIES BENEATH THE WATCHER ON THE WESTERN STONES.\nLINK THE NODES IN THE ORDER THE SIGNAL TRAVELLED: OUTPOST — BEACON — STONES.' },
  relicGlyph: { title: 'Carved stones', text: 'Rows of carved hexagons, worn soft. One row is cut deeper than the others, as if it were added much later: a link, an arrow, a link, an arrow — and a stone at the end.' },
  navLog: { title: 'Navigation log — MV Halcyon', text: 'Cargo: storage media, sealed, for the cove. Weather worsening.\nNoon position plotted on the chart table.\nLast entry, in cipher: JGM-FHO. Inner ring set to the number of hands aboard, as always. The cipher wheel is at the cove radio.' },
  wreckChart: { title: 'Damaged chart', text: 'The chart is half pulp. A pencilled course runs from the cove to this shoal; beside the cove someone has written "radio — decode here". The rest of the coordinates are gone.\nPinned beside it, the crew list: five names.' },
  accessCode: { title: 'Decoded cipher', text: 'Turned on the cove radio’s cipher wheel, JGM-FHO reads as numbers: 4 1 7 0 2 9. Pencilled under the wheel: "panel behind the master’s chart".' },
  wreckLore: { title: 'Lost Vessel — sealed note', text: 'If the ledger is ever lost, this is one of the backup keys. Do not keep it with the others. The network is not the antennas. It is everyone who keeps a copy.' },
  finalLore: { title: 'The vault', text: 'A stone chamber, dry and cool. On the lid of the box, a single line: "Every copy is the original."' },
};

// Places a step can point at (waypoints / arrival zones).
export const PLACES = {
  station: { x: 66, z: 172, r: 14, name: 'Ridge Radio Station' },
  stationBox: { x: 61.6, z: 168.8, r: 3 },
  stationTerminal: { x: 64.9, z: 176.5, r: 3 },
  pierCache: { x: 9, z: -24, r: 6 },
  pierBoard: { x: 6.1, z: -13.5, r: 4 },
  coveDock: { x: 614, z: -410, r: 16, name: 'Smuggler’s Cove dock' },
  cove: { x: 650, z: -390, r: 40 },
  coveSecret: { x: 731, z: -400, r: 10 },
  coveRadio: { x: 649.5, z: -394.2, r: 4 },
  outpostDock: { x: -552, z: -518, r: 16, name: 'Outpost dock' },
  outpostHut: { x: -596, z: -552, r: 8 },
  outpostMast: { x: -612, z: -575, r: 8 },
  stripLanding: { x: 150, z: 775, r: 110, name: 'Airstrip Island landing water' },
  stripDock: { x: 138, z: 800, r: 14 },
  stripShelter: { x: 150, z: 847, r: 8 },
  stripBeacon: { x: 236, z: 849, r: 8 },
  stripCamp: { x: 30, z: 890, r: 12 },
  relic: { x: -740, z: 300, r: 60 },
  relicRuins: { x: -760, z: 300, r: 12 },
  relicSummit: { x: -790, z: 298, r: 8 },
  relicCave: { x: -728, z: 258, r: 8 },
  sandbar: { x: -330, z: -640, r: 20 },
  needle: { x: 395, z: -775, r: 30 },
  wreck: { x: 560, z: -556, r: 40, name: 'The Lost Vessel' },
  homePier: { x: 9, z: -44, r: 16, name: 'Camp pier' },
  homeWater: { x: 0, z: -120, r: 160, name: 'The lagoon' },
};

// Missions. Step types:
//   flag     – done when a progress flag is set (by an interaction in the world)
//   reach    – player within PLACES[at].r (vehicle: 'boat' | 'plane' to require it)
//   dock     – the boat is stopped inside a dock zone
//   land     – the seaplane is on the water and slowed down inside a zone
//   spot     – fly over a place above `alt` metres
//   items    – have `count` of an inventory item
// `at` puts a small waypoint on the step (omitted where finding it is the point).
export const MISSIONS = {
  s1: {
    title: 'Signal 001 — The First Transmission', kind: 'story', auto: true,
    brief: 'The camp radio picks up a faint carrier from the ridge above the waterfall path. Someone built a station up there.',
    steps: [
      { text: 'Find the radio station on the ridge', type: 'reach', at: 'station' },
      { text: 'Restore power at the distribution box', type: 'flag', flag: 'station.power', at: 'stationBox' },
      { text: 'Tune the terminal to the island carrier', type: 'flag', flag: 'station.tuned1', at: 'stationTerminal' },
      { text: 'Find the case the keeper left at the old pier', type: 'flag', flag: 'container.pier' },
    ],
    reward: { credits: 100 }, unlocks: ['m1'],
  },
  m1: {
    title: 'First Delivery', kind: 'boat', giver: 'ledger',
    brief: 'The sealed supply case from the pier goes to Smuggler’s Cove, east beyond the reef. Load it into the skiff at the pier.',
    cargo: { id: 'supplyCase', label: 'Sealed supply case', vehicle: 'boat', from: 'pierBoard', to: 'coveDock' },
    steps: [
      { text: 'Load the sealed supply case into the skiff', type: 'flag', flag: 'cargo.supplyCase.loaded', at: 'pierBoard' },
      { text: 'Take the skiff to Smuggler’s Cove', type: 'dock', at: 'coveDock' },
      { text: 'Unload the case at the cove dock', type: 'flag', flag: 'cargo.supplyCase.delivered', at: 'coveDock' },
      { text: 'Read the note left in the cargo shelter', type: 'flag', flag: 'note.smugglerNote', at: 'coveRadio' },
      { text: 'Find what the smugglers kept for themselves', type: 'flag', flag: 'container.coveSecret' },
    ],
    reward: { credits: 200 }, unlocks: ['s2', 'm2'],
  },
  m2: {
    title: 'Missing Cargo', kind: 'boat', giver: 'ledger',
    brief: 'A supply container went missing from the cove run. It was last seen washed up beside the cove’s old loading dock. Bring it back to the camp pier.',
    cargo: { id: 'missingCrate', label: 'Recovered container', vehicle: 'boat', from: 'coveDock', to: 'homePier' },
    steps: [
      { text: 'Find the missing container near the cove dock', type: 'flag', flag: 'cargo.missingCrate.found', at: 'coveDock' },
      { text: 'Load it into the skiff', type: 'flag', flag: 'cargo.missingCrate.loaded' },
      { text: 'Bring it back to the camp pier', type: 'dock', at: 'homePier' },
      { text: 'Unload it on the pier', type: 'flag', flag: 'cargo.missingCrate.delivered', at: 'homePier' },
    ],
    reward: { credits: 180, items: { mapFragment: 1 } },
  },
  m3: {
    title: 'The Silent Dock', kind: 'boat', giver: 'ledger',
    brief: 'The outpost needs communication equipment before its antenna can carry a signal again. Take the equipment crate from the pier to the outpost dock.',
    cargo: { id: 'commsKit', label: 'Communication equipment', vehicle: 'boat', from: 'pierBoard', to: 'outpostDock' },
    steps: [
      { text: 'Load the communication equipment into the skiff', type: 'flag', flag: 'cargo.commsKit.loaded', at: 'pierBoard' },
      { text: 'Take the skiff to the Forgotten Outpost', type: 'dock', at: 'outpostDock' },
      { text: 'Unload the equipment at the outpost dock', type: 'flag', flag: 'cargo.commsKit.delivered', at: 'outpostDock' },
    ],
    reward: { credits: 220 },
  },
  m4: {
    title: 'Lost Coordinates', kind: 'boat', giver: 'clue', requiresFlag: 'note.sandbarCoords',
    brief: 'The chart fragment from the cove marks a shoal north-west of the reef. "Low water, knee deep, the weighted one."',
    steps: [
      { text: 'Follow the chart fragment to the offshore shoal', type: 'reach', at: 'sandbar' },
      { text: 'Find the weighted crate on the sandbar', type: 'flag', flag: 'container.sandbar' },
    ],
    reward: { credits: 120 },
  },
  s2: {
    title: 'Signal 002 — Unknown Origin', kind: 'story', giver: 'station',
    brief: 'A second transmission is buried under the static. Tune the station terminal again.',
    steps: [
      { text: 'Decode the second transmission at the station', type: 'flag', flag: 'station.tuned2', at: 'stationTerminal' },
      { text: 'Travel to the Forgotten Outpost', type: 'reach', at: 'outpostHut' },
      { text: 'Search the communications hut', type: 'flag', flag: 'note.operatorLog', at: 'outpostHut' },
    ],
    reward: { credits: 150 }, unlocks: ['s3', 'm3', 'm5'],
  },
  s3: {
    title: 'Signal 003 — Broken Connection', kind: 'story', giver: 'auto',
    brief: 'The outpost antenna needs its equipment and its transmitter back. The equipment is at the camp pier; the transmitter went south to the research shelter on Airstrip Island.',
    steps: [
      { text: 'Deliver the communication equipment to the outpost (The Silent Dock)', type: 'flag', flag: 'cargo.commsKit.delivered', at: 'outpostDock' },
      { text: 'Recover the transmitter (The Forgotten Signal)', type: 'items', item: 'transmitter', count: 1 },
      { text: 'Install the transmitter on the outpost mast', type: 'flag', flag: 'outpost.online', at: 'outpostMast' },
    ],
    reward: { credits: 300 }, unlocks: ['s4'],
  },
  m5: {
    title: 'The Forgotten Signal', kind: 'plane', giver: 'flightlog',
    brief: 'The south beacon on Airstrip Island is still keyed but silent, and the outpost’s transmitter was flown down there. Take the seaplane.',
    steps: [
      { text: 'Fly south to Airstrip Island', type: 'reach', at: 'stripLanding', vehicle: 'plane' },
      { text: 'Land in the sheltered water of the bay', type: 'land', at: 'stripLanding' },
      { text: 'Restore power to the radio beacon', type: 'flag', flag: 'beacon.power', at: 'stripBeacon' },
      { text: 'Recover the transmitter from the research shelter', type: 'flag', flag: 'pickup.transmitter', at: 'stripShelter' },
      { text: 'Fly back and land in the lagoon', type: 'land', at: 'homeWater' },
    ],
    reward: { credits: 280 }, unlocks: ['m6', 'm7'],
  },
  m6: {
    title: 'Emergency Supply Run', kind: 'plane', giver: 'flightlog',
    brief: 'The research shelter asked for medical supplies days ago. Load the case into the seaplane and deliver it.',
    cargo: { id: 'medCase', label: 'Medical supplies', vehicle: 'plane', from: 'pierBoard', to: 'stripShelter' },
    steps: [
      { text: 'Load the medical supplies into the seaplane', type: 'flag', flag: 'cargo.medCase.loaded', at: 'pierBoard' },
      { text: 'Land at Airstrip Island', type: 'land', at: 'stripLanding' },
      { text: 'Deliver the supplies to the research shelter', type: 'flag', flag: 'cargo.medCase.delivered', at: 'stripShelter' },
    ],
    reward: { credits: 260 }, unlocks: ['m8'],
  },
  m7: {
    title: 'Eyes Above', kind: 'plane', giver: 'flightlog',
    brief: 'The courier pilots marked their cache by three landmarks only visible from the air. Fly over each one above 60 m.',
    steps: [
      { text: 'Spot the outpost mast from the air', type: 'spot', at: 'outpostMast', alt: 60 },
      { text: 'Spot the stone ring on Relic Island from the air', type: 'spot', at: 'relicRuins', alt: 60 },
      { text: 'Spot the Lost Vessel from the air', type: 'spot', at: 'wreck', alt: 60 },
      { text: 'Land near the point they mark and find the cache', type: 'flag', flag: 'container.needle', at: 'needle' },
    ],
    reward: { credits: 160 },
  },
  m8: {
    title: 'The Lost Expedition', kind: 'plane', giver: 'flightlog',
    brief: 'The research shelter’s notice gives the expedition’s last known position: the south beach of Airstrip Island, past the ridge.',
    steps: [
      { text: 'Investigate the expedition’s last camp', type: 'flag', flag: 'note.expeditionJournal', at: 'stripCamp' },
      { text: 'Open the research locker with the expedition’s code', type: 'flag', flag: 'container.stripLocker', at: 'stripShelter' },
    ],
    reward: { credits: 240 },
  },
  s4: {
    title: 'Signal 004 — The Encrypted Vault', kind: 'story', giver: 'auto',
    brief: 'Three dark nodes each hold a fragment of the vault message: the outpost’s vault, the south beacon and the stones of Relic Island.',
    steps: [
      { text: 'Collect three signal fragments', type: 'items', item: 'signalFragment', count: 3 },
      { text: 'Reassemble the fragments at the station terminal', type: 'flag', flag: 'station.fragments', at: 'stationTerminal' },
    ],
    reward: { credits: 300 }, unlocks: ['s5'],
  },
  s5: {
    title: 'Signal 005 — Network Restored', kind: 'story', giver: 'auto',
    brief: 'Wake the old node among the stones, link the nodes from the station in the order the signal travelled, then open the vault.',
    steps: [
      { text: 'Wake the old node among the stones on Relic Island', type: 'flag', flag: 'relic.node', at: 'relicRuins' },
      { text: 'Link the nodes at the station terminal', type: 'flag', flag: 'station.linked', at: 'stationTerminal' },
      { text: 'Open the vault beneath the observation point', type: 'flag', flag: 'container.finalVault', at: 'relicSummit' },
    ],
    reward: { credits: 500 },
  },
  lv: {
    title: 'The Lost Vessel', kind: 'side', giver: 'discover', discoverAt: 'wreck',
    brief: 'An unidentified freighter sits on the shoal west of Smuggler’s Cove, half under water. Someone hid something aboard.',
    steps: [
      { text: 'Investigate the shipwreck', type: 'reach', at: 'wreck' },
      { text: 'Search the accessible deck for clues', type: 'flag', flag: 'note.wreckChart' },
      { text: 'Recover the navigation log', type: 'flag', flag: 'note.navLog' },
      { text: 'Decode the access code at the cove radio', type: 'flag', flag: 'note.accessCode', at: 'coveRadio' },
      { text: 'Return to the wreck and open the hidden compartment', type: 'flag', flag: 'container.wreckSecret', at: 'wreck' },
    ],
    reward: { credits: 300 },
  },
};

// Order the journal lists missions in.
export const MISSION_ORDER = ['s1', 'm1', 's2', 'm3', 'm5', 's3', 's4', 's5', 'm2', 'm4', 'm6', 'm7', 'm8', 'lv'];

// Station terminal puzzles.
export const FREQUENCIES = { tune1: 147.3, tune2: 151.85 };
export const NODE_ORDER = ['outpost', 'beacon', 'stones'];
