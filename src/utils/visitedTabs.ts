import type { ActiveTab } from '../types';

/**
 * Adds a tab to the visited set without mutating the previous state.
 * Existing visited tabs remain mounted so their in-progress UI state is preserved.
 */
export function includeVisitedTab(
  visited: ReadonlySet<ActiveTab>,
  activeTab: ActiveTab
): ReadonlySet<ActiveTab> {
  if (visited.has(activeTab)) return visited;
  return new Set([...visited, activeTab]);
}
