// Luhn (mod 10) check, used by payment card numbers.

/** True when the digit string passes the Luhn check. Non-digits make it false. */
export function isValidLuhn(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false;
  let sum = 0;
  let double = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let digit = value.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}
