// This administrator receives visitor support tickets, without unsolicited service notices.
export function receivesServiceNotifications(admin: string | number): boolean {
  return String(admin) !== '470334534';
}
