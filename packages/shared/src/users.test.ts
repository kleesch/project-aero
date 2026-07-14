import { describe, expect, it } from 'vitest';

import { formatUserRef } from './users.js';

describe('formatUserRef', () => {
  it('shows display name with the username', () => {
    expect(
      formatUserRef({ robloxUserId: 1, username: 'builderman', displayName: 'Builder Man' }),
    ).toBe('Builder Man (@builderman)');
  });

  it('collapses a display name identical to the username', () => {
    expect(
      formatUserRef({ robloxUserId: 1, username: 'builderman', displayName: 'builderman' }),
    ).toBe('@builderman');
  });

  it('falls back to the username without a display name', () => {
    expect(formatUserRef({ robloxUserId: 1, username: 'builderman', displayName: null })).toBe(
      '@builderman',
    );
  });

  it('falls back to the id without a snapshot', () => {
    expect(formatUserRef({ robloxUserId: 9725456, username: null, displayName: null })).toBe(
      'user #9725456',
    );
  });

  it('renders null and undefined actors as the system', () => {
    expect(formatUserRef(null)).toBe('System');
    expect(formatUserRef(undefined)).toBe('System');
  });
});
