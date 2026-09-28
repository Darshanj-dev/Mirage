// Adding a term to the Always mask list from the right-click menu (service worker only).

import { loadAlwaysMask, saveAlwaysMask } from './vault';

export const MAX_TERM_LENGTH = 60;

/** Cleans a selection into an Always mask term, or null if it can't be one. */
export function termFromSelection(selection: string | undefined): string | null {
  const term = (selection ?? '').trim().replace(/\s+/g, ' ');
  if (term.length < 2 || term.length > MAX_TERM_LENGTH) return null;
  return term;
}

export async function addAlwaysHide(selection: string | undefined): Promise<boolean> {
  const term = termFromSelection(selection);
  if (!term) return false;
  const current = await loadAlwaysMask();
  if (current.some((t) => t.toLowerCase() === term.toLowerCase())) return true;
  await saveAlwaysMask([...current, term]);
  return true;
}
