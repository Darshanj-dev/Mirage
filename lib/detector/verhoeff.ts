// Verhoeff check digit, used by Aadhaar numbers (the 12th digit is the check digit).

const D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const INV: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

function digitsOf(value: string): number[] | null {
  if (!/^\d+$/.test(value)) return null;
  return [...value].map(Number);
}

/** Runs the Verhoeff checksum over `digits`, offset by `shift` positions. */
function checksum(digits: number[], shift: number): number {
  let c = 0;
  const reversed = [...digits].reverse();
  reversed.forEach((digit, i) => {
    c = D[c]![P[(i + shift) % 8]![digit]!]!;
  });
  return c;
}

/** True when the whole digit string (check digit last) passes Verhoeff. */
export function isValidVerhoeff(value: string): boolean {
  const digits = digitsOf(value);
  if (!digits || digits.length < 2) return false;
  return checksum(digits, 0) === 0;
}

/** The check digit to append to `value`. Used to build fictional test numbers. */
export function verhoeffCheckDigit(value: string): number {
  const digits = digitsOf(value);
  if (!digits) throw new Error('verhoeffCheckDigit expects digits only');
  return INV[checksum(digits, 1)]!;
}
