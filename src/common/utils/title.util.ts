export function formatTitleWithCategory(category: string, title: string): string {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return `[${label}] ${title}`;
}
