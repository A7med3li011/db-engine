import { Row, TableSchema } from 'src/table/interfaces/table-schema.interface';
import { sizeOfValue, writeValue } from './type-codec';

export function serializeTuple(row: Row, schema: TableSchema): Buffer {
  const columns = schema.columns;
  const bitmapSize = Math.ceil(columns.length / 8);

  
  let totalSize = bitmapSize;
  for (const column of columns) {
    const value = row[column.name];
    if (value === null || value === undefined) continue;
    totalSize += sizeOfValue(column, value);
  }

  
  const buffer = Buffer.alloc(totalSize);
  let offset = bitmapSize;

  columns.forEach((column, index) => {
    const value = row[column.name];

    if (value === null || value === undefined) {
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      const bitValue = 2 ** bitIndex;
      buffer[byteIndex] = buffer[byteIndex] + bitValue;
      return;
    }

    offset = writeValue(buffer, offset, column, value);
  });

  return buffer;
}
