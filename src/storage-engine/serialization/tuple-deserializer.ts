import { Row, TableSchema } from 'src/table/interfaces/table-schema.interface';
import { readValue } from './type-codec';

export function deserializeTuple(buffer: Buffer, schema: TableSchema): Row {
  const columns = schema.columns;
  const bitmapSize = Math.ceil(columns.length / 8);

  const row: Row = {};
  let offset = bitmapSize;

  columns.forEach((column, index) => {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    const bitValue = 2 ** bitIndex;
    const isNull = Math.floor(buffer[byteIndex] / bitValue) % 2 === 1;

    if (isNull) {
      row[column.name] = null;
      return;
    }

    const result = readValue(buffer, offset, column);
    row[column.name] = result.value;
    offset = result.nextOffset;
  });

  return row;
}