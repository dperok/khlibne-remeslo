export const MAX_QUANTITY_DIGITS = 4;
export function cartQuantityDigits(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY_DIGITS ? value : 2;
}
export function cartQuantityLimit(digits: unknown): number { return 10 ** cartQuantityDigits(digits) - 1; }
