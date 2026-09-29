const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(ms: number): string {
  return dateFormat.format(ms);
}
