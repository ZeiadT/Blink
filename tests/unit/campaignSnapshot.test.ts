import { describe, expect, it } from 'vitest';
import { shuffleCampaignTargetGroups } from '@shared/campaignSnapshot';

describe('campaign target order', () => {
  it('shuffles a cloned snapshot without changing collection order', () => {
    const source = [
      { url: 'https://facebook.com/groups/one' },
      { url: 'https://facebook.com/groups/two' },
      { url: 'https://facebook.com/groups/three' },
    ];

    const shuffled = shuffleCampaignTargetGroups(source, () => 0);

    expect(shuffled.map((group) => group.url)).toEqual([
      'https://facebook.com/groups/two',
      'https://facebook.com/groups/three',
      'https://facebook.com/groups/one',
    ]);
    expect(source.map((group) => group.url)).toEqual([
      'https://facebook.com/groups/one',
      'https://facebook.com/groups/two',
      'https://facebook.com/groups/three',
    ]);
    expect(shuffled[0]).not.toBe(source[1]);
  });
});
