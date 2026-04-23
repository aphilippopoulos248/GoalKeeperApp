/**
 * DiceBear 7.x Avataaars — options match
 * https://api.dicebear.com/7.x/avataaars/schema.json
 */

const DICEBEAR_API = 'https://api.dicebear.com/7.x/avataaars/png';
export const DEFAULT_PNG_SIZE = 256;

export const AVATAAARS_TOP = [
  'hat',
  'hijab',
  'turban',
  'winterHat1',
  'winterHat02',
  'winterHat03',
  'winterHat04',
  'bob',
  'bun',
  'curly',
  'curvy',
  'dreads',
  'frida',
  'fro',
  'froBand',
  'longButNotTooLong',
  'miaWallace',
  'shavedSides',
  'straight02',
  'straight01',
  'straightAndStrand',
  'dreads01',
  'dreads02',
  'frizzle',
  'shaggy',
  'shaggyMullet',
  'shortCurly',
  'shortFlat',
  'shortRound',
  'shortWaved',
  'sides',
  'theCaesar',
  'theCaesarAndSidePart',
  'bigHair',
] as const;

export const AVATAAARS_EYES = [
  'closed',
  'cry',
  'default',
  'eyeRoll',
  'happy',
  'hearts',
  'side',
  'squint',
  'surprised',
  'winkWacky',
  'wink',
  'xDizzy',
] as const;

export const AVATAAARS_EYEBROWS = [
  'angryNatural',
  'defaultNatural',
  'flatNatural',
  'frownNatural',
  'raisedExcitedNatural',
  'sadConcernedNatural',
  'unibrowNatural',
  'upDownNatural',
  'angry',
  'default',
  'raisedExcited',
  'sadConcerned',
  'upDown',
] as const;

export const AVATAAARS_MOUTH = [
  'concerned',
  'default',
  'disbelief',
  'eating',
  'grimace',
  'sad',
  'screamOpen',
  'serious',
  'smile',
  'tongue',
  'twinkle',
  'vomit',
] as const;

export const AVATAAARS_ACCESSORIES = [
  'kurt',
  'prescription01',
  'prescription02',
  'round',
  'sunglasses',
  'wayfarers',
  'eyepatch',
] as const;

export const AVATAAARS_CLOTHING = [
  'blazerAndShirt',
  'blazerAndSweater',
  'collarAndSweater',
  'graphicShirt',
  'hoodie',
  'overall',
  'shirtCrewNeck',
  'shirtScoopNeck',
  'shirtVNeck',
] as const;

export const AVATAAARS_CLOTHING_GRAPHIC = [
  'bat',
  'bear',
  'cumbia',
  'deer',
  'diamond',
  'hola',
  'pizza',
  'resist',
  'skull',
  'skullOutline',
] as const;

export const AVATAAARS_FACIAL_HAIR = [
  'beardLight',
  'beardMajestic',
  'beardMedium',
  'moustacheFancy',
  'moustacheMagnum',
] as const;

export const AVATAAARS_SKIN_COLOR = [
  '614335',
  'd08b5b',
  'ae5d29',
  'edb98a',
  'ffdbb4',
  'fd9841',
  'f8d25c',
] as const;

export const AVATAAARS_HAIR_COLOR = [
  'a55728',
  '2c1b18',
  'b58143',
  'd6b370',
  '724133',
  '4a312c',
  'f59797',
  'ecdcbf',
  'c93305',
  'e8e1e1',
] as const;

export const AVATAAARS_CLOTHES_COLOR = [
  '262e33',
  '65c9ff',
  '5199e4',
  '25557c',
  'e6e6e6',
  '929598',
  '3c4f5c',
  'b1e2ff',
  'a7ffc4',
  'ffafb9',
  'ffffb1',
  'ff488e',
  'ff5c5c',
  'ffffff',
] as const;

export const AVATAAARS_FACIAL_HAIR_COLOR = [
  'a55728',
  '2c1b18',
  'b58143',
  'd6b370',
  '724133',
  '4a312c',
  'f59797',
  'ecdcbf',
  'c93305',
  'e8e1e1',
] as const;

export const AVATAAARS_ACCESSORIES_COLOR = [
  '262e33',
  '65c9ff',
  '5199e4',
  '25557c',
  'e6e6e6',
  '929598',
  '3c4f5c',
  'b1e2ff',
  'a7ffc4',
  'ffdeb5',
  'ffafb9',
  'ffffb1',
  'ff488e',
  'ff5c5c',
  'ffffff',
] as const;

export const AVATAAARS_HAT_COLOR = [
  '262e33',
  '65c9ff',
  '5199e4',
  '25557c',
  'e6e6e6',
  '929598',
  '3c4f5c',
  'b1e2ff',
  'a7ffc4',
  'ffdeb5',
  'ffafb9',
  'ffffb1',
  'ff488e',
  'ff5c5c',
  'ffffff',
] as const;

export const AVATAAARS_BACKGROUND_TYPE = ['solid', 'gradientLinear'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export type AvataaarsCustomization = {
  flip: boolean;
  backgroundType: (typeof AVATAAARS_BACKGROUND_TYPE)[number];
  backgroundColor: string;
  top: (typeof AVATAAARS_TOP)[number];
  topProbability: number;
  eyes: (typeof AVATAAARS_EYES)[number];
  eyebrows: (typeof AVATAAARS_EYEBROWS)[number];
  mouth: (typeof AVATAAARS_MOUTH)[number];
  skinColor: (typeof AVATAAARS_SKIN_COLOR)[number];
  hairColor: (typeof AVATAAARS_HAIR_COLOR)[number];
  clothesColor: (typeof AVATAAARS_CLOTHES_COLOR)[number];
  hatColor: (typeof AVATAAARS_HAT_COLOR)[number];
  clothing: (typeof AVATAAARS_CLOTHING)[number];
  clothingGraphic: (typeof AVATAAARS_CLOTHING_GRAPHIC)[number];
  accessories: (typeof AVATAAARS_ACCESSORIES)[number];
  accessoriesColor: (typeof AVATAAARS_ACCESSORIES_COLOR)[number];
  accessoriesProbability: number;
  facialHair: (typeof AVATAAARS_FACIAL_HAIR)[number];
  facialHairColor: (typeof AVATAAARS_FACIAL_HAIR_COLOR)[number];
  facialHairProbability: number;
  style: 'circle' | 'default';
};

export function defaultAvataaarsCustomization(): AvataaarsCustomization {
  return {
    flip: false,
    backgroundType: 'solid',
    backgroundColor: '65c9ff',
    top: 'shortRound',
    topProbability: 100,
    eyes: 'default',
    eyebrows: 'default',
    mouth: 'smile',
    skinColor: 'edb98a',
    hairColor: '4a312c',
    clothesColor: '3c4f5c',
    hatColor: '262e33',
    clothing: 'hoodie',
    clothingGraphic: 'diamond',
    accessories: 'round',
    accessoriesColor: '262e33',
    accessoriesProbability: 0,
    facialHair: 'beardMedium',
    facialHairColor: '4a312c',
    facialHairProbability: 0,
    style: 'default',
  };
}

export function randomAvataaarsCustomization(): AvataaarsCustomization {
  return {
    flip: Math.random() > 0.5,
    backgroundType: pick([...AVATAAARS_BACKGROUND_TYPE]),
    backgroundColor: pick([...AVATAAARS_CLOTHES_COLOR]),
    top: pick([...AVATAAARS_TOP]),
    topProbability: Math.random() < 0.1 ? 0 : 100,
    eyes: pick([...AVATAAARS_EYES]),
    eyebrows: pick([...AVATAAARS_EYEBROWS]),
    mouth: pick([...AVATAAARS_MOUTH]),
    skinColor: pick([...AVATAAARS_SKIN_COLOR]),
    hairColor: pick([...AVATAAARS_HAIR_COLOR]),
    clothesColor: pick([...AVATAAARS_CLOTHES_COLOR]),
    hatColor: pick([...AVATAAARS_HAT_COLOR]),
    clothing: pick([...AVATAAARS_CLOTHING]),
    clothingGraphic: pick([...AVATAAARS_CLOTHING_GRAPHIC]),
    accessories: pick([...AVATAAARS_ACCESSORIES]),
    accessoriesColor: pick([...AVATAAARS_ACCESSORIES_COLOR]),
    accessoriesProbability: [0, 0, 25, 50, 100][Math.floor(Math.random() * 5)]!,
    facialHair: pick([...AVATAAARS_FACIAL_HAIR]),
    facialHairColor: pick([...AVATAAARS_FACIAL_HAIR_COLOR]),
    facialHairProbability: [0, 0, 30, 60, 100][Math.floor(Math.random() * 5)]!,
    style: Math.random() > 0.5 ? 'default' : 'circle',
  };
}

export function buildAvataaarsPngUrl(
  seed: string,
  size: number,
  c: AvataaarsCustomization,
): string {
  const u = new URL(DICEBEAR_API);
  u.searchParams.set('seed', seed);
  u.searchParams.set('size', String(size));
  u.searchParams.set('flip', c.flip ? 'true' : 'false');
  u.searchParams.set('backgroundType', c.backgroundType);
  u.searchParams.set('backgroundColor', c.backgroundColor);
  u.searchParams.set('top', c.top);
  u.searchParams.set('topProbability', String(c.topProbability));
  u.searchParams.set('eyes', c.eyes);
  u.searchParams.set('eyebrows', c.eyebrows);
  u.searchParams.set('mouth', c.mouth);
  u.searchParams.set('skinColor', c.skinColor);
  u.searchParams.set('hairColor', c.hairColor);
  u.searchParams.set('clothesColor', c.clothesColor);
  u.searchParams.set('hatColor', c.hatColor);
  u.searchParams.set('clothing', c.clothing);
  u.searchParams.set('clothingGraphic', c.clothingGraphic);
  u.searchParams.set('accessories', c.accessories);
  u.searchParams.set('accessoriesColor', c.accessoriesColor);
  u.searchParams.set('accessoriesProbability', String(c.accessoriesProbability));
  u.searchParams.set('facialHair', c.facialHair);
  u.searchParams.set('facialHairColor', c.facialHairColor);
  u.searchParams.set('facialHairProbability', String(c.facialHairProbability));
  u.searchParams.set('style', c.style);
  return u.toString();
}

export function randomAvatarSeed(): string {
  return `s${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
