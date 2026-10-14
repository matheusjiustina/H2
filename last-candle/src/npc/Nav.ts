import { STATIONS, SPOTS } from "../world/layout";

export interface NavNode {
  id: string;
  x: number;
  z: number;
  links: Set<string>;
}

/**
 * Hand-authored waypoint graph of the ground floor. Every edge is a straight
 * line through open floor, so walking NPCs never cross furniture.
 */
export class NavGraph {
  readonly nodes = new Map<string, NavNode>();

  constructor() {
    const n = (id: string, x: number, z: number) => this.nodes.set(id, { id, x, z, links: new Set() });
    n("doorOut", SPOTS.doorOutside.x, SPOTS.doorOutside.z);
    n("doorIn", SPOTS.doorInside.x, -0.75);
    n("entry", 0.25, -1.75);
    n("counterFront", SPOTS.counterFront.x, SPOTS.counterFront.z);
    n("lounge", -0.75, -1.65);
    n("couch", SPOTS.couchSeat.x, -1.95);
    n("window", SPOTS.window.x, SPOTS.window.z);
    n("fridgeFront", SPOTS.fridgeFront.x, SPOTS.fridgeFront.z);
    n("counterGap", 2.45, -4.1);
    n("ownerSpot", SPOTS.ownerIdle.x, SPOTS.ownerIdle.z);
    n("ownerBack", 2.5, -3.3);
    n("wbStand", SPOTS.whiteboardStand.x, SPOTS.whiteboardStand.z);
    n("wbApproach", -1.25, -13.25);
    n("muralStand", SPOTS.muralStand.x, SPOTS.muralStand.z);
    n("corridor", SPOTS.corridor.x, SPOTS.corridor.z);
    n("serverWindow", SPOTS.serverWindow.x, SPOTS.serverWindow.z);
    n("bigView", SPOTS.bigScreenView.x, SPOTS.bigScreenView.z);
    n("bin", 0.65, -3.75);

    // aisle spine along x=0 at every station depth
    const zs = new Set<number>([-3.9, -12.9, ...STATIONS.filter((s) => s.row !== "mezz").map((s) => s.chair[2])]);
    const sorted = [...zs].sort((a, b) => b - a);
    sorted.forEach((z) => n(`a${z}`, 0, z));
    for (let i = 0; i < sorted.length - 1; i++) this.link(`a${sorted[i]}`, `a${sorted[i + 1]}`);
    for (const s of STATIONS) {
      if (s.row === "mezz") continue;
      n(`stand-${s.id}`, s.stand[0], s.stand[1]);
      this.link(`stand-${s.id}`, `a${s.chair[2]}`);
    }
    const a0 = `a${sorted[0]}`;
    const aEnd = `a${sorted[sorted.length - 1]}`;
    this.link("doorOut", "doorIn");
    this.link("doorIn", "entry");
    this.link("entry", "counterFront");
    this.link("entry", "lounge");
    this.link("lounge", "couch");
    this.link("lounge", "window");
    this.link("entry", a0);
    this.link("counterFront", a0);
    this.link(a0, "fridgeFront");
    this.link(a0, "bin");
    this.link("bin", "counterFront");
    this.link(a0, "counterGap");
    this.link("counterGap", "ownerBack");
    this.link("ownerBack", "ownerSpot");
    this.link(aEnd, "wbApproach");
    this.link("wbApproach", "wbStand");
    this.link(aEnd, "muralStand");
    this.link(aEnd, "corridor");
    this.link("corridor", "serverWindow");
    // the big screen view point sits on the aisle
    let nearest = a0;
    let best = Infinity;
    for (const z of sorted) {
      const d = Math.abs(z - SPOTS.bigScreenView.z);
      if (d < best) {
        best = d;
        nearest = `a${z}`;
      }
    }
    this.link("bigView", nearest);
  }

  link(a: string, b: string) {
    this.nodes.get(a)!.links.add(b);
    this.nodes.get(b)!.links.add(a);
  }

  nearest(x: number, z: number): NavNode {
    let best: NavNode | null = null;
    let bd = Infinity;
    for (const n of this.nodes.values()) {
      if (n.id === "doorOut") continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best!;
  }

  /** Dijkstra over the small graph. Returns a list of waypoints (excluding the start node). */
  path(fromId: string, toId: string): { x: number; z: number; id: string }[] {
    if (fromId === toId) return [];
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const open = new Set<string>(this.nodes.keys());
    for (const k of open) dist.set(k, Infinity);
    dist.set(fromId, 0);
    while (open.size) {
      let u: string | null = null;
      let ud = Infinity;
      for (const k of open) {
        const d = dist.get(k)!;
        if (d < ud) {
          ud = d;
          u = k;
        }
      }
      if (!u || ud === Infinity) break;
      open.delete(u);
      if (u === toId) break;
      const un = this.nodes.get(u)!;
      for (const v of un.links) {
        if (!open.has(v)) continue;
        const vn = this.nodes.get(v)!;
        const alt = ud + Math.hypot(vn.x - un.x, vn.z - un.z);
        if (alt < dist.get(v)!) {
          dist.set(v, alt);
          prev.set(v, u);
        }
      }
    }
    const out: { x: number; z: number; id: string }[] = [];
    let cur: string | undefined = toId;
    if (!prev.has(toId)) return [];
    while (cur && cur !== fromId) {
      const nn = this.nodes.get(cur)!;
      out.unshift({ x: nn.x, z: nn.z, id: nn.id });
      cur = prev.get(cur);
    }
    return out;
  }
}
