import { WASTED_COLUMN } from 'src/storage-engine/csv/csv-constants';
import { KEYWORDS } from 'src/tokenizer/keywords';

const hiddenWords = new Set([WASTED_COLUMN.toUpperCase()]);

export function isReserved(name: string): boolean {
  const upper = name.toUpperCase();
  return KEYWORDS.has(upper) || hiddenWords.has(upper);
}
