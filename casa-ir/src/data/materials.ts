/**
 * Centralised finish catalogue + material slots.
 *
 *  FINISHES  – every finish that exists in the project (semantic id → PBR def).
 *  SLOTS     – every material "slot" referenced by geometry. A slot has a
 *              default finish (= ORIGINAL_PROJECT) and, when configurable, the
 *              list of alternative finishes the client may choose.
 *
 * Geometry never references a finish directly: it references a slot. Changing
 * a slot's finish recolours every object linked to that slot – and only those.
 */
import type { TextureKey } from '../materials/textures'

export type Family =
  | 'paint'
  | 'wallcovering'
  | 'wood'
  | 'slats'
  | 'lacquer'
  | 'stone'
  | 'fabric'
  | 'rope'
  | 'rug'
  | 'leather'
  | 'metal'
  | 'glass'
  | 'ceramic'
  | 'floor'
  | 'ground'
  | 'plant'
  | 'emissive'
  | 'misc'

export interface FinishDef {
  label: string
  family: Family
  color: string
  tex?: TextureKey
  /** metres covered by one texture tile */
  texScale?: number
  roughness: number
  metalness?: number
  bump?: number
  clearcoat?: number
  sheen?: number
  opacity?: number
  emissive?: string
  emissiveIntensity?: number
  envMapIntensity?: number
  /** colour used for UI swatches when different from `color` */
  swatch?: string
}

const F = (d: FinishDef) => d

export const FINISHES = {
  // ── Paints ─────────────────────────────────────────────────────────────
  paint_white: F({ label: 'Branco Neve', family: 'paint', color: '#f1efea', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_offwhite: F({ label: 'Branco Gelo', family: 'paint', color: '#ebe6dd', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_cream: F({ label: 'Off-white Areia', family: 'paint', color: '#e4dccd', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_sand: F({ label: 'Areia', family: 'paint', color: '#d5c7b1', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_greige: F({ label: 'Greige', family: 'paint', color: '#b8afa2', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_taupe_int: F({ label: 'Taupe', family: 'paint', color: '#8f867b', tex: 'plaster', texScale: 2.5, roughness: 0.9 }),
  paint_taupe: F({ label: 'Cinza Fendi', family: 'paint', color: '#8c8478', tex: 'plaster', texScale: 3, roughness: 0.94 }),
  paint_taupe_dark: F({ label: 'Fendi Escuro', family: 'paint', color: '#6c655c', tex: 'plaster', texScale: 3, roughness: 0.94 }),
  paint_graphite: F({ label: 'Grafite', family: 'paint', color: '#4c4946', tex: 'plaster', texScale: 2.5, roughness: 0.88 }),
  paint_sage: F({ label: 'Verde Sálvia', family: 'paint', color: '#a3a690', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_terracotta: F({ label: 'Terracota Suave', family: 'paint', color: '#b47a5d', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_petrol: F({ label: 'Azul Petróleo', family: 'paint', color: '#55666e', tex: 'plaster', texScale: 2.5, roughness: 0.92 }),
  paint_concrete: F({ label: 'Cimento Queimado', family: 'paint', color: '#b5b1aa', tex: 'concrete', texScale: 3, roughness: 0.85 }),

  // ── Wall coverings ─────────────────────────────────────────────────────
  wall_linen_beige: F({ label: 'Tecido Linho Bege', family: 'wallcovering', color: '#ddd3c2', tex: 'linen', texScale: 0.35, roughness: 0.95, bump: 0.6 }),
  wall_linen_gray: F({ label: 'Linho Cinza', family: 'wallcovering', color: '#a29c93', tex: 'linen', texScale: 0.35, roughness: 0.95, bump: 0.6 }),
  wallpaper_beige: F({ label: 'Papel Texturizado Bege', family: 'wallcovering', color: '#e3d9c9', tex: 'linen', texScale: 0.6, roughness: 0.9, bump: 0.3 }),
  wall_marble_geo: F({ label: 'Papel Geométrico Marmorizado', family: 'wallcovering', color: '#eeebe6', tex: 'wallpaper_geo', texScale: 1.2, roughness: 0.6 }),

  // ── Woods ──────────────────────────────────────────────────────────────
  wood_walnut: F({ label: 'Nogueira', family: 'wood', color: '#6e4b33', tex: 'wood', texScale: 1.4, roughness: 0.5, clearcoat: 0.15 }),
  wood_freijo: F({ label: 'Freijó', family: 'wood', color: '#a6774f', tex: 'wood', texScale: 1.4, roughness: 0.55 }),
  wood_oak: F({ label: 'Carvalho Natural', family: 'wood', color: '#9b7752', tex: 'wood', texScale: 1.4, roughness: 0.55 }),
  wood_oak_light: F({ label: 'Carvalho Claro', family: 'wood', color: '#c6a47e', tex: 'wood', texScale: 1.4, roughness: 0.55 }),
  wood_cumaru: F({ label: 'Cumaru', family: 'wood', color: '#7b5a40', tex: 'wood', texScale: 1.4, roughness: 0.52 }),
  wood_ebony: F({ label: 'Ebanizado', family: 'wood', color: '#3b2e25', tex: 'wood', texScale: 1.4, roughness: 0.45 }),
  wood_teak: F({ label: 'Teca', family: 'wood', color: '#9a6a3f', tex: 'wood_fine', texScale: 0.8, roughness: 0.6 }),

  slats_freijo: F({ label: 'Ripado Freijó', family: 'slats', color: '#a3744c', tex: 'wood_slats', texScale: 1.2, roughness: 0.6 }),
  slats_walnut: F({ label: 'Ripado Nogueira', family: 'slats', color: '#6e4b33', tex: 'wood_slats', texScale: 1.2, roughness: 0.55 }),
  slats_oak: F({ label: 'Ripado Carvalho', family: 'slats', color: '#b69068', tex: 'wood_slats', texScale: 1.2, roughness: 0.6 }),
  slats_white: F({ label: 'Forro Branco', family: 'slats', color: '#ece8e1', tex: 'plaster', texScale: 2, roughness: 0.9 }),

  deck_cumaru: F({ label: 'Deck Cumaru', family: 'wood', color: '#8a6347', tex: 'deck', texScale: 3.2, roughness: 0.7 }),
  deck_ipe: F({ label: 'Deck Ipê', family: 'wood', color: '#6a4935', tex: 'deck', texScale: 3.2, roughness: 0.7 }),
  deck_light: F({ label: 'Deck Grápia Clara', family: 'wood', color: '#b08b65', tex: 'deck', texScale: 3.2, roughness: 0.72 }),
  deck_porcelain: F({ label: 'Porcelanato Atérmico', family: 'floor', color: '#d9d2c5', tex: 'porcelain_grid', texScale: 0.9, roughness: 0.75 }),

  // ── Lacquers ───────────────────────────────────────────────────────────
  lac_greige: F({ label: 'Laca Greige', family: 'lacquer', color: '#bfb4a5', roughness: 0.42, clearcoat: 0.25 }),
  lac_fendi: F({ label: 'Laca Fendi', family: 'lacquer', color: '#a59b8e', roughness: 0.42, clearcoat: 0.25 }),
  lac_offwhite: F({ label: 'Laca Off-white', family: 'lacquer', color: '#e6e0d5', roughness: 0.42, clearcoat: 0.25 }),
  lac_sand: F({ label: 'Laca Areia', family: 'lacquer', color: '#d5c8b4', roughness: 0.42, clearcoat: 0.25 }),
  lac_taupe: F({ label: 'Laca Taupe', family: 'lacquer', color: '#8c8277', roughness: 0.45, clearcoat: 0.2 }),
  lac_graphite: F({ label: 'Laca Grafite', family: 'lacquer', color: '#4a4643', roughness: 0.45, clearcoat: 0.2 }),
  lac_olive: F({ label: 'Laca Oliva', family: 'lacquer', color: '#6f7058', roughness: 0.45, clearcoat: 0.2 }),
  lac_petrol: F({ label: 'Laca Azul Petróleo', family: 'lacquer', color: '#3f5258', roughness: 0.45, clearcoat: 0.2 }),
  lac_black: F({ label: 'Laca Preta Fosca', family: 'lacquer', color: '#262423', roughness: 0.55, clearcoat: 0.1 }),
  lac_terracotta: F({ label: 'Laca Terracota', family: 'lacquer', color: '#9b5e44', roughness: 0.45, clearcoat: 0.2 }),
  door_fluted_graphite: F({ label: 'Ripado Grafite', family: 'lacquer', color: '#6b6560', tex: 'fluted', texScale: 0.6, roughness: 0.5, bump: 1 }),
  door_fluted_walnut: F({ label: 'Ripado Nogueira', family: 'wood', color: '#6e4b33', tex: 'wood_slats', texScale: 0.8, roughness: 0.5 }),
  door_fluted_freijo: F({ label: 'Ripado Freijó', family: 'wood', color: '#a6774f', tex: 'wood_slats', texScale: 0.8, roughness: 0.55 }),

  // ── Stones ─────────────────────────────────────────────────────────────
  stone_travertine: F({ label: 'Travertino Romano', family: 'stone', color: '#e8ddcc', tex: 'travertine', texScale: 1.6, roughness: 0.5 }),
  stone_travertine_pitted: F({ label: 'Travertino Bruto', family: 'stone', color: '#e3d6c2', tex: 'travertine_pitted', texScale: 1.2, roughness: 0.6, bump: 0.4 }),
  stone_terrazzo: F({ label: 'Terrazzo Bege', family: 'stone', color: '#ffffff', tex: 'terrazzo', texScale: 1.2, roughness: 0.45, swatch: '#dccfbe' }),
  stone_granite_black: F({ label: 'Granito Preto São Gabriel', family: 'stone', color: '#ffffff', tex: 'granite', texScale: 0.7, roughness: 0.16, clearcoat: 0.7, swatch: '#272625' }),
  stone_marble_white: F({ label: 'Mármore Branco', family: 'stone', color: '#efede9', tex: 'marble', texScale: 2.2, roughness: 0.22, clearcoat: 0.5 }),
  stone_marble_beige: F({ label: 'Marmorizado Bege', family: 'stone', color: '#e2d8ca', tex: 'marble_soft', texScale: 1.6, roughness: 0.28, clearcoat: 0.4 }),
  stone_gray: F({ label: 'Pedra Cinza', family: 'stone', color: '#a8a39c', tex: 'marble', texScale: 2.4, roughness: 0.4 }),
  stone_quartz_white: F({ label: 'Quartzo Branco', family: 'stone', color: '#ece7df', tex: 'concrete', texScale: 0.6, roughness: 0.25, clearcoat: 0.5 }),
  stone_quartz_beige: F({ label: 'Quartzo Bege', family: 'stone', color: '#ddd3c4', tex: 'concrete', texScale: 0.6, roughness: 0.25, clearcoat: 0.5 }),
  stone_pebble: F({ label: 'Seixo Branco', family: 'stone', color: '#ffffff', tex: 'pebble', texScale: 0.9, roughness: 0.7, bump: 1.2, swatch: '#ddd8ce' }),
  stone_rough_white: F({ label: 'Pedra Moledo Branca', family: 'stone', color: '#efebe3', tex: 'stone_rough', texScale: 1.0, roughness: 0.85, bump: 1 }),
  stone_slate: F({ label: 'Pedra Ardósia', family: 'stone', color: '#5f5c57', tex: 'stone_rough', texScale: 1.2, roughness: 0.75, bump: 0.6 }),
  stone_capsule: F({ label: 'Revestimento 3D Cápsula', family: 'stone', color: '#ffffff', tex: 'capsule_tile', texScale: 0.5, roughness: 0.6, bump: 1.2, swatch: '#c8c0b4' }),

  // ── Fabrics ────────────────────────────────────────────────────────────
  fab_offwhite: F({ label: 'Linho Off-white', family: 'fabric', color: '#e8e2d7', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_sand: F({ label: 'Linho Areia', family: 'fabric', color: '#cdbfa8', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_greige: F({ label: 'Linho Greige', family: 'fabric', color: '#a99f92', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_gray: F({ label: 'Linho Cinza', family: 'fabric', color: '#8e8a85', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_terracotta: F({ label: 'Linho Terracota', family: 'fabric', color: '#a35d3e', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_caramel: F({ label: 'Caramelo', family: 'fabric', color: '#a7743f', tex: 'linen', texScale: 0.3, roughness: 0.9, sheen: 0.5 }),
  fab_olive: F({ label: 'Verde Oliva', family: 'fabric', color: '#6f7151', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_navy: F({ label: 'Azul Marinho', family: 'fabric', color: '#2f3b4a', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_charcoal: F({ label: 'Grafite', family: 'fabric', color: '#3b3937', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.5 }),
  fab_brown: F({ label: 'Café', family: 'fabric', color: '#5d4b3f', tex: 'linen', texScale: 0.3, roughness: 0.95, sheen: 0.6 }),
  boucle_offwhite: F({ label: 'Bouclé Off-white', family: 'fabric', color: '#ebe5da', tex: 'boucle', texScale: 0.25, roughness: 1, sheen: 0.7, bump: 0.8 }),
  boucle_terracotta: F({ label: 'Bouclé Terracota', family: 'fabric', color: '#a85f40', tex: 'boucle', texScale: 0.25, roughness: 1, sheen: 0.7, bump: 0.8 }),
  boucle_black: F({ label: 'Bouclé Preto', family: 'fabric', color: '#2d2b2a', tex: 'boucle', texScale: 0.25, roughness: 1, sheen: 0.6, bump: 0.8 }),
  boucle_sand: F({ label: 'Bouclé Areia', family: 'fabric', color: '#cbbba3', tex: 'boucle', texScale: 0.25, roughness: 1, sheen: 0.7, bump: 0.8 }),
  curtain_linen: F({ label: 'Linho Natural', family: 'fabric', color: '#e3dccf', tex: 'linen', texScale: 0.35, roughness: 0.95, sheen: 0.4, opacity: 0.88 }),
  curtain_greige: F({ label: 'Linho Greige', family: 'fabric', color: '#b2a797', tex: 'linen', texScale: 0.35, roughness: 0.95, sheen: 0.4, opacity: 0.92 }),
  curtain_gray: F({ label: 'Linho Cinza', family: 'fabric', color: '#8e8983', tex: 'linen', texScale: 0.35, roughness: 0.95, sheen: 0.4, opacity: 0.94 }),
  curtain_sand: F({ label: 'Linho Areia', family: 'fabric', color: '#cdbfa8', tex: 'linen', texScale: 0.35, roughness: 0.95, sheen: 0.4, opacity: 0.9 }),
  leather_black: F({ label: 'Couro Preto', family: 'leather', color: '#242322', roughness: 0.5, clearcoat: 0.2 }),
  leather_cognac: F({ label: 'Couro Conhaque', family: 'leather', color: '#8a5530', roughness: 0.5, clearcoat: 0.2 }),
  shell_black: F({ label: 'Polipropileno Preto', family: 'lacquer', color: '#232221', roughness: 0.6 }),

  rope_olive: F({ label: 'Corda Náutica Oliva', family: 'rope', color: '#5d683b', tex: 'rope', texScale: 0.12, roughness: 0.95, bump: 0.6 }),
  rope_sand: F({ label: 'Corda Areia', family: 'rope', color: '#c8b48f', tex: 'rope', texScale: 0.12, roughness: 0.95, bump: 0.6 }),
  rope_graphite: F({ label: 'Corda Grafite', family: 'rope', color: '#45423e', tex: 'rope', texScale: 0.12, roughness: 0.95, bump: 0.6 }),
  rope_terracotta: F({ label: 'Corda Terracota', family: 'rope', color: '#9c5a3c', tex: 'rope', texScale: 0.12, roughness: 0.95, bump: 0.6 }),
  wicker: F({ label: 'Fibra Natural', family: 'rope', color: '#c19a64', tex: 'rope', texScale: 0.08, roughness: 0.9, bump: 0.8 }),

  // ── Rugs ───────────────────────────────────────────────────────────────
  rug_beige_knit: F({ label: 'Tapete Bege Tricô', family: 'rug', color: '#d2c6b4', tex: 'rug_knit', texScale: 1.0, roughness: 1, bump: 0.6 }),
  rug_gray_stripes: F({ label: 'Tapete Listrado Cinza', family: 'rug', color: '#bab5ad', tex: 'rug_stripes', texScale: 1.2, roughness: 1, bump: 0.5 }),
  rug_cowhide: F({ label: 'Couro de Vaca Malhado', family: 'rug', color: '#ffffff', tex: 'cowhide', texScale: 2.6, roughness: 0.85, swatch: '#7a4523' }),
  rug_sand: F({ label: 'Tapete Areia', family: 'rug', color: '#c2b29a', tex: 'rug_knit', texScale: 1.0, roughness: 1, bump: 0.6 }),
  rug_graphite: F({ label: 'Tapete Grafite', family: 'rug', color: '#5a5754', tex: 'rug_knit', texScale: 1.0, roughness: 1, bump: 0.6 }),
  rug_terracotta: F({ label: 'Tapete Terracota', family: 'rug', color: '#a8714f', tex: 'rug_knit', texScale: 1.0, roughness: 1, bump: 0.6 }),

  // ── Floors ─────────────────────────────────────────────────────────────
  floor_porcelain_beige: F({ label: 'Porcelanato Bege 120×120', family: 'floor', color: '#e3dacb', tex: 'porcelain_grid', texScale: 1.2, roughness: 0.22, clearcoat: 0.35 }),
  floor_porcelain_gray: F({ label: 'Porcelanato Cimentício Cinza', family: 'floor', color: '#c6c2bb', tex: 'porcelain_grid', texScale: 1.2, roughness: 0.4, clearcoat: 0.2 }),
  floor_porcelain_white: F({ label: 'Porcelanato Branco', family: 'floor', color: '#efece6', tex: 'porcelain_grid', texScale: 1.2, roughness: 0.18, clearcoat: 0.4 }),
  floor_travertine: F({ label: 'Travertino Levigado', family: 'floor', color: '#e6dac7', tex: 'travertine', texScale: 1.2, roughness: 0.35 }),
  floor_terrazzo: F({ label: 'Granilite Bege', family: 'floor', color: '#ffffff', tex: 'terrazzo', texScale: 1.6, roughness: 0.35, clearcoat: 0.3, swatch: '#dccfbe' }),
  floor_wood_oak: F({ label: 'Vinílico Carvalho', family: 'floor', color: '#a38262', tex: 'deck', texScale: 2.4, roughness: 0.5 }),
  floor_wood_walnut: F({ label: 'Vinílico Nogueira', family: 'floor', color: '#755640', tex: 'deck', texScale: 2.4, roughness: 0.5 }),
  floor_concrete: F({ label: 'Cimentício', family: 'floor', color: '#c9c5bd', tex: 'concrete', texScale: 3, roughness: 0.7 }),
  floor_marble_beige: F({ label: 'Porcelanato Marmorizado', family: 'floor', color: '#ddd3c5', tex: 'marble_soft', texScale: 1.2, roughness: 0.3, clearcoat: 0.3 }),
  floor_stone_gray: F({ label: 'Porcelanato Pedra Cinza', family: 'floor', color: '#b1aca5', tex: 'marble', texScale: 1.2, roughness: 0.4 }),

  // ── Metals ─────────────────────────────────────────────────────────────
  metal_brass: F({ label: 'Latão Escovado', family: 'metal', color: '#c7a265', roughness: 0.32, metalness: 1 }),
  metal_gold_rose: F({ label: 'Rosé Gold', family: 'metal', color: '#c99b86', roughness: 0.3, metalness: 1 }),
  metal_black: F({ label: 'Preto Fosco', family: 'metal', color: '#272727', roughness: 0.5, metalness: 0.6 }),
  metal_steel: F({ label: 'Inox Escovado', family: 'metal', color: '#bdbdbd', roughness: 0.3, metalness: 1 }),
  metal_graphite: F({ label: 'Grafite Metálico', family: 'metal', color: '#4c4a48', roughness: 0.4, metalness: 0.8 }),
  metal_chrome: F({ label: 'Cromado', family: 'metal', color: '#dcdcdc', roughness: 0.08, metalness: 1 }),
  frame_bronze: F({ label: 'Alumínio Bronze', family: 'metal', color: '#4f483f', roughness: 0.42, metalness: 0.65 }),
  frame_graphite: F({ label: 'Alumínio Grafite', family: 'metal', color: '#3b3b3b', roughness: 0.42, metalness: 0.65 }),
  frame_black: F({ label: 'Alumínio Preto', family: 'metal', color: '#1f1f1f', roughness: 0.45, metalness: 0.6 }),
  frame_champagne: F({ label: 'Alumínio Champagne', family: 'metal', color: '#a99a7e', roughness: 0.38, metalness: 0.7 }),
  frame_white: F({ label: 'Alumínio Branco', family: 'metal', color: '#e8e6e1', roughness: 0.45, metalness: 0.3 }),

  // ── Glass / mirrors / ceramics ─────────────────────────────────────────
  glass_clear: F({ label: 'Vidro Incolor', family: 'glass', color: '#d7e3e4', roughness: 0.04, opacity: 0.16, envMapIntensity: 1.4 }),
  glass_fluted: F({ label: 'Vidro Canelado', family: 'glass', color: '#e2e7e5', tex: 'fluted', texScale: 0.25, roughness: 0.18, opacity: 0.5 }),
  glass_frosted: F({ label: 'Vidro Jateado', family: 'glass', color: '#eef0ef', roughness: 0.6, opacity: 0.7 }),
  glass_amber: F({ label: 'Vidro Âmbar', family: 'glass', color: '#d29a52', roughness: 0.05, opacity: 0.42, emissive: '#ffb45c', emissiveIntensity: 0 }),
  glass_smoke: F({ label: 'Vidro Fumê', family: 'glass', color: '#4a4c4c', roughness: 0.05, opacity: 0.55 }),
  glass_spandrel: F({ label: 'Vidro (fundo opaco)', family: 'glass', color: '#3e4142', roughness: 0.08, metalness: 0.3 }),
  mirror: F({ label: 'Espelho', family: 'glass', color: '#d6dadb', roughness: 0.02, metalness: 1 }),
  ceramic_white: F({ label: 'Louça Branca', family: 'ceramic', color: '#f3f2ef', roughness: 0.12, clearcoat: 0.8 }),
  screen_black: F({ label: 'Tela', family: 'misc', color: '#0d0d0e', roughness: 0.12, metalness: 0.2 }),
  appliance_white: F({ label: 'Eletrodoméstico Branco', family: 'misc', color: '#ecebe8', roughness: 0.3, clearcoat: 0.5 }),
  rubber_black: F({ label: 'Borracha', family: 'misc', color: '#1b1b1b', roughness: 0.9 }),
  paper_white: F({ label: 'Papel', family: 'misc', color: '#f2efe8', roughness: 0.9 }),
  red_accent: F({ label: 'Vermelho', family: 'misc', color: '#8f1d1d', roughness: 0.4, clearcoat: 0.6 }),
  book_mix: F({ label: 'Livros', family: 'misc', color: '#b7aa97', roughness: 0.8 }),
  ceramic_vase: F({ label: 'Cerâmica', family: 'ceramic', color: '#7b6a58', roughness: 0.55 }),
  ceramic_green: F({ label: 'Cerâmica Verde', family: 'ceramic', color: '#3e4a3a', roughness: 0.35, clearcoat: 0.5 }),
  plastic_gray: F({ label: 'Plástico Cinza', family: 'misc', color: '#7d7f80', roughness: 0.5 }),

  // ── Exterior grounds ───────────────────────────────────────────────────
  grass: F({ label: 'Grama Esmeralda', family: 'ground', color: '#c6ccb2', tex: 'grass', texScale: 2.2, roughness: 1, swatch: '#5d7a3e' }),
  sand: F({ label: 'Areia', family: 'ground', color: '#ffffff', tex: 'sand', texScale: 2.4, roughness: 1, swatch: '#e6dcc6' }),
  gravel: F({ label: 'Brita Branca', family: 'ground', color: '#ffffff', tex: 'gravel', texScale: 1.4, roughness: 1, bump: 0.6 }),
  pavers: F({ label: 'Piso Intertravado', family: 'ground', color: '#b8b5ae', tex: 'pavers', texScale: 1.6, roughness: 0.95 }),
  asphalt: F({ label: 'Asfalto', family: 'ground', color: '#ffffff', tex: 'asphalt', texScale: 4, roughness: 0.95 }),
  concrete_drive: F({ label: 'Concreto Desempenado', family: 'ground', color: '#d1ccc4', tex: 'concrete', texScale: 3.5, roughness: 0.85 }),
  concrete_slab: F({ label: 'Placa de Concreto', family: 'ground', color: '#cfcac1', tex: 'concrete', texScale: 1.5, roughness: 0.85 }),
  pool_tile: F({ label: 'Pastilha Piscina', family: 'ceramic', color: '#ffffff', tex: 'pool_tile', texScale: 1.0, roughness: 0.25, swatch: '#bfe3e6' }),
  coping_stone: F({ label: 'Borda Pedra Natural', family: 'stone', color: '#e3dccd', tex: 'travertine', texScale: 1.0, roughness: 0.7 }),
  rock: F({ label: 'Pedra Natural', family: 'stone', color: '#958e84', tex: 'stone_rough', texScale: 1.2, roughness: 0.9, bump: 0.8 }),
  roof_membrane: F({ label: 'Cobertura (manta/brita)', family: 'ground', color: '#aaa7a0', tex: 'gravel', texScale: 1.6, roughness: 1 }),
  soil: F({ label: 'Terra', family: 'ground', color: '#5b4a3b', tex: 'concrete', texScale: 1, roughness: 1 }),

  // ── Plants ─────────────────────────────────────────────────────────────
  leaf_green: F({ label: 'Folhagem', family: 'plant', color: '#4f6d36', tex: 'leaf', texScale: 1, roughness: 0.75 }),
  leaf_dark: F({ label: 'Folhagem Escura', family: 'plant', color: '#2f4b2b', tex: 'leaf', texScale: 1, roughness: 0.75 }),
  leaf_light: F({ label: 'Folhagem Clara', family: 'plant', color: '#6e8d42', tex: 'leaf', texScale: 1, roughness: 0.75 }),
  leaf_olive: F({ label: 'Copa Oliveira', family: 'plant', color: '#6e8058', tex: 'stone_rough', texScale: 0.45, roughness: 0.9, bump: 0.8 }),
  trunk: F({ label: 'Tronco', family: 'plant', color: '#7c6a57', tex: 'stone_rough', texScale: 0.6, roughness: 0.95 }),
  palm_trunk: F({ label: 'Estipe Palmeira', family: 'plant', color: '#a49a8c', tex: 'stone_rough', texScale: 0.5, roughness: 0.95 }),

  // ── Emissive ───────────────────────────────────────────────────────────
  led_warm: F({ label: 'Fita LED 2700K', family: 'emissive', color: '#fff3e0', roughness: 1, emissive: '#ffc982', emissiveIntensity: 3 }),
  lamp_shade: F({ label: 'Cúpula de Tecido', family: 'emissive', color: '#f3ece0', roughness: 0.9, emissive: '#ffd9a6', emissiveIntensity: 0 }),
  bulb_warm: F({ label: 'Lâmpada Filamento', family: 'emissive', color: '#fff1d6', roughness: 0.4, emissive: '#ffbe6e', emissiveIntensity: 6 }),
} satisfies Record<string, FinishDef>

export type FinishId = keyof typeof FINISHES

// ── Option families shown in the configurator ─────────────────────────────
const fam = (...ids: FinishId[]) => ids

export const OPTIONS = {
  paint_int: fam('paint_offwhite', 'paint_white', 'paint_cream', 'paint_sand', 'paint_greige', 'paint_taupe_int', 'paint_sage', 'paint_terracotta', 'paint_petrol', 'paint_graphite', 'paint_concrete'),
  wallcovering: fam('wall_linen_beige', 'wallpaper_beige', 'wall_linen_gray', 'wall_marble_geo', 'paint_offwhite', 'paint_cream', 'paint_greige', 'paint_taupe_int', 'paint_sage', 'stone_travertine'),
  paint_ext: fam('paint_taupe', 'paint_taupe_dark', 'paint_greige', 'paint_cream', 'paint_offwhite', 'paint_graphite', 'paint_sand', 'paint_concrete'),
  facade_stone: fam('stone_pebble', 'stone_rough_white', 'stone_travertine', 'stone_slate', 'stone_terrazzo'),
  wood: fam('wood_walnut', 'wood_freijo', 'wood_oak', 'wood_oak_light', 'wood_cumaru', 'wood_ebony'),
  slats: fam('slats_freijo', 'slats_walnut', 'slats_oak', 'slats_white'),
  deck: fam('deck_cumaru', 'deck_ipe', 'deck_light', 'deck_porcelain'),
  lacquer: fam('lac_greige', 'lac_fendi', 'lac_offwhite', 'lac_sand', 'lac_taupe', 'lac_graphite', 'lac_olive', 'lac_petrol', 'lac_terracotta', 'lac_black'),
  cabinet: fam('lac_greige', 'lac_fendi', 'lac_offwhite', 'lac_sand', 'lac_taupe', 'lac_graphite', 'lac_olive', 'lac_petrol', 'wood_walnut', 'wood_freijo', 'wood_oak_light'),
  counter: fam('stone_granite_black', 'stone_quartz_white', 'stone_quartz_beige', 'stone_travertine', 'stone_travertine_pitted', 'stone_marble_white', 'stone_terrazzo', 'stone_gray'),
  stone_wall: fam('stone_travertine', 'stone_terrazzo', 'stone_marble_beige', 'stone_marble_white', 'stone_gray', 'stone_pebble', 'stone_capsule', 'stone_rough_white'),
  fabric: fam('fab_offwhite', 'fab_sand', 'fab_greige', 'fab_gray', 'fab_terracotta', 'fab_caramel', 'fab_olive', 'fab_navy', 'fab_charcoal', 'fab_brown', 'boucle_offwhite', 'boucle_sand', 'boucle_terracotta', 'boucle_black', 'leather_cognac', 'leather_black'),
  curtain: fam('curtain_linen', 'curtain_sand', 'curtain_greige', 'curtain_gray'),
  rope: fam('rope_olive', 'rope_sand', 'rope_graphite', 'rope_terracotta', 'wicker'),
  rug: fam('rug_beige_knit', 'rug_gray_stripes', 'rug_sand', 'rug_graphite', 'rug_terracotta', 'rug_cowhide'),
  floor: fam('floor_porcelain_beige', 'floor_porcelain_gray', 'floor_porcelain_white', 'floor_travertine', 'floor_terrazzo', 'floor_marble_beige', 'floor_wood_oak', 'floor_wood_walnut', 'floor_stone_gray'),
  metal: fam('metal_brass', 'metal_gold_rose', 'metal_steel', 'metal_black', 'metal_graphite'),
  frames: fam('frame_bronze', 'frame_graphite', 'frame_black', 'frame_champagne', 'frame_white'),
  door: fam('door_fluted_graphite', 'door_fluted_walnut', 'door_fluted_freijo', 'lac_graphite', 'lac_taupe', 'wood_walnut'),
  chair_shell: fam('shell_black', 'lac_offwhite', 'lac_taupe', 'lac_olive', 'leather_cognac'),
} satisfies Record<string, FinishId[]>

export type OptionFamily = keyof typeof OPTIONS

export interface SlotDef {
  label: string
  finish: FinishId
  options?: OptionFamily
  /** allow a free colour picker (tints the selected finish) */
  custom?: boolean
}

const S = (label: string, finish: FinishId, options?: OptionFamily, custom = false): SlotDef => ({ label, finish, options, custom })

/**
 * Every slot used by geometry. Non-configurable slots have no `options`.
 * The default `finish` of every slot is, by definition, the ORIGINAL PROJECT.
 */
export const SLOTS = {
  // ── Exterior ────────────────────────────────────────────────────────────
  external_facade_primary: S('Fachada — pintura cinza fendi', 'paint_taupe', 'paint_ext', true),
  external_facade_secondary: S('Fachada — paredes claras', 'paint_cream', 'paint_ext', true),
  external_stone: S('Fachada — revestimento em pedra', 'stone_pebble', 'facade_stone'),
  external_soffit: S('Forros externos de madeira', 'slats_freijo', 'slats'),
  external_deck: S('Deck do pátio', 'deck_cumaru', 'deck'),
  external_frames: S('Esquadrias (caixilhos)', 'frame_bronze', 'frames'),
  front_door: S('Porta pivotante de entrada', 'door_fluted_graphite', 'door'),
  water_tank: S('Volume da caixa d’água', 'paint_offwhite', 'paint_ext', true),
  boundary_wall: S('Muros de divisa', 'paint_taupe', 'paint_ext', true),
  pergola_frame: S('Estrutura das pérgolas', 'paint_offwhite', 'paint_ext', true),
  ext_furniture_wood: S('Mobiliário externo — madeira', 'wood_teak', 'wood'),
  ext_cushion: S('Mobiliário externo — almofadas', 'fab_offwhite', 'fabric', true),
  ext_umbrella: S('Ombrelone', 'fab_offwhite', 'fabric', true),
  hall_chairs: S('Poltronas do hall', 'wicker', 'rope'),

  // ── Shared interior ─────────────────────────────────────────────────────
  floor_social: S('Piso — áreas sociais', 'floor_porcelain_beige', 'floor'),
  floor_intimate: S('Piso — área íntima', 'floor_porcelain_beige', 'floor'),
  floor_service: S('Piso — lavanderia e serviço', 'floor_terrazzo', 'floor'),
  floor_garage: S('Piso — garagem e hall', 'floor_porcelain_gray', 'floor'),
  ceiling: S('Forro de gesso', 'paint_white'),
  ceiling_dark: S('Faixa de forro grafite', 'paint_graphite', 'paint_int', true),
  interior_doors: S('Portas internas', 'lac_taupe', 'lacquer', true),
  door_frames: S('Batentes', 'paint_offwhite'),
  wall_circulation: S('Paredes — circulações', 'paint_offwhite', 'paint_int', true),

  // ── Sala de TV ──────────────────────────────────────────────────────────
  wall_tv_room: S('Paredes — Sala de TV', 'paint_offwhite', 'paint_int', true),
  tv_feature_wall: S('Parede texturizada (linho) — Sala de TV', 'wall_linen_beige', 'wallcovering', true),
  tv_wood_blocks: S('Blocos de madeira da parede — Sala de TV', 'wood_walnut', 'wood'),
  tv_panel: S('Painel da TV', 'paint_graphite', 'paint_int', true),
  tv_stone_frame: S('Moldura de pedra do painel', 'stone_travertine', 'stone_wall'),
  tv_rack_wood: S('Rack — gavetas', 'wood_walnut', 'wood'),
  tv_rack_top: S('Rack — tampo', 'stone_travertine_pitted', 'counter'),
  sofa_tv_fabric: S('Sofá — Sala de TV', 'fab_offwhite', 'fabric', true),
  armchair_tv_fabric: S('Poltronas — Sala de TV', 'boucle_terracotta', 'fabric', true),
  tv_side_tables: S('Mesas laterais — Sala de TV', 'wood_walnut', 'wood'),
  tv_rug: S('Tapete — Sala de TV', 'rug_beige_knit', 'rug', true),
  tv_curtain: S('Cortinas — Sala de TV', 'curtain_linen', 'curtain', true),

  // ── Cozinha ─────────────────────────────────────────────────────────────
  cabinet_kitchen: S('Armários — Cozinha', 'lac_greige', 'cabinet', true),
  wood_kitchen: S('Painéis e ilha em madeira — Cozinha', 'wood_walnut', 'wood'),
  counter_kitchen: S('Bancadas — Cozinha', 'stone_granite_black', 'counter'),
  backsplash_kitchen: S('Revestimento / coifa — Cozinha', 'stone_terrazzo', 'stone_wall'),
  chair_kitchen_fabric: S('Cadeiras — Cozinha', 'boucle_offwhite', 'fabric', true),
  table_kitchen: S('Mesa — Cozinha', 'lac_greige', 'lacquer', true),
  wall_kitchen: S('Paredes — Cozinha', 'paint_cream', 'paint_int', true),
  kitchen_curtain: S('Cortinas — Cozinha', 'curtain_linen', 'curtain', true),

  // ── Gourmet ─────────────────────────────────────────────────────────────
  wood_gourmet: S('Marcenaria em madeira — Gourmet', 'wood_walnut', 'wood'),
  cabinet_gourmet: S('Armários superiores — Gourmet', 'lac_offwhite', 'lacquer', true),
  stone_gourmet: S('Bancadas — Gourmet', 'stone_granite_black', 'counter'),
  terrazzo_gourmet: S('Revestimento / churrasqueira — Gourmet', 'stone_terrazzo', 'stone_wall'),
  gourmet_table_wood: S('Mesa de jantar — Gourmet', 'wood_oak', 'wood'),
  gourmet_chairs: S('Cadeiras e banquetas — Gourmet', 'rope_olive', 'rope'),
  gourmet_ceiling: S('Forro de madeira — Gourmet', 'slats_freijo', 'slats'),
  wall_gourmet: S('Paredes — Gourmet', 'paint_offwhite', 'paint_int', true),
  gourmet_curtain: S('Cortinas — Gourmet', 'curtain_linen', 'curtain', true),

  // ── Lavanderia ──────────────────────────────────────────────────────────
  laundry_base: S('Armários inferiores — Lavanderia', 'wood_walnut', 'cabinet', true),
  laundry_upper: S('Armários superiores — Lavanderia', 'lac_sand', 'cabinet', true),
  laundry_panel: S('Painel de madeira — Lavanderia', 'wood_walnut', 'wood'),
  laundry_counter: S('Bancadas — Lavanderia', 'stone_granite_black', 'counter'),
  laundry_backsplash: S('Revestimento — Lavanderia', 'stone_terrazzo', 'stone_wall'),
  wall_laundry: S('Paredes — Lavanderia', 'paint_offwhite', 'paint_int', true),

  // ── Sala de jogos ───────────────────────────────────────────────────────
  game_cabinetry: S('Marcenaria — Sala de Jogos', 'lac_taupe', 'cabinet', true),
  game_panel: S('Painel de pedra — Sala de Jogos', 'stone_travertine', 'stone_wall'),
  game_walls: S('Paredes — Sala de Jogos', 'paint_taupe_int', 'paint_int', true),
  game_sofa: S('Sofá — Sala de Jogos', 'boucle_black', 'fabric', true),
  game_chairs: S('Cadeiras — Sala de Jogos', 'shell_black', 'chair_shell'),
  game_table: S('Mesa redonda — Sala de Jogos', 'lac_black', 'lacquer', true),
  game_rug: S('Tapete — Sala de Jogos', 'rug_cowhide', 'rug'),
  game_curtain: S('Cortinas — Sala de Jogos', 'curtain_linen', 'curtain', true),
  floor_game: S('Piso — Sala de Jogos / Depósito', 'floor_wood_oak', 'floor'),

  // ── Banho social ────────────────────────────────────────────────────────
  socialbath_stone: S('Revestimento — Banho Social', 'stone_marble_beige', 'stone_wall'),
  socialbath_panel: S('Painel ripado — Banho Social', 'lac_taupe', 'lacquer', true),
  socialbath_vanity: S('Gabinete — Banho Social', 'lac_taupe', 'cabinet', true),
  socialbath_counter: S('Bancada — Banho Social', 'stone_quartz_beige', 'counter'),

  // ── Banho externo ───────────────────────────────────────────────────────
  extbath_stone: S('Revestimento travertino — Banho Externo', 'stone_travertine', 'stone_wall'),
  extbath_pebble: S('Parede de seixos — Banho Externo', 'stone_pebble', 'stone_wall'),

  // ── Despensa / depósito ─────────────────────────────────────────────────
  pantry_shelves: S('Estantes — Despensa / Depósito', 'lac_greige', 'lacquer', true),

  // ── Suíte master ────────────────────────────────────────────────────────
  master_wall: S('Paredes — Suíte Master', 'wallpaper_beige', 'wallcovering', true),
  master_headboard_panel: S('Painel estofado da cabeceira', 'wall_linen_gray', 'wallcovering', true),
  master_headboard_frame: S('Moldura do painel da cabeceira', 'lac_offwhite', 'lacquer', true),
  master_wood: S('Painel de madeira — Suíte Master', 'wood_walnut', 'wood'),
  master_bed: S('Cama estofada — Suíte Master', 'fab_greige', 'fabric', true),
  master_bedding: S('Roupa de cama — Suíte Master', 'fab_brown', 'fabric', true),
  master_nightstand: S('Criados-mudos — Suíte Master', 'lac_greige', 'lacquer', true),
  master_rack: S('Rack — Suíte Master', 'lac_greige', 'cabinet', true),
  master_armchair: S('Poltrona — Suíte Master', 'fab_caramel', 'fabric', true),
  master_rug: S('Tapete — Suíte Master', 'rug_gray_stripes', 'rug', true),
  master_curtain: S('Cortinas — Suíte Master', 'curtain_greige', 'curtain', true),
  master_metal: S('Metais dourados — Suíte Master', 'metal_brass', 'metal'),

  // ── Closet ──────────────────────────────────────────────────────────────
  closet_master: S('Armários — Closet', 'lac_greige', 'cabinet', true),
  closet_wood: S('Nicho e penteadeira em madeira — Closet', 'wood_walnut', 'wood'),
  closet_counter: S('Tampo da penteadeira — Closet', 'stone_quartz_white', 'counter'),
  closet_wall: S('Revestimento de parede — Closet', 'wall_marble_geo', 'wallcovering', true),
  closet_chair: S('Cadeira da penteadeira', 'boucle_offwhite', 'fabric', true),
  closet_handles: S('Puxadores — Closet', 'metal_brass', 'metal'),

  // ── Banho master ────────────────────────────────────────────────────────
  masterbath_stone: S('Revestimento pedra cinza — Banho Master', 'stone_gray', 'stone_wall'),
  masterbath_tile: S('Revestimento 3D — Banho Master', 'stone_capsule', 'stone_wall'),
  masterbath_metal: S('Metais — Banho Master', 'metal_brass', 'metal'),

  // ── Quartos 01 / 02 (não detalhados no projeto de interiores) ───────────
  bedroom_walls: S('Paredes — Quartos 01 e 02', 'paint_offwhite', 'paint_int', true),
  bedroom_bedding: S('Roupa de cama — Quartos 01 e 02', 'fab_offwhite', 'fabric', true),
  bedroom_joinery: S('Marcenaria — Quartos 01 e 02', 'lac_offwhite', 'cabinet', true),

  // ── Fixed / non configurable ────────────────────────────────────────────
  garage_walls: S('Paredes — garagem', 'paint_taupe'),
  glass: S('Vidro', 'glass_clear'),
  glass_fluted: S('Vidro canelado', 'glass_fluted'),
  glass_amber: S('Vidro âmbar dos pendentes', 'glass_amber'),
  spandrel: S('Vidro fundo opaco', 'glass_spandrel'),
  mirror: S('Espelho', 'mirror'),
  ceramic: S('Louças', 'ceramic_white'),
  steel: S('Inox', 'metal_steel'),
  metal_dark_bowl: S('Cuba', 'metal_graphite'),
  chrome: S('Cromado', 'metal_chrome'),
  black_metal: S('Metal preto', 'metal_black'),
  brass: S('Latão', 'metal_brass'),
  screen: S('Telas', 'screen_black'),
  appliance: S('Eletrodomésticos', 'appliance_white'),
  rubber: S('Borracha', 'rubber_black'),
  paper: S('Papel', 'paper_white'),
  red: S('Acento vermelho', 'red_accent'),
  books: S('Livros', 'book_mix'),
  vase: S('Vasos cerâmicos', 'ceramic_vase'),
  vase_green: S('Vasos cerâmicos verdes', 'ceramic_green'),
  plastic: S('Plástico', 'plastic_gray'),
  grass: S('Grama', 'grass'),
  sand: S('Areia', 'sand'),
  gravel: S('Brita', 'gravel'),
  pavers: S('Calçada', 'pavers'),
  asphalt: S('Asfalto', 'asphalt'),
  concrete_drive: S('Concreto', 'concrete_drive'),
  concrete_slab: S('Placas de concreto', 'concrete_slab'),
  pool_tile: S('Pastilha', 'pool_tile'),
  coping: S('Borda da piscina', 'coping_stone'),
  rock: S('Pedras', 'rock'),
  soil: S('Terra', 'soil'),
  roof: S('Cobertura', 'roof_membrane'),
  leaf: S('Folhas', 'leaf_green'),
  leaf_dark: S('Folhas escuras', 'leaf_dark'),
  leaf_light: S('Folhas claras', 'leaf_light'),
  leaf_olive: S('Copa', 'leaf_olive'),
  trunk: S('Tronco', 'trunk'),
  palm_trunk: S('Estipe', 'palm_trunk'),
  led: S('LED', 'led_warm'),
  lamp_shade: S('Cúpula', 'lamp_shade'),
  bulb: S('Lâmpada', 'bulb_warm'),
  wicker_fixed: S('Fibra natural', 'wicker'),
  leather: S('Couro preto', 'leather_black'),
  caramel_fixed: S('Couro caramelo', 'leather_cognac'),
  rug_fixed_sand: S('Tapete areia', 'rug_sand'),
  fab_sand_fixed: S('Tecido areia', 'fab_sand'),
  frosted: S('Vidro jateado', 'glass_frosted'),
  smoke_glass: S('Vidro fumê', 'glass_smoke'),
  linen_white: S('Tecido branco', 'fab_offwhite'),
  linen_dark: S('Tecido escuro', 'fab_charcoal'),
  teak: S('Teca', 'wood_teak'),
  walnut_fixed: S('Nogueira', 'wood_walnut'),
  graphite_fixed: S('Grafite', 'lac_graphite'),
  offwhite_fixed: S('Off-white', 'lac_offwhite'),
} satisfies Record<string, SlotDef>

export type SlotId = keyof typeof SLOTS

export const slotDef = (id: SlotId): SlotDef => SLOTS[id]
export const finishDef = (id: FinishId): FinishDef => FINISHES[id]
