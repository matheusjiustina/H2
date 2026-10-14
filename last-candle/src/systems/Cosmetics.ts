/**
 * Station cosmetics. Purely visual: nothing here touches the market, fills,
 * fees or odds. Owned/equipped state lives in the save (ProgressData.cosmetics).
 */
export type CosmeticSlot = "pad" | "finish" | "lamp" | "mascot" | "stand" | "plate";

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  blurb: string;
  cost: number;
  rep: number;
  /** Only obtainable as a reward. */
  reward?: boolean;
}

export const COSMETICS: CosmeticDef[] = [
  { id: "pad-house", slot: "pad", name: "House desk mat", blurb: "Came with the desk. Has seen things.", cost: 0, rep: 0 },
  { id: "pad-grid", slot: "pad", name: "Night Grid mat", blurb: "Faint blue grid. Feels precise. Isn't.", cost: 8, rep: 0 },
  { id: "pad-wick", slot: "pad", name: "Long Wick mat", blurb: "One candle, one absurdly long wick.", cost: 8, rep: 0 },
  { id: "pad-rain", slot: "pad", name: "Rain Window mat", blurb: "Streaks of rain on dark glass.", cost: 10, rep: 0 },
  { id: "finish-beige", slot: "finish", name: "Aged beige case", blurb: "Original equipment. Yellowed with honor.", cost: 0, rep: 0 },
  { id: "finish-walnut", slot: "finish", name: "Walnut case", blurb: "Slatted wood front. Furniture-grade hardware.", cost: 45, rep: 15 },
  { id: "finish-glass", slot: "finish", name: "Smoked glass case", blurb: "Glass side, warm fans, visible guts. Zero alpha.", cost: 70, rep: 40 },
  { id: "lamp-banker", slot: "lamp", name: "Banker's lamp", blurb: "Green glass shade, brass neck. Very serious.", cost: 15, rep: 0 },
  { id: "lamp-lava", slot: "lamp", name: "Lava lamp", blurb: "Slow amber blobs. A chart for your soul.", cost: 18, rep: 0 },
  { id: "mascot-owl", slot: "mascot", name: "Bobble owl", blurb: "Nods at every trade. Agrees with everything.", cost: 12, rep: 0 },
  { id: "stand-receipt", slot: "stand", name: "Best-receipt stand", blurb: "Acrylic stand on the tower showing your best closed trade.", cost: 10, rep: 0 },
  { id: "plate-regular", slot: "plate", name: "Regular's nameplate", blurb: "Brass. Earned, not bought.", cost: 0, rep: 0, reward: true },
];

export const SLOT_LABEL: Record<CosmeticSlot, string> = {
  pad: "DESK MAT",
  finish: "CASE",
  lamp: "LAMP",
  mascot: "MASCOT",
  stand: "STAND",
  plate: "NAMEPLATE",
};

/** Slots that must always have something equipped (the others can be removed). */
export const REQUIRED: Partial<Record<CosmeticSlot, string>> = { pad: "pad-house", finish: "finish-beige" };

export type CosmeticEquip = Record<CosmeticSlot, string | null>;

export interface CosmeticState {
  owned: string[];
  equipped: CosmeticEquip;
}

export function freshCosmetics(): CosmeticState {
  return { owned: ["pad-house", "finish-beige"], equipped: { pad: "pad-house", finish: "finish-beige", lamp: null, mascot: null, stand: null, plate: null } };
}

export const cosmetic = (id: string) => COSMETICS.find((c) => c.id === id);

/** Fill gaps from older saves and carry over the old "custom case" upgrade. */
export function migrateCosmetics(c: Partial<CosmeticState> | undefined, legacyOwned: string[]): CosmeticState {
  const base = freshCosmetics();
  const out: CosmeticState = { owned: [...new Set([...base.owned, ...(c?.owned ?? [])])], equipped: { ...base.equipped, ...(c?.equipped ?? {}) } };
  if (legacyOwned.includes("case") && !out.owned.includes("finish-glass")) {
    out.owned.push("finish-glass");
    if (out.equipped.finish === "finish-beige") out.equipped.finish = "finish-glass";
  }
  for (const k of Object.keys(out.equipped) as CosmeticSlot[]) {
    const id = out.equipped[k];
    if (id && (!out.owned.includes(id) || cosmetic(id)?.slot !== k)) out.equipped[k] = REQUIRED[k] ?? null;
  }
  return out;
}
