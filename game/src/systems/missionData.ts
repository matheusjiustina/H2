import * as THREE from 'three';
import { dist2 } from '../core/util';
import { ISLAND, P, POI, SLAB_Y, TUNNEL } from '../world/layout';
import { COMPOUND } from '../world/districts/desert';
import { defeat, goTo, loseHeat, MissionDef, Run, Step } from './missions';

const TAG = 'mission';
const at = (x: number, z: number, y?: number): POI => ({ x, z, y });

/** Boss lobs something at the player on a timer (telegraphed ring on the ground). */
function lob(m: Run, dt: number, every: number, label: string, r = 2.8, dmg = 14, actorKey = 'boss') {
  m.data.lob = (m.data.lob ?? every) - dt;
  if (m.data.lob > 0) return;
  m.data.lob = every * (0.8 + Math.random() * 0.4);
  const p = m.p;
  m.g.combat.addHazard(p.pos.x + p.vel.x * 0.9 + (Math.random() - 0.5) * 2, p.pos.z + p.vel.z * 0.9 + (Math.random() - 0.5) * 2, r, 1.5, dmg, label);
  const a = m.actors.get(actorKey);
  if (a) {
    a.mode = 'throw';
    a.t = 0;
  }
}

function bossBar(m: Run, name: string, hp: number, max: number) {
  m.boss = { name, hp, max };
  m.g.hud.boss(m.boss);
}

// ============================================================================= ACT I
const m01: MissionDef = {
  id: 'm01', num: 1, act: 1, title: 'Welcome to America', intro: 'THE ENTIRE CITY IS LOOKING FOR YOU. FIND A WAY OUT.',
  where: P.dropZone, lateTitle: true, time: 10.5, weather: 'clear', heatCap: 4,
  setup: (m) => {
    if (!m.landed) m.p.startChute(P.dropZone.x, P.dropZone.y!, P.dropZone.z);
    m.protest(P.square.x + 4, P.square.z + 22, 11, 22);
    m.protest(-120, 150, 8, 12);
    for (const [k, x, z, r] of [['a', -128, 142, 0.6], ['b', -8, 64, 2.2], ['c', -112, 54, -0.9]] as const) m.car('cop' + k, 'police', x, z, r).siren = true;
    m.g.heat.lastKnown.set(P.square.x, 0, P.square.z);
  },
  steps: [
    {
      text: 'Steer the parachute (WASD, Shift to dive) — Liberty Square is swarming, land somewhere quieter',
      marker: at(-175, 105),
      done: (m) => m.landed,
    },
    {
      text: 'They spotted you! Find a getaway vehicle',
      start: (m) => {
        m.g.missions.titleCard();
        const p = m.p.pos, roads = m.g.world.roads;
        const ne = roads.nearestEdge(p.x, p.z, true)!;
        const e = ne.e;
        const t = Math.min(0.85, Math.max(0.15, ne.t + (ne.t > 0.5 ? -1 : 1) * (26 / e.len)));
        const off = e.w / 2 - 1.5;
        const car = m.car('getaway', 'muscle', e.a.x + (e.b.x - e.a.x) * t - e.dz * off, e.a.z + (e.b.z - e.a.z) * t + e.dx * off, Math.atan2(e.dx, e.dz), 0.04);
        m.data.gx = car.x;
        m.data.gz = car.z;
        m.heat(3, true, 4);
        m.npcs('agitator', P.square.x, P.square.z + 10, 3, 8);
        m.say('TRUMP', "Tremendous landing. The best. Now where's my car?");
      },
      marker: (m) => (m.cars.get('getaway') ? at(m.cars.get('getaway')!.x, m.cars.get('getaway')!.z) : null),
      done: (m) => m.inCar(),
    },
    goTo('Escape downtown — drive west to the suburban safehouse', at(P.safeSuburb.x, 240), 11, { vehicle: true, start: (m) => m.say('RADIO', 'All units: suspect is orange, loud, and heading west.') }),
    loseHeat('Lose your pursuers'),
  ],
  reward: { cash: 500, text: 'Safehouses now save your game' },
};

const m02: MissionDef = {
  id: 'm02', num: 2, act: 1, title: 'Not My Neighborhood', intro: 'The Home Owners Association has voted. You are a violation.',
  where: at(P.safeSuburb.x, 232), heatCap: 3, time: 14,
  setup: (m) => {
    m.protest(-550, 60, 9, 16);
    m.protest(-655, 60, 8, 12);
    m.protest(-445, -30, 8, 12);
    m.protest(-550, 150, 8, 10);
  },
  steps: [
    goTo('Maple Street is blocked. Cut through the neighbourhood park', at(P.park.x - 30, P.park.z + 26), 6, {
      start: (m) => {
        m.heat(2, true, 3);
        m.npcs('faction', -610, 150, 3, 6);
        m.say('H.O.A.', 'Sir, your lawn is unregistered and so are you.');
      },
    }),
    goTo('Sneak past the school — the alley behind the playground is clear', at(P.school.x + 22, 40), 7, { start: (m) => m.npcs('faction', -500, 0, 3, 8) }),
    {
      text: 'Borrow the pickup at the gas station',
      start: (m) => m.car('truck', 'pickup', P.gasStation.x + 7, P.gasStation.z + 1, -Math.PI / 2),
      marker: (m) => at(m.cars.get('truck')!.x, m.cars.get('truck')!.z),
      done: (m) => m.inCar(),
    },
    goTo('Drive to the Liberty Diner and blend in', at(P.diner.x, P.diner.z + 24), 9, { vehicle: true }),
    loseHeat('Wait for the H.O.A. to lose interest'),
  ],
  reward: { cash: 600 },
};

const m03: MissionDef = {
  id: 'm03', num: 3, act: 1, title: 'The Golden Tower', intro: 'Your tower. Your name on it. A crowd on the doorstep.',
  where: at(P.diner.x + 16, P.diner.z + 24), locked: ['tower-up'], time: 15.5,
  setup: (m) => {
    m.gate('tower-door', false);
    m.protest(P.tower.x, P.towerDoor.z + 6, 10, 22);
    m.npcs('reporter', P.tower.x + 14, P.towerDoor.z + 12, 3, 4, { forced: false });
  },
  steps: [
    goTo('Drive to the Golden Tower', at(P.tower.x, 60), 14),
    goTo('The front door is mobbed. Use the VIP garage ramp on Liberty Square', at(P.garage.x, P.garage.z, P.garage.y), 9, {
      y: true, start: (m) => m.say('TRUMP', 'My own door! Unbelievable. We go in through the garage. Very classy garage.'),
    }),
    {
      text: 'Take the private lift from the garage to the lobby',
      start: (m) => {
        m.gate('tower-door', false);
        m.sw('lift', -34, P.garage.y!, 118, 'Call the private lift', 0.8, () => {
          m.g.fade(() => {
            m.p.place(P.tower.x + 6, SLAB_Y, P.tower.z - 12, Math.PI);
            m.data.lobby = 1;
          });
        });
      },
      marker: at(-34, 118, P.garage.y),
      done: (m) => m.data.lobby === 1,
    },
    {
      text: 'Ride the golden elevator to the roof',
      start: (m) => {
        m.gate('tower-door', false);
        m.data['unlock:tower-up'] = 1;
      },
      marker: at(P.tower.x, P.tower.z - 19.5, SLAB_Y),
      done: (m) => m.p.pos.y > 140,
    },
    goTo('Wave to your city from the helipad', at(P.helipad.x, P.helipad.z, 150), 4, { y: true, start: (m) => (m.data['unlock:tower-up'] = 1) }),
  ],
  reward: { cash: 800, text: 'The tower roof and VIP garage are yours' },
};

const m04: MissionDef = {
  id: 'm04', num: 4, act: 1, title: 'Breaking News', intro: 'Every channel wants a comment. You have none.',
  where: at(P.tower.x, P.towerDoor.z + 4), heatCap: 4, time: 17,
  steps: [
    goTo('Outrun the press pack to the Metro plaza', P.metroDowntown, 8, {
      start: (m) => {
        m.heat(3, true, 4);
        m.npcs('reporter', P.tower.x - 10, P.towerDoor.z + 16, 8, 9, { forced: false });
        m.npcs('faction', P.tower.x + 30, P.towerDoor.z + 20, 4, 6);
        for (const [x, z] of [[-110, 66], [-20, 66]]) m.g.vehicles.spawn('van', x, z, Math.PI / 2, { tag: TAG, persistent: true, color: 0xf4f1e6 });
        m.say('REPORTER', 'Sir! Sir! Is it true you landed on a protest?!');
      },
    }),
    goTo('Too many cameras. Climb to the roof of the parking structure', at(P.parking.x + 22, 196, 7.3), 14, { y: true, start: (m) => m.say('TRUMP', 'No comment. Tremendous no comment.') }),
    loseHeat('Stay out of sight until they give up'),
  ],
  reward: { cash: 700, weapon: 'burger' },
};

const m05: MissionDef = {
  id: 'm05', num: 5, act: 1, title: 'Presidential Getaway', intro: 'The limousine is in the garage. The beach house is far away.',
  where: at(P.parking.x + 50, 228), heatCap: 4, time: 18.6,
  steps: [
    goTo('Get to the VIP garage under Liberty Square', at(P.garage.x, P.garage.z, P.garage.y), 10, { y: true }),
    {
      text: 'Take the Presidential limousine',
      start: (m) => m.adopt('limo', 'garage-limo', 'limo', -42, 138.8, Math.PI, P.garage.y),
      marker: (m) => at(m.cars.get('limo')!.x, m.cars.get('limo')!.z, P.garage.y),
      done: (m) => m.inCar('limo'),
    },
    goTo('Drive the limo to the beach bungalow — keep it in one piece', at(P.safeBeach.x, 325), 11, {
      vehicle: 'limo',
      start: (m) => {
        m.adopt('limo', 'garage-limo', 'limo', m.p.pos.x, m.p.pos.z, m.p.heading, m.p.pos.y);
        m.heat(4, true, 4);
        m.say('RADIO', 'Black limousine leaving the Golden Tower. It is not subtle.');
      },
      fail: (m) => (m.data['wrecked:limo'] ? 'The limousine was destroyed' : null),
    }),
    loseHeat('Shake the tail before you go inside'),
  ],
  reward: { cash: 1000, district: 'beach', outfit: 'golf', text: 'Act I complete' },
};

// ============================================================================= ACT II
const chase = (text: string, poi: POI, line?: [string, string]): Step =>
  goTo(text, poi, 14, {
    vehicle: true,
    start: (m) => {
      m.heat(4, true, 4);
      if (line) m.say(line[0], line[1]);
    },
  });

const m06: MissionDef = {
  id: 'm06', num: 6, act: 2, title: 'The Great American Chase', intro: 'Beach to back roads with half the county behind you.',
  where: at(P.safeBeach.x + 14, 325), exempt: true, heatCap: 4, time: 9,
  steps: [
    {
      text: 'Grab a fast car',
      start: (m) => m.car('ride', 'muscle', P.safeBeach.x + 20, 327.5, -Math.PI / 2, 0.04),
      marker: (m) => at(m.cars.get('ride')!.x, m.cars.get('ride')!.z),
      done: (m) => m.inCar(),
    },
    chase('Floor it west along Shore Drive', at(-760, 325), ['RADIO', 'He is in a muscle car. Of course he is.']),
    chase('North on County Line Road', at(-760, -100)),
    chase('Take Old Mill Road into farm country', at(-838, -240), ['SHERIFF', 'This is my county, son.']),
    chase('Blast past the Sheriff station', at(-490, -422)),
    goTo('Hide the car at the family farm', at(P.farm.x + 10, P.farm.z + 6), 10, { vehicle: true, start: (m) => m.release() }),
    loseHeat('Lie low — the cornfield is good cover'),
  ],
  reward: { cash: 1200, district: 'outskirts' },
};

const m07: MissionDef = {
  id: 'm07', num: 7, act: 2, title: 'Protest Boulevard', intro: 'Liberty Avenue is wall-to-wall signs. Find another way across.',
  where: at(-352, -96), heatCap: 4, time: 12.5,
  setup: (m) => {
    for (const x of [-230, -120, -10, 90]) m.protest(x, -120, 9, 16);
    m.protest(-120, -30, 8, 12);
    m.protest(-10, -30, 8, 12);
  },
  steps: [
    goTo('Cross downtown to Broadway without wading through the march', at(180, -75), 12, {
      timer: 170,
      start: (m) => {
        m.heat(2, true, 4);
        m.say('TRUMP', 'Look at this. Signs everywhere. Terrible spelling. We go around.');
      },
    }),
    goTo('Check the service ramp behind the tower block', at(P.tunnelSouth.x, P.tunnelSouth.z + 4), 6, { start: (m) => m.release() }),
    goTo('Follow the tunnel down to the security door', at(145, TUNNEL.zIn + 14, TUNNEL.depth), 7, { y: true }),
  ],
  reward: { cash: 900, text: 'The service tunnel is sealed from the government side…' },
};

const m08: MissionDef = {
  id: 'm08', num: 8, act: 2, title: 'The Government Problem', intro: 'Marble, lawns and a great many cameras. Learn the ground.',
  where: at(P.tunnelSouth.x, P.tunnelSouth.z + 12), exempt: true, heatCap: 4, time: 16,
  steps: [
    goTo('Enter the Government District: reach the Monument', at(P.obelisk.x, P.obelisk.z + 26), 10, {
      start: (m) => {
        m.heat(2, false, 4);
        m.say('TRUMP', 'Nice monument. Very tall. Mine is taller.');
      },
    }),
    goTo('Scout the White House west gate', at(P.whGate.x - 4, P.whGate.z), 7, { start: (m) => m.heat(3, true, 4) }),
    goTo('Scout the Capitol steps', at(424, P.capitol.z), 9),
    goTo('Find the Metro entrance for a quick exit', P.metroGov, 6),
    loseHeat('Vanish — the Metro works wonders', (m) => m.say('TRUMP', 'Public transport. First time. Do not tell anyone.')),
  ],
  reward: { cash: 1000 },
};

const WH = { lawn: at(P.whLawn.x, P.whLawn.z), bal: { x: P.whiteHouse.x, y: SLAB_Y + 9.7, z: P.whiteHouse.z + 14.5 } };
function bidenStage(m: Run, hp: number, lights: number) {
  m.gate('wh-west', false);
  m.gate('wh-south', false);
  m.actor('boss', 'biden', WH.bal.x, WH.bal.y, WH.bal.z, 0).mode = 'taunt';
  bossBar(m, 'WHITE HOUSE LOCKDOWN', hp, 3);
  m.heat(3, true, 4);
  m.clearLights();
  const caught = () => {
    m.say('BIDEN', 'There he is! Get him, folks!');
    m.npcs('security', P.whiteHouse.x - 30, P.whiteHouse.z + 20, 2, 4);
    m.g.combat.addHazard(m.p.pos.x, m.p.pos.z, 3, 1.2, 12, 'ZAP!');
  };
  for (let i = 0; i < lights; i++) m.light(140 + i * 28, P.whiteHouse.z + 44, 20, 0.45 + i * 0.12, 5, 16, caught, WH.bal.x, WH.bal.z);
}

const m09: MissionDef = {
  id: 'm09', num: 9, act: 2, title: 'White House Lockdown', intro: 'One gate in. A President on the balcony. No way out… yet.',
  where: at(P.whGate.x - 3, P.whGate.z), exempt: true, heatCap: 4, time: 20.6,
  quiet: { x: P.whiteHouse.x, z: P.whiteHouse.z + 30, r: 110 },
  steps: [
    goTo('Stroll through the west gate onto the South Lawn', WH.lawn, 10, {
      foot: true,
      start: (m) => {
        m.actor('boss', 'biden', WH.bal.x, WH.bal.y, WH.bal.z, 0).mode = 'talk';
        m.gate('wh-west', true);
      },
    }),
    {
      text: 'LOCKDOWN! Cut the searchlight power at the junction box',
      start: (m) => {
        bidenStage(m, 3, 2);
        m.say('BIDEN', "C'mon, man! You can't just parachute in here. LOCKDOWN!");
        m.sw('a', 124, SLAB_Y, P.whiteHouse.z + 58, 'Cut the searchlight power (hold E)', 2.2, () => (m.data.a = 1));
      },
      marker: at(124, P.whiteHouse.z + 58),
      done: (m, dt) => {
        lob(m, dt, 3.4, 'SPLAT!');
        return m.data.a === 1;
      },
    },
    defeat('Security detail! Knock them out', (m) => {
      bidenStage(m, 2, 0);
      m.say('BIDEN', 'Folks, here is the deal: tackle him. No joke.');
      m.npcs('security', P.whiteHouse.x, P.whiteHouse.z + 50, 5, 16);
    }),
    {
      text: 'Override the gate power beside the guard booth',
      start: (m) => {
        bidenStage(m, 2, 3);
        m.sw('b', 117, SLAB_Y, P.whGate.z - 9, 'Override gate power (hold E)', 2.4, () => (m.data.b = 1));
      },
      marker: at(117, P.whGate.z - 9),
      done: (m, dt) => {
        lob(m, dt, 2.8, 'SPLAT!');
        return m.data.b === 1;
      },
    },
    {
      text: 'End the lockdown at the podium under the balcony',
      start: (m) => {
        bidenStage(m, 1, 2);
        m.npcs('security', P.whiteHouse.x + 30, P.whiteHouse.z + 40, 3, 8);
        m.say('BIDEN', 'I have been doing this a long, long time, pal.');
        m.sw('c', P.whiteHouse.x, SLAB_Y, P.whiteHouse.z + 21, 'Shut down the lockdown (hold E)', 3, () => (m.data.c = 1));
      },
      marker: at(P.whiteHouse.x, P.whiteHouse.z + 21),
      done: (m, dt) => {
        lob(m, dt, 2.1, 'SPLAT!');
        return m.data.c === 1;
      },
    },
    goTo('The service tunnel is open — escape to downtown!', at(P.tunnelSouth.x, P.tunnelSouth.z), 8, {
      start: (m) => {
        m.clearLights();
        m.boss = null;
        m.g.hud.boss(null);
        m.actor('boss', 'biden', WH.bal.x, WH.bal.y, WH.bal.z, 0).mode = 'idle';
        m.say('BIDEN', 'Alright, alright. You win this one. I need an ice cream.');
        m.gate('tunnel', true);
        m.gate('wh-west', false);
        m.gate('wh-south', false);
        m.car('suv', 'suv', 128, P.whGate.z, -Math.PI / 2);
        m.heat(4, true, 4);
      },
    }),
    loseHeat('Lose the Secret Service'),
  ],
  reward: { cash: 1500, district: 'government', outfit: 'agent', weapon: 'order', text: 'The service tunnel stays open' },
};

const m10: MissionDef = {
  id: 'm10', num: 10, act: 2, title: 'Wall Street Panic', intro: 'Markets are down. Tempers are up. The Bears smell blood.',
  where: at(P.tunnelSouth.x + 20, -36), exempt: true, heatCap: 4, time: 13, weather: 'rain',
  setup: (m) => {
    m.protest(285, 55, 8, 14);
    m.protest(460, 127, 8, 12);
  },
  steps: [
    goTo('Push through the canyon streets to the Metro plaza', P.metroWall, 8, {
      start: (m) => {
        m.heat(4, true, 4);
        m.npcs('faction', 250, -50, 3, 6);
        m.npcs('faction', 320, 90, 3, 6);
        m.say('BEAR', 'SELL! SELL HIM!');
      },
    }),
    {
      text: (m) => `Hide in the bank courtyard until the helicopter passes (${Math.ceil(16 - (m.data.hide ?? 0))}s)`,
      marker: at(495, -6),
      start: (m) => m.heat(4, true, 4),
      done: (m, dt) => {
        if (m.g.world.zoneAt(m.p.pos.x, m.p.pos.z, 'hide')?.id === 'courtyard') m.data.hide = (m.data.hide ?? 0) + dt;
        return (m.data.hide ?? 0) >= 16;
      },
    },
    goTo('Make for the Stock Exchange plaza', P.exchangePlaza, 9, { start: (m) => m.heat(3, true, 4) }),
  ],
  reward: { cash: 1100 },
};

function obamaStage(m: Run, hp: number) {
  for (const id of ['ex-w', 'ex-e', 'ex-s']) m.gate(id, false);
  m.actor('boss', 'obama', P.exchange.x, SLAB_Y + 1.8, 54.4, 0).mode = 'talk';
  bossBar(m, 'THE STRATEGIST', hp, 3);
  m.heat(3, true, 4);
}
function micDrop(m: Run, dt: number, every: number) {
  m.data.mic = (m.data.mic ?? every) - dt;
  if (m.data.mic > 0) return;
  m.data.mic = every;
  const p = m.p.pos;
  for (let i = 0; i < 3; i++) m.g.combat.addHazard(p.x + (Math.random() - 0.5) * 12, p.z + (Math.random() - 0.5) * 8, 2.6, 1.3 + i * 0.25, 15, 'MIC DROP!');
  const a = m.actors.get('boss');
  if (a) {
    a.mode = 'throw';
    a.t = 0;
  }
}

const m11: MissionDef = {
  id: 'm11', num: 11, act: 2, title: 'The Strategist', intro: 'He planned the whole chase. He is waiting on the Exchange steps.',
  where: at(P.exchangePlaza.x, 88), exempt: true, heatCap: 4, time: 19.2,
  quiet: { x: P.exchange.x, z: 60, r: 110 },
  steps: [
    goTo('Step onto the Exchange plaza', at(P.exchange.x, 72), 7, {
      foot: true,
      start: (m) => {
        m.actor('boss', 'obama', P.exchange.x, SLAB_Y + 1.8, 54.4, 0).mode = 'idle';
        for (const id of ['ex-w', 'ex-e', 'ex-s']) m.gate(id, true);
      },
    }),
    {
      text: (m) => `Phase 1 — dodge the barriers, hit both security switches (${(m.data.s1 ?? 0) + (m.data.s2 ?? 0)}/2)`,
      start: (m) => {
        obamaStage(m, 3);
        m.say('OBAMA', 'Let me be clear: you walked right into this.');
        m.clearSliders();
        m.slider(342, 66, 438, 66, 14, 0.7);
        m.slider(438, 77, 342, 77, 14, 0.95);
        m.sw('s1', 331, SLAB_Y, 80, 'Disable west barrier control (hold E)', 1.6, () => {
          m.data.s1 = 1;
          m.g.interact.remove('s1');
        });
        m.sw('s2', 449, SLAB_Y, 80, 'Disable east barrier control (hold E)', 1.6, () => {
          m.data.s2 = 1;
          m.g.interact.remove('s2');
        });
      },
      done: (m, dt) => {
        micDrop(m, dt, 4.2);
        return m.data.s1 === 1 && m.data.s2 === 1;
      },
    },
    defeat('Phase 2 — the security detail', (m) => {
      obamaStage(m, 2);
      m.clearSliders();
      m.say('OBAMA', 'Folks, this is what we call a teachable moment.');
      m.npcs('guard', 350, 74, 2, 4);
      m.npcs('guard', 430, 74, 3, 4);
    }),
    {
      text: (m) => `Phase 3 — three terminals, only one is real (${Math.ceil(m.timer)}s)`,
      timer: 75,
      start: (m) => {
        obamaStage(m, 1);
        m.slider(360, 64, 360, 82, 10, 1.1);
        m.slider(420, 82, 420, 64, 10, 1.1);
        const real = Math.floor(Math.random() * 3);
        const spots = [[344, 64], [390, 81], [436, 64]];
        spots.forEach(([x, z], i) =>
          m.sw('t' + i, x, SLAB_Y, z, 'Try this terminal (hold E)', 1.5, () => {
            m.g.interact.remove('t' + i);
            if (i === real) m.data.real = 1;
            else {
              m.say('OBAMA', 'Not that one. I do admire the confidence.');
              m.npcs('guard', x, z + (z > 70 ? -6 : 6), 2, 2);
            }
          }),
        );
        m.say('OBAMA', 'Three terminals. One works. Take your time. Actually, do not.');
      },
      done: (m, dt) => {
        micDrop(m, dt, 3);
        return m.data.real === 1;
      },
    },
    goTo('Security is down — escape along Wall Street to Broadway', at(180, 20), 12, {
      start: (m) => {
        m.clearSliders();
        m.boss = null;
        m.g.hud.boss(null);
        for (const id of ['ex-w', 'ex-e', 'ex-s']) m.gate(id, true);
        m.actor('boss', 'obama', P.exchange.x, SLAB_Y + 1.8, 54.4, 0).mode = 'idle';
        m.say('OBAMA', 'Well played. Truly. Now if you will excuse me, I have a podcast.');
        m.heat(4, true, 4);
      },
    }),
    loseHeat('Lose the Bears'),
  ],
  reward: { cash: 1800, district: 'wallstreet', weapon: 'mega', vehicle: 'armored' },
};

const m12: MissionDef = {
  id: 'm12', num: 12, act: 2, title: 'The Harbor Escape', intro: 'Cranes, containers and a boat with your name on it. Not literally.',
  where: at(180, 256), exempt: true, heatCap: 5, time: 6.4,
  steps: [
    goTo('Lose them in the container maze', at(300, 357), 9, {
      start: (m) => {
        m.heat(4, true, 5);
        m.npcs('faction', 240, 330, 4, 8);
        m.say('DOCKER', 'This is a union yard, pal!');
      },
    }),
    goTo('Climb the gangway aboard the S.S. Free Trade', at(354, 418, 3.2), 5, { y: true, foot: true }),
    goTo('The Dockside Union is closing in — run for the marina', at(P.marina.x, 401), 7, { start: (m) => m.npcs('faction', 330, 395, 4, 6) }),
    {
      text: 'Take a speedboat',
      start: (m) => m.adopt('boat', 'harbor-boat', 'boat', 122, 424, 0),
      marker: (m) => at(m.cars.get('boat')!.x, m.cars.get('boat')!.z),
      done: (m) => m.inCar(),
    },
    goTo('Race across the bay to Liberty Island', at(ISLAND.x + 62, ISLAND.z - 28), 16, { vehicle: true, start: (m) => m.heat(4, true, 5) }),
    goTo('Catch your breath under Lady Liberty', at(P.liberty.x, P.liberty.z - 22), 7, {
      foot: true,
      start: (m) => {
        m.release();
        m.g.heat.clear();
        m.say('TRUMP', 'Beautiful statue. Great statue. I would have made it gold.');
      },
    }),
  ],
  reward: { cash: 1300, district: 'harbor', text: 'Act II complete' },
};

// ============================================================================= ACT III
const m13: MissionDef = {
  id: 'm13', num: 13, act: 3, title: 'Route 66', intro: 'East. Straight into the desert. Do not stop for souvenirs.',
  where: at(505, -112), exempt: true, heatCap: 5, time: 17.3,
  steps: [
    {
      text: 'Take the muscle car',
      start: (m) => m.car('ride', 'muscle', 512, -124.5, Math.PI / 2, 0.04),
      marker: (m) => at(m.cars.get('ride')!.x, m.cars.get('ride')!.z),
      done: (m) => m.inCar(),
    },
    chase('Hit Route 66 and keep the hammer down', at(700, -180), ['RADIO', 'Suspect is eastbound on Route 66. Set up at the motel.']),
    chase('Stay ahead of the highway patrol', at(860, -340)),
    chase('Loop around the mesas', at(700, -518)),
    goTo('Double back and pull in behind the Atomic Motel', at(P.motel.x - 6, P.motel.z + 12), 10, { vehicle: true, start: (m) => m.release() }),
    loseHeat('Kill the engine and wait'),
  ],
  reward: { cash: 1200 },
};

const m14: MissionDef = {
  id: 'm14', num: 14, act: 3, title: 'Desert Trouble', intro: 'Somebody out here is paying the mercenaries. Find the hideout.',
  where: at(P.motel.x - 22, P.motel.z + 16), exempt: true, heatCap: 4, time: 18.9,
  steps: [
    {
      text: 'A pickup is parked behind the abandoned gas station — take it',
      start: (m) => m.car('truck', 'pickup', P.oldGas.x + 4, P.oldGas.z - 12, 0.4),
      marker: (m) => at(m.cars.get('truck')!.x, m.cars.get('truck')!.z),
      done: (m) => m.inCar(),
    },
    goTo('Follow the dirt track south-east', at(684, 0), 10, { vehicle: true }),
    goTo('Scout the walled compound from the track', at(724, 18), 9, {
      start: (m) => m.say('TRUMP', 'Big wall. Very big wall. Somebody stole my idea.'),
    }),
    {
      text: 'The gate needs a keycard. Search the airfield hangar',
      start: (m) => {
        m.gate('compound', false);
        m.npcs('merc', P.hangar.x, P.hangar.z + 14, 4, 8, { forced: false, state: 'post' });
        m.sw('card', P.hangar.x, 0, P.hangar.z - 12, 'Grab the gate keycard (hold E)', 1.8, () => (m.data.card = 1));
      },
      marker: at(P.hangar.x, P.hangar.z - 12),
      done: (m) => m.data.card === 1,
    },
    goTo('Bring the keycard back to the compound gate', at(P.compoundGate.x - 6, P.compoundGate.z), 7, {
      start: (m) => {
        m.gate('compound', false);
        m.heat(3, false, 4);
      },
    }),
  ],
  reward: { cash: 1200 },
};

const C = COMPOUND;
function hideoutSetup(m: Run, closed: boolean) {
  m.gate('compound', !closed);
  m.heat(3, true, 4);
}
function bossTarget(m: Run, phase: number) {
  const g = m.g;
  g.combat.clearTargets(TAG);
  m.data.shield = 0;
  m.data.phase = phase;
  g.combat.addTarget(C.bossSpot.x, 0, C.bossSpot.z, 1.3, 100, TAG, () => {
    m.data.shield = 1;
    if (phase >= 3) {
      m.data.beaten = 1;
      return;
    }
    m.say('THE BOSS', phase === 1 ? 'Guards! GUARDS!' : 'You are testing my patience!');
    m.npcs('merc', C.bossSpot.x - 16, C.bossSpot.z, 3, 8);
    const s = C.switches[phase - 1];
    m.sw('shield' + phase, s.x, 0, s.z, 'Overload the shield generator (hold E)', 2, () => {
      g.interact.remove('shield' + phase);
      bossTarget(m, phase + 1);
    });
  });
  bossBar(m, 'THE DESERT HIDEOUT', 4 - phase, 3);
}

const m15: MissionDef = {
  id: 'm15', num: 15, act: 3, title: 'The Desert Hideout', intro: 'A maze of walls, a yard full of mercenaries, and one very cross villain.',
  where: at(P.compoundGate.x - 8, P.compoundGate.z), exempt: true, heatCap: 4, time: 21.5,
  quiet: { x: P.compound.x, z: P.compound.z, r: 140 },
  steps: [
    {
      text: (m) => `Infiltrate the maze and smash the generators (${m.data.gen ?? 0}/3)`,
      start: (m) => {
        hideoutSetup(m, false);
        m.g.heat.floor = 0;
        m.g.heat.locked = false;
        for (const [x, z] of [[766, 20], [782, 44], [798, -8], [798, 46], [820, -16], [840, 58]]) m.npcs('merc', x, z, 1, 0, { forced: false, state: 'post' });
        const caught = () => {
          m.say('GUARD', 'Intruder in the maze!');
          m.npcs('merc', m.p.pos.x + 10, m.p.pos.z, 2, 3);
        };
        m.light(766, 20, 12, 0.5, 4.5, 10, caught, 746, -32);
        m.light(798, 30, 14, 0.42, 4.5, 10, caught, 864, 72);
        m.light(830, -20, 10, 0.6, 4.5, 10, caught, 864, -32);
        C.generators.forEach((gp) => m.g.combat.addTarget(gp.x, 0, gp.z, 1.8, 60, TAG, () => (m.data.gen = (m.data.gen ?? 0) + 1)));
      },
      marker: (m) => {
        const t = m.g.combat.targets.find((x) => x.alive && x.tag === TAG);
        return t ? at(t.x, t.z) : null;
      },
      done: (m) => (m.data.gen ?? 0) >= 3,
    },
    {
      text: (m) => (m.data.shield ? 'He is shielded! Overload the shield generator' : 'Take down the hideout boss'),
      start: (m) => {
        hideoutSetup(m, true);
        m.clearLights();
        m.actor('boss', 'binladen', C.bossSpot.x, 0, C.bossSpot.z, -Math.PI / 2).mode = 'taunt';
        m.say('THE BOSS', 'You dare walk into MY hideout?!');
        // the fight happens in the yard: bring the player there on a checkpoint restart
        if (!m.g.world.zoneAt(m.p.pos.x, m.p.pos.z, 'restricted')) m.p.place(C.yard.x0 + 6, 0, C.bossSpot.z, Math.PI / 2);
        bossTarget(m, 1);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.28, depthWrite: false }));
        mesh.name = 'shield';
        m.group.add(mesh);
      },
      marker: (m) => {
        const s = m.g.interact.switches.find((x) => x.id.startsWith('shield'));
        return s ? at(s.x, s.z) : at(C.bossSpot.x, C.bossSpot.z + (m.data.bz ?? 0));
      },
      done: (m, dt) => {
        const a = m.actors.get('boss')!;
        const tgt = m.g.combat.targets.find((x) => x.tag === TAG);
        // the boss paces the back of the yard and lobs cartoon bombs
        const bz = Math.sin(m.g.time * 0.7) * 11;
        m.data.bz = bz;
        a.rig.root.position.set(C.bossSpot.x, 0, C.bossSpot.z + bz);
        if (tgt) tgt.z = C.bossSpot.z + bz;
        const shield = m.group.getObjectByName('shield');
        if (shield) {
          shield.visible = !!m.data.shield;
          shield.position.set(C.bossSpot.x, 1.3, C.bossSpot.z + bz);
        }
        m.data.bomb = (m.data.bomb ?? 2) - dt;
        if (m.data.bomb <= 0 && dist2(m.p.pos.x, m.p.pos.z, C.bossSpot.x, C.bossSpot.z) < 70 * 70) {
          m.data.bomb = m.data.phase >= 3 ? 1.5 : 2.4;
          m.g.combat.shotAt(C.bossSpot.x, 2.2, C.bossSpot.z + bz, m.p.pos.x, m.p.pos.y, m.p.pos.z, 'bomb', 0.1);
          a.mode = 'throw';
          a.t = 0;
        }
        if (tgt && tgt.alive && m.boss) {
          m.boss.hp = 3 - m.data.phase + tgt.hp / 100;
          m.g.hud.boss(m.boss);
        }
        return m.data.beaten === 1;
      },
    },
    {
      text: (m) => `The whole place is rigged — get out through the gate! (${Math.ceil(m.timer)}s)`,
      timer: 80,
      marker: at(712, 18),
      start: (m) => {
        m.gate('compound', true);
        m.boss = null;
        m.g.hud.boss(null);
        const a = m.actor('boss', 'binladen', C.bossSpot.x, 0, C.bossSpot.z, -Math.PI / 2);
        a.mode = 'down';
        m.group.getObjectByName('shield')?.removeFromParent();
        m.say('THE BOSS', 'This is not over! …It is a little bit over.');
        m.g.fx.text(C.bossSpot.x, 3, C.bossSpot.z, 'NETTED!', 'big');
      },
      done: (m, dt) => {
        m.data.rig = (m.data.rig ?? 0.6) - dt;
        if (m.data.rig <= 0) {
          m.data.rig = 0.7;
          const p = m.p.pos;
          m.g.combat.addHazard(p.x + (Math.random() - 0.5) * 22, p.z + (Math.random() - 0.5) * 22, 3.2, 1.4, 16, 'BOOM!');
        }
        return m.near(at(712, 18), 10);
      },
    },
  ],
  reward: { cash: 2000, district: 'desert', outfit: 'bodybuilder' },
};

const m16: MissionDef = {
  id: 'm16', num: 16, act: 3, title: 'Back to Downtown', intro: 'Every faction in the city is converging on the Golden Tower. So are you.',
  where: at(P.motel.x - 4, P.motel.z + 22), exempt: true, heatCap: 5, time: 5.9,
  steps: [
    {
      text: 'Get a vehicle',
      start: (m) => m.car('ride', 'sports', P.motel.x - 14, P.motel.z + 20, Math.PI / 2),
      marker: (m) => at(m.cars.get('ride')!.x, m.cars.get('ride')!.z),
      done: (m) => m.inCar(),
    },
    goTo('Tear back down Route 66 to the Interstate', at(530, -120), 14, { vehicle: true, start: (m) => m.heat(5, true, 5) }),
    goTo('Cross the city on Liberty Avenue', at(180, -120), 14, { vehicle: true, start: (m) => { m.heat(5, true, 5); m.protest(320, -120, 8, 12); } }),
    goTo('Dive into the VIP garage', at(P.garage.x, P.garage.z, P.garage.y), 10, { y: true, start: (m) => m.heat(5, true, 5) }),
    loseHeat('Let the search pass overhead'),
  ],
  reward: { cash: 1500 },
};

const m17: MissionDef = {
  id: 'm17', num: 17, act: 3, title: 'Everyone Against Trump', intro: 'Hecklers. Bears. The H.O.A. The Union. Deep State. All of them. At once.',
  where: at(P.garageRamp.x, P.garageRamp.z - 3), exempt: true, heatCap: 6, time: 18.2,
  steps: [
    goTo('Run the gauntlet to the Liberty Beach pier', at(P.pier.x, 336), 12, {
      start: (m) => {
        m.heat(6, true, 6);
        m.say('RADIO', 'All factions, all channels: EVERYONE AGAINST TRUMP.');
        m.car('ride', 'armored', P.garageRamp.x + 16, 62.6, Math.PI / 2, 0.04);
      },
    }),
    goTo('Cut through the suburbs to County Line', at(-760, 60), 14, { start: (m) => { m.heat(6, true, 6); m.protest(-655, 150, 8, 14); } }),
    goTo('Swing through the Government District', at(P.obelisk.x, -245), 14, { start: (m) => m.heat(6, true, 6) }),
    goTo('Thread Wall Street', at(320, 20), 12, { start: (m) => m.heat(6, true, 6) }),
    {
      text: (m) => `Make a stand in Liberty Square — survive ${Math.ceil(m.timer)}s`,
      timer: 60, survive: true, marker: P.square,
      start: (m) => m.heat(6, true, 6),
      done: () => false,
      fail: (m) => (m.t > 14 && !m.near(P.square, 70) ? 'You left Liberty Square' : null),
    },
  ],
  reward: { cash: 2000 },
};

const m18: MissionDef = {
  id: 'm18', num: 18, act: 3, title: 'THE FINAL ESCAPE', intro: 'One lobby. One elevator. One golden helicopter. Go.',
  where: at(P.square.x - 18, P.square.z - 26), exempt: true, heatCap: 6, time: 19.4, locked: ['tower-up'],
  quiet: { x: P.tower.x, z: P.tower.z, r: 70 },
  steps: [
    goTo('Fight your way to the Golden Tower entrance', at(P.tower.x, P.towerDoor.z - 2), 5, {
      start: (m) => {
        m.heat(6, true, 6);
        m.gate('tower-door', true);
        m.npcs('faction', P.tower.x, P.towerDoor.z + 8, 5, 10);
      },
    }),
    defeat('Lobby lockdown — knock out the security team', (m) => {
      m.heat(5, true, 6);
      m.p.place(P.tower.x, SLAB_Y, P.tower.z + 17, Math.PI);
      m.gate('tower-door', false);
      m.npcs('guard', P.tower.x, P.tower.z - 4, 6, 14);
      m.say('SECURITY', 'Sir, the building is closed. Especially to you.');
    }),
    {
      text: (m) => `Override the elevator: hit both lobby terminals (${(m.data.e1 ?? 0) + (m.data.e2 ?? 0)}/2)`,
      start: (m) => {
        m.gate('tower-door', false);
        m.sw('e1', P.tower.x - 19, SLAB_Y, P.tower.z - 14, 'Override terminal (hold E)', 2, () => { m.data.e1 = 1; m.g.interact.remove('e1'); });
        m.sw('e2', P.tower.x + 19, SLAB_Y, P.tower.z + 12, 'Override terminal (hold E)', 2, () => { m.data.e2 = 1; m.g.interact.remove('e2'); });
        m.npcs('guard', P.tower.x - 12, P.tower.z + 8, 3, 4);
      },
      done: (m, dt) => {
        m.data.hz = (m.data.hz ?? 2) - dt;
        if (m.data.hz <= 0) {
          m.data.hz = 2.2;
          m.g.combat.addHazard(m.p.pos.x + (Math.random() - 0.5) * 8, m.p.pos.z + (Math.random() - 0.5) * 8, 2.6, 1.4, 14, 'ZAP!');
        }
        return m.data.e1 === 1 && m.data.e2 === 1;
      },
    },
    {
      text: 'Ride the golden elevator to the roof',
      start: (m) => {
        m.gate('tower-door', false);
        m.data['unlock:tower-up'] = 1;
      },
      marker: at(P.tower.x, P.tower.z - 19.5, SLAB_Y),
      done: (m) => m.p.pos.y > 140,
    },
    defeat('Rooftop ambush! Clear the helipad', (m) => {
      m.data['unlock:tower-up'] = 1;
      m.npcs('guard', P.helipad.x, P.helipad.z, 4, 6, { y: 150 });
      const h = m.g.vehicles.spawn('heli', P.tower.x + 60, P.tower.z, 0, { mode: 'heliAI', y: 185, color: 0x2b2e42, persistent: true, tag: TAG });
      h.rotorSpeed = 1;
      m.heat(5, true, 6);
    }),
    {
      text: 'Board the Golden Chopper',
      start: (m) => {
        m.data['unlock:tower-up'] = 1;
        m.adopt('heli', 'tower-heli', 'heli', P.helipad.x, P.helipad.z, 0, 150);
      },
      marker: at(P.helipad.x, P.helipad.z, 150),
      done: (m) => m.inCar('heli'),
    },
    {
      text: 'Space to climb — fly south, out over the ocean',
      marker: at(P.tower.x, 600, 200),
      start: (m) => {
        const v = m.adopt('heli', 'tower-heli', 'heli', P.helipad.x, P.helipad.z, 0, 150);
        if (!m.p.vehicle) m.p.enter(v);
      },
      fail: (m) => (m.data['wrecked:heli'] ? 'The Golden Chopper went down' : null),
      done: (m) => !!m.p.vehicle && m.p.pos.z > 520 && m.p.pos.y > 30,
    },
  ],
  reward: { cash: 5000, outfit: 'golden', text: 'Campaign complete' },
};

export const MISSIONS: MissionDef[] = [m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18];
export const ACT_NAMES = ['', 'ACT I — TRUMP HAS LANDED', 'ACT II — EVERYONE IS WATCHING', 'ACT III — AMERICAN CHAOS'];
