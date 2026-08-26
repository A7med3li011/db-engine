export type IndexSource = 'PRIMARY_KEY' | 'SERIAL';

export interface IndexEntry {
  offset: number;
  length: number;
}

export interface TableIndexFile {
  table: string;
  keyColumn: string;
  source: IndexSource;
  entries: Record<string, IndexEntry>;
}

export interface KeyColumn {
  name: string;
  source: IndexSource;
}
