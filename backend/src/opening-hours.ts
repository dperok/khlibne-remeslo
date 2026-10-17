export type OpeningDay = { open: string; close: string } | null;
export type OpeningHours = OpeningDay[];
export const dayNames = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'];
export function isBakeryOpen(hours: OpeningHours, now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(value('weekday'));
  const time = `${value('hour')}:${value('minute')}`;
  const today = hours[day]; const yesterday = hours[(day + 6) % 7];
  return !!((today && (today.open < today.close ? time >= today.open && time < today.close : time >= today.open)) || (yesterday && yesterday.open > yesterday.close && time < yesterday.close));
}
