import { describe, expect, it } from 'vitest';
import { includeVisitedTab } from './visitedTabs';
import type { ActiveTab } from '../types';

describe('includeVisitedTab', () => {
  it('adds the active tab without dropping previously visited tabs', () => {
    const visited = new Set<ActiveTab>(['dashboard', 'intake']);

    const result = includeVisitedTab(visited, 'sourcing');

    expect([...result]).toEqual(['dashboard', 'intake', 'sourcing']);
    expect([...visited]).toEqual(['dashboard', 'intake']);
  });

  it('preserves the existing set when the active tab was already visited', () => {
    const visited = new Set<ActiveTab>(['dashboard', 'intake']);

    const result = includeVisitedTab(visited, 'intake');

    expect(result).toBe(visited);
  });
});
