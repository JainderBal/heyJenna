import { budgetForRoom, budgetPrompt, layoutSpent, overSlotCeiling, shareOf, slotTargets } from './budget';
import { Slot } from './shopping-list';

const slot = (type: Slot['type'], count = 1): Slot => ({ type, count, required: type === 'sofa', why: '' });

describe('budget split', () => {
  const rooms = [
    { id: 'living', area: 30, spent: 0 },
    { id: 'entry', area: 10, spent: 0 },
  ];

  it('gives a larger room a larger share', () => {
    expect(shareOf(4000, 'living', rooms)).toBe(3000);
    expect(shareOf(4000, 'entry', rooms)).toBe(1000);
  });

  it('splits equal areas evenly', () => {
    const even = [
      { id: 'a', area: 20, spent: 0 },
      { id: 'b', area: 20, spent: 0 },
    ];
    expect(shareOf(10000, 'a', even)).toBe(5000);
    expect(shareOf(10000, 'b', even)).toBe(5000);
  });

  it('shrinks the cap when other rooms have already spent, and ignores this room’s own total', () => {
    const spent = [
      { id: 'living', area: 20, spent: 9000 },
      { id: 'bed', area: 20, spent: 8000 },
    ];
    const plan = budgetForRoom(10000, 'living', spent, [slot('sofa')]);
    expect(plan).toMatchObject({ roomShare: 5000, spentElsewhere: 8000, cap: 2000 });
  });

  it('caps a new room at zero once the home budget is used up', () => {
    const spent = [
      { id: 'living', area: 20, spent: 0 },
      { id: 'bed', area: 20, spent: 12000 },
    ];
    expect(budgetForRoom(10000, 'living', spent, [slot('sofa')])?.cap).toBe(0);
  });

  it('returns no cap when the home has no budget', () => {
    expect(budgetForRoom(null, 'living', rooms, [slot('sofa')])).toBeNull();
    expect(budgetPrompt(null)).toBe('');
  });

  it('weights the sofa above a plant, and splits art across its count', () => {
    const targets = slotTargets(3000, [slot('sofa'), slot('plant', 2), slot('art', 4)]);
    expect(targets.get('sofa')!).toBeGreaterThan(targets.get('plant')!);
    const artSlot = 3000 * (4 / (28 + 2 + 4));
    expect(targets.get('art')).toBe(Math.round((artSlot / 4) * 100) / 100);
  });

  it('sums priced products on a layout and drops anything over the slot ceiling', () => {
    expect(layoutSpent({ objects: [{ product: { price: 400 } }, { product: { price: null } }, { suggested: true }] })).toBe(400);
    expect(overSlotCeiling(1800, 1000)).toBe(true);
    expect(overSlotCeiling(1700, 1000)).toBe(false);
    expect(overSlotCeiling(null, 1000)).toBe(false);
    expect(overSlotCeiling(50, undefined)).toBe(false);
  });

  it('tells Jenna the home budget and this room’s share', () => {
    const text = budgetPrompt({ budgetCad: 20000, roomShare: 8000, cap: 5000, spentElsewhere: 3000 });
    expect(text).toContain('20,000');
    expect(text).toContain('8,000');
    expect(text).toContain('3,000');
    expect(text).toContain('maxPrice');
  });
});
