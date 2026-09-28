// Optional AWS name check (docs/schema.md, Optional AWS name-check API).
// Local-only mode: always returns no names. Filled in at M7 if AWS is used.

export interface NamePosition {
  start: number;
  end: number;
  score: number;
}

/** `text` must already have IDs and secrets replaced by placeholders. */
export async function nameCheck(_text: string): Promise<NamePosition[]> {
  return [];
}
