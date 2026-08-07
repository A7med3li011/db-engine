import {
  ColumnDefinition,
  ColumnType,
} from 'src/table/interfaces/table-schema.interface';

/*
method                 using byte                   using bits             Range

writeUInt8                1                            8                   0-255 bits

writeInt16LE              2                            16                  -32,768 -  32,767 bits

writeInt32LE              4                            32                  -2,147,483,648 - -2,147,483,648 bits

writeBigInt64LE           8                                             



in utf-8 each letter in strings using 1 byte
for texts we need to add extra 2 bytes to know when string end ===> [length][string]
*/

export function sizeOfValue(column: ColumnDefinition, value: unknown): number {
  switch (column.type) {
    case ColumnType.BOOLEAN:
      return 1;
    case ColumnType.INTEGER:
      return 4;
    case ColumnType.TIMESTAMP:
      return 8;
    case ColumnType.VARCHAR:
    case ColumnType.TEXT:
      return 2 + Buffer.byteLength(value as string, 'utf8');
  }
}

export function writeValue(
  buffer: Buffer,
  offset: number,
  column: ColumnDefinition,
  value: unknown,
): number {
  switch (column.type) {
    case ColumnType.BOOLEAN:
      buffer.writeUInt8(value ? 1 : 0, offset);
      return offset + 1;

    case ColumnType.INTEGER:
      buffer.writeInt32LE(value as number, offset);
      return offset + 4;

    case ColumnType.TIMESTAMP:
      buffer.writeBigInt64LE(
        BigInt(new Date(value as string).getTime()),
        offset,
      );
      return offset + 8;

    case ColumnType.VARCHAR:
    case ColumnType.TEXT: {
      const text = value as string;
      const byteLength = Buffer.byteLength(text, 'utf8');
      buffer.writeUInt16LE(byteLength, offset);
      buffer.write(text, offset + 2, 'utf8');
      return offset + 2 + byteLength;
    }
  }
}

export function readValue(
  buffer: Buffer,
  offset: number,
  column: ColumnDefinition,
): { value: unknown; nextOffset: number } {
  switch (column.type) {
    case ColumnType.BOOLEAN:
      return { value: buffer.readUInt8(offset) === 1, nextOffset: offset + 1 };

    case ColumnType.INTEGER:
      return { value: buffer.readInt32LE(offset), nextOffset: offset + 4 };

    case ColumnType.TIMESTAMP:
      return {
        value: new Date(Number(buffer.readBigInt64LE(offset))).toISOString(),
        nextOffset: offset + 8,
      };

    case ColumnType.VARCHAR:
    case ColumnType.TEXT: {
      const byteLength = buffer.readUInt16LE(offset);
      const text = buffer.toString('utf8', offset + 2, offset + 2 + byteLength);
      return { value: text, nextOffset: offset + 2 + byteLength };
    }
  }
}
