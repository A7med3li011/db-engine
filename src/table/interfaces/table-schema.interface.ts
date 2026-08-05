export type ColumnType = 'number' | 'string' | 'boolean';
export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: any;
  indexed?: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnDefinition[];
}

export type Row = Record<string, unknown>;
