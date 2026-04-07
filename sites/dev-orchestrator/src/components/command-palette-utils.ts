export interface CommandItem {
  label: string;
  href: string;
  category: string;
}

export const STATIC_COMMANDS: readonly CommandItem[] = [
  { label: 'Dashboard', href: '/', category: 'Pages' },
  { label: 'Definitions', href: '/definitions', category: 'Pages' },
  { label: 'Agents', href: '/agents', category: 'Pages' },
];

export function filterCommands(items: readonly CommandItem[], query: string): CommandItem[] {
  if (!query.trim()) return [...items];
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(lower) ||
      item.category.toLowerCase().includes(lower),
  );
}

export function nextIndex(current: number, length: number): number {
  if (length === 0) return -1;
  return (current + 1) % length;
}

export function prevIndex(current: number, length: number): number {
  if (length === 0) return -1;
  return current <= 0 ? length - 1 : current - 1;
}
