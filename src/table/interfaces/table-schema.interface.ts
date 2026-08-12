export enum ColumnType {
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  VARCHAR = 'VARCHAR',
  TEXT = 'TEXT',
  TIMESTAMP = 'TIMESTAMP',
}
export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  length?: number;
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

export interface WhereClause {
  column: string;
  operator: string;
  value: string | number | boolean;
}
