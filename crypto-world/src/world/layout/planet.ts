import { Vector3 } from 'three';
import { RegionFrame } from '../RegionFrame';
import { LayoutBuilder, ll, ROAD_STYLES } from './LayoutBuilder';

/**
 * The planet's macro layout. Five districts sit along a great ring road — "The Chain" — that
 * circles the whole planet, so a player who keeps walking eventually returns to where they began.
 *
 *            Whitepaper Woods (north pole)
 *   Node Heights ─── Chain City ─── Genesis Hills
 *        │                                  │
 *   Mining District ──── Degen Coast ───────┘   (Liquidity Sea to the south)
 *            Cold Storage (south pole, snow)
 */
export function definePlanet(L: LayoutBuilder): void {
  const city = L.region({ id: 'city', name: 'Chain City', subtitle: 'Where every block meets', frame: new RegionFrame(0, 0), radius: 30, grass: ['#9ccc63', '#86b955'], ground: 'stone' });
  const hills = L.region({ id: 'hills', name: 'Genesis Hills', subtitle: 'Where it all began', frame: new RegionFrame(14, 72), radius: 32, grass: ['#80bd57', '#62a046'], ground: 'grass' });
  const coast = L.region({ id: 'coast', name: 'Degen Coast', subtitle: 'Sun, sand and questionable trades', frame: new RegionFrame(-4, 142), radius: 30, grass: ['#bccb7c', '#a7bb68'], ground: 'sand' });
  const mining = L.region({ id: 'mining', name: 'Mining District', subtitle: 'The hum that never sleeps', frame: new RegionFrame(5, -142), radius: 30, grass: ['#aaa67d', '#959270'], ground: 'stone' });
  const heights = L.region({ id: 'heights', name: 'Node Heights', subtitle: 'Listening to the whole network', frame: new RegionFrame(18, -72), radius: 30, grass: ['#90c48a', '#75ad7c'], ground: 'grass' });
  L.region({ id: 'woods', name: 'Whitepaper Woods', subtitle: 'Nine pages, one forest', frame: new RegionFrame(68, 10), radius: 40, grass: ['#72a851', '#5a9046'], ground: 'grass' });
  L.region({ id: 'south', name: 'Cold Storage', subtitle: 'Kept offline, kept safe', frame: new RegionFrame(-76, -50), radius: 34, grass: ['#eef4f8', '#dde7ee'], ground: 'snow' });

  // ---- Terrain macro features ----------------------------------------------------------------
  const S = L.shape;
  // Liquidity Sea, south of Degen Coast.
  S.oceans.push({ center: ll(-50, 152), radius: 50, depth: -9, beachWidth: 9, coastNoise: 4 });
  // Mempool Pond, south of Chain City.
  S.oceans.push({ center: city.frame.dir(4, -46), radius: 11, depth: -3.5, beachWidth: 4, coastNoise: 1.5 });
  // Rolling Genesis Hills and the observatory summit.
  S.hills.push({ center: hills.frame.dir(0, 8), radius: 36, amplitude: 6.5, frequency: 5.2 });
  S.bumps.push({ center: hills.frame.dir(13, 16), radius: 15, height: 5.5, flatTop: 3.8 });
  // Halving Hill lookout.
  S.bumps.push({ center: hills.frame.dir(-17, 20), radius: 10, height: 3.2, flatTop: 2.2 });
  // Node Heights plateau.
  S.plateaus.push({ center: heights.frame.dir(0, 12), innerRadius: 16, outerRadius: 32, height: 7 });
  // Gentle forest hummocks around the north pole and snow drifts at the south pole.
  S.hills.push({ center: ll(72, 0), radius: 46, amplitude: 2.6, frequency: 6 });
  S.hills.push({ center: ll(-78, -40), radius: 40, amplitude: 2.2, frequency: 5 });
  // Airdrop Isle off the coast.
  S.islands.push({ center: coast.frame.dir(14, -34), radius: 6, height: 1.2 });

  // Broad flattening under the city so streets read as a town.
  L.flatten('city', 0, 0, { radius: 26, falloff: 12, strength: 0.88, priority: 0 });
  L.flatten('mining', 0, 2, { radius: 22, falloff: 10, strength: 0.8, priority: 0 });
  L.flatten('coast', 0, 12, { radius: 14, falloff: 8, strength: 0.6, priority: 0 });
  L.flatten('heights', 0, 12, { radius: 13, falloff: 4, strength: 0.75, priority: 0 });

  // ---- The Chain: the ring road around the planet ---------------------------------------------
  const C = city.frame, H = hills.frame, D = coast.frame, M = mining.frame, N = heights.frame;
  const ring: Vector3[] = [
    C.dir(-30, -12), C.dir(-15, -12), C.dir(0, -12), C.dir(15, -12), C.dir(30, -11),
    ll(-1, 33), ll(0.5, 45), ll(2.5, 57),
    H.dir(-20, -14), H.dir(0, -15), H.dir(20, -14),
    ll(1, 92), ll(-1.5, 104), ll(-3, 116),
    D.dir(-24, 5), D.dir(-10, 5.5), D.dir(5, 5.5), D.dir(22, 3.5),
    ll(-2, 165), ll(0, 177), ll(2.5, -170),
    M.dir(-26, -3), M.dir(-10, -4), M.dir(10, -4), M.dir(26, -2),
    ll(4, -116), ll(3, -104),
    N.dir(-22, -19), N.dir(0, -20), N.dir(22, -19),
    ll(1.5, -48), ll(0, -38),
  ];
  L.road('the-chain', ring, ROAD_STYLES.avenue, { closed: true });
}
