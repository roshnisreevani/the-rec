// MOCK DATA — Groups hasn't shipped yet, so Feed needs *some* notion
// of "which groups am I in" to tag and filter posts. This is a hardcoded
// stand-in for real group membership. Once the Groups tab lands with a real
// `groups` / `group_members` table, replace this with a fetch of the
// current user's actual memberships and delete this file.
export type MockGroup = {
  id: string;
  name: string;
  emoji: string;
};

export const MOCK_GROUPS: MockGroup[] = [
  { id: 'mock-tuesday-hoops', name: 'Tuesday Night Hoops', emoji: '🏀' },
  { id: 'mock-office-softball', name: 'Office Softball (Sort Of)', emoji: '🥎' },
  { id: 'mock-pickleball-mafia', name: 'Pickleball Mafia', emoji: '🏓' },
];

export function getMockGroup(id: string): MockGroup | undefined {
  return MOCK_GROUPS.find((g) => g.id === id);
}
