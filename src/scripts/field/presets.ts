/**
 * The lab build's starting points for tuning the murmuration (FieldLab.astro). Each is a set of
 * FlockParams over the defaults; "today" is the defaults, as production flies.
 */
import type { FlockParams } from './flock';

export const PRESETS: Record<string, { label: string; note: string; params: Partial<FlockParams> }> = {
  today: {
    label: 'Today',
    note: 'As the live site: long, overlapping gathers, a constant ripple.',
    params: {},
  },
  settle: {
    label: 'Dash and settle',
    note: 'A quick dash in, a firm stop, a still picture, then straight on to the next.',
    params: { gather: 1.1, hold: 2.4, fly: 0, spread: 0.5, wave: 0.4, speed: 55, arrive: 6, agility: 240, swirl: 0.5, sway: 0.25, bind: 5 },
  },
  peel: {
    label: 'Peel away',
    note: 'Each picture peels off from one side as a wave, and builds the next in the same order.',
    params: { gather: 1.3, hold: 2.2, fly: 0.4, spread: 1.1, wave: 0.9, speed: 50, arrive: 6, agility: 180, swirl: 0.8, sway: 0.3, bind: 4 },
  },
  wheel: {
    label: 'Wheel between',
    note: 'The flock breaks out and wheels as a murmuration for a moment between pictures.',
    params: { gather: 1.4, hold: 2.0, fly: 1.8, spread: 0.6, wave: 0.6, speed: 50, arrive: 6, agility: 160, swirl: 0.6, sway: 0.3, cruise: 9, pickup: 3, bind: 4 },
  },
  brisk: {
    label: 'Brisk',
    note: 'Shorter holds and very fast transits: lively, closer to flicking between pictures.',
    params: { gather: 0.9, hold: 1.6, fly: 0, spread: 0.35, wave: 0.3, speed: 70, arrive: 5, agility: 300, swirl: 0.4, sway: 0.2, bind: 6 },
  },
};
