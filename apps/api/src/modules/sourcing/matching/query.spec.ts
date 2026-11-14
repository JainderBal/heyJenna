import { StyleProfile } from '@hey-jenna/contracts';
import { buildQuery } from './query';

const style = {
  keywords: ['mid century', 'teak', 'velvet'], palette: { dominant: ['#EFE3C8'], secondary: ['#A9461E'], accent: ['#2E5BBA'] },
} as StyleProfile;

describe('buildQuery', () => {
  it('adds a colour for big pieces', () => expect(buildQuery('sofa', style)).toBe('mid century teak rust sofa'));
  it('no colour for small pieces', () => expect(buildQuery('coffee_table', style)).toBe('mid century teak coffee table'));
});
