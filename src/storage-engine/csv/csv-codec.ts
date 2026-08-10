import {
  ColumnDefinition,
  ColumnType,
  Row,
  TableSchema,
} from 'src/table/interfaces/table-schema.interface';
import { DELIMITER, WASTED_COLUMN } from './csv-constants';

export function encodeValue(column: ColumnDefinition, value: unknown): string {
  if (value == null) return '';

  switch (column.type) {
    case ColumnType.TIMESTAMP:
      return `"${new Date(value as Date).toISOString()}"`;

    default:
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return String(value);
  }
}
export function dencodeValue(column: ColumnDefinition, value: string): unknown {
  if (value == '') return null;

  switch (column.type) {
    case ColumnType.TIMESTAMP:
      return new Date(value).toISOString();
    case ColumnType.VARCHAR:
    case ColumnType.TEXT:
      return String(value);
    case ColumnType.INTEGER:
      return Number(value);
    case ColumnType.BOOLEAN:
      return value === 'true';
    default:
      return String(value);
  }
}

export function splitFields(line: string): string[] {
  return line.split(DELIMITER);
}

export function encodeRow(row: Row, schema: TableSchema) {
  const arr: string[] = [];

  for (const col of schema.columns) {
    const encodedValueResult = encodeValue(col, row[col.name]);
    arr.push(encodedValueResult);
  }
  return arr.join(DELIMITER);
}
// 1,ahmed,24,true
export function decodeRow(row: string, schema: TableSchema) {
  const splitedRow = splitFields(row);
  const obj = {};
  for (const [idx, col] of schema.columns.entries()) {
    const decodedValueResult = dencodeValue(col, splitedRow[idx]);
    obj[col.name] = decodedValueResult;
  }

  return obj;
}

export function encodeHeader(schema: TableSchema) {
  const header: string[] = [WASTED_COLUMN];
  schema.columns.forEach((ele) => header.push(ele.name));
  return header.join(DELIMITER);
}
