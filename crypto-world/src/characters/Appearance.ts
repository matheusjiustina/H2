/** Data describing how a character looks. Every NPC and the player are built from one of these. */
export type HairStyle = 'short' | 'bob' | 'bun' | 'spiky' | 'long' | 'mohawk' | 'bald' | 'ponytail' | 'curly' | 'afro' | 'swoop' | 'pigtails';
export type TopStyle = 'tee' | 'hoodie' | 'jacket' | 'coat' | 'apron' | 'vest' | 'labcoat' | 'overalls' | 'sweater' | 'shirt';
export type HatStyle = 'cap' | 'beanie' | 'hardhat' | 'beret' | 'bucket' | 'tophat' | 'headband' | 'visor' | 'headphones' | 'flatcap' | 'none';
export type GlassesStyle = 'round' | 'square' | 'shades' | 'goggles' | 'none';
export type BagStyle = 'messenger' | 'backpack' | 'satchel' | 'none';
export type Accessory = 'scarf' | 'tie' | 'badge' | 'necklace' | 'toolbelt' | 'camera' | 'bowtie' | 'none';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  topStyle: TopStyle;
  topAccent?: string;
  bottom: string;
  shorts?: boolean;
  shoes: string;
  hat?: HatStyle;
  hatColor?: string;
  glasses?: GlassesStyle;
  glassesColor?: string;
  beard?: string;
  mustache?: string;
  bag?: BagStyle;
  bagColor?: string;
  accessory?: Accessory;
  accessoryColor?: string;
  /** Overall height multiplier (0.85–1.15). */
  height?: number;
  /** Body width multiplier (0.85–1.3). */
  build?: number;
  eye?: string;
  brows?: 'normal' | 'thick' | 'arched' | 'worried';
  blush?: boolean;
  freckles?: boolean;
}

export const SKIN_TONES = ['#f6d5bf', '#efc3a1', '#e0a982', '#c98b62', '#a86b47', '#7f4f33', '#5e3a26'];
export const HAIR_COLORS = ['#2b2321', '#4a3226', '#7a4d2c', '#b07a3e', '#d9b36a', '#e8e1d6', '#8f8b88', '#c4563f', '#4f6fa8', '#9d6fc9', '#e88fb0'];
