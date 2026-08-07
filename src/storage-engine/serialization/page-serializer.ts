import { Injectable } from '@nestjs/common';
import {
  PAGE_HEADER_SIZE,
  SLOT_SIZE,
  DELETED_OFFSET,
} from '../pager/constant.pager';
import { PageHeader } from '../pager/page-header.interface';
import { PageDeserializer } from './page-deserializer';

@Injectable()
export class PageSerializer {
  constructor(private readonly pageDeserializer: PageDeserializer) {}

  writeHeader(page: Buffer, header: PageHeader): void {
    page.writeUInt32LE(header.pageId, 0);
    page.writeUInt16LE(header.slotCount, 4);
    page.writeUInt16LE(header.tupleStart, 6);
  }

  writeSlot(
    page: Buffer,
    slotId: number,
    offset: number,
    length: number,
  ): void {
    const at = PAGE_HEADER_SIZE + slotId * SLOT_SIZE;
    page.writeUInt16LE(offset, at);
    page.writeUInt16LE(length, at + 2);
  }

  
  insertTuple(page: Buffer, tuple: Buffer): number | null {
    const header = this.pageDeserializer.readHeader(page);

    
    const needed = tuple.length + SLOT_SIZE;
    if (this.pageDeserializer.freeSpace(page) < needed) return null;

    const offset = header.tupleStart - tuple.length;
    tuple.copy(page, offset);
    this.writeSlot(page, header.slotCount, offset, tuple.length);

    header.slotCount += 1;
    header.tupleStart = offset;
    this.writeHeader(page, header);

    return header.slotCount - 1;
  }

  
  overwriteTuple(page: Buffer, slotId: number, tuple: Buffer): boolean {
    const slot = this.pageDeserializer.readSlot(page, slotId);
    if (slot.deleted || tuple.length > slot.length) return false;

    tuple.copy(page, slot.offset);
    this.writeSlot(page, slotId, slot.offset, tuple.length);

    return true;
  }

  markDeleted(page: Buffer, slotId: number): void {
    this.writeSlot(page, slotId, DELETED_OFFSET, 0);
  }
}
