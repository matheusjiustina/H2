import { describe, expect, it } from "vitest";
import { COSMETICS, freshCosmetics, migrateCosmetics } from "../src/systems/Cosmetics";
import { Progression, REGULAR_STEPS } from "../src/systems/Progression";

describe("cosmetics", () => {
  it("are purely cosmetic catalog entries with sane prices", () => {
    for (const c of COSMETICS) {
      expect(c.cost).toBeGreaterThanOrEqual(0);
      expect(c.name.length).toBeGreaterThan(2);
    }
    // three desk mats besides the house one, three case finishes, two lamps
    expect(COSMETICS.filter((c) => c.slot === "pad" && c.cost > 0)).toHaveLength(3);
    expect(COSMETICS.filter((c) => c.slot === "finish")).toHaveLength(3);
    expect(COSMETICS.filter((c) => c.slot === "lamp")).toHaveLength(2);
  });

  it("buying spends credits once, equips, and respects rep / reward gates", () => {
    const p = new Progression();
    p.d.credits = 20;
    expect(p.buyCosmetic("finish-glass").ok).toBe(false); // needs 40 rep
    expect(p.buyCosmetic("plate-regular").ok).toBe(false); // reward only
    const r = p.buyCosmetic("pad-grid");
    expect(r.ok).toBe(true);
    expect(p.d.credits).toBe(12);
    expect(p.d.cosmetics.equipped.pad).toBe("pad-grid");
    // re-equipping something owned is free
    p.equipCosmetic("pad-house");
    p.buyCosmetic("pad-grid");
    expect(p.d.credits).toBe(12);
    expect(p.buyCosmetic("pad-rain").ok).toBe(true);
    expect(p.d.credits).toBe(2);
    expect(p.buyCosmetic("lamp-banker").ok).toBe(false); // not enough credits
  });

  it("required slots can't be emptied; optional ones can", () => {
    const p = new Progression();
    p.d.credits = 100;
    p.buyCosmetic("mascot-owl");
    p.removeCosmetic("mascot");
    expect(p.d.cosmetics.equipped.mascot).toBeNull();
    p.removeCosmetic("pad");
    expect(p.d.cosmetics.equipped.pad).toBe("pad-house");
  });

  it("migrates older saves: the custom case becomes the glass finish", () => {
    const m = migrateCosmetics(undefined, ["chair", "case"]);
    expect(m.owned).toContain("finish-glass");
    expect(m.equipped.finish).toBe("finish-glass");
    const clean = migrateCosmetics(undefined, []);
    expect(clean).toEqual(freshCosmetics());
    // equipped items that aren't owned are dropped back to defaults
    const bad = migrateCosmetics({ owned: ["pad-house"], equipped: { ...freshCosmetics().equipped, pad: "pad-rain", lamp: "lamp-lava" } }, []);
    expect(bad.equipped.pad).toBe("pad-house");
    expect(bad.equipped.lamp).toBeNull();
  });
});

describe("become a regular", () => {
  it("shows one step at a time and completes exactly once, in any order", () => {
    const p = new Progression();
    expect(p.regularStep()?.id).toBe(REGULAR_STEPS[0].id);
    expect(p.markRegular("print")).toBe(false);
    expect(p.regularStep()?.id).toBe("seat");
    expect(p.markRegular("seat")).toBe(false);
    expect(p.markRegular("close")).toBe(false);
    expect(p.regularStep()?.id).toBe("talk2");
    expect(p.markRegular("talk2")).toBe(false);
    expect(p.markRegular("custom")).toBe(true);
    expect(p.regularStep()).toBeNull();
    expect(p.markRegular("custom")).toBe(false);
  });
});
