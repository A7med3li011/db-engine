import { Injectable } from '@nestjs/common';
import {
  PAGE_HEADER_SIZE,
  SLOT_SIZE,
  DELETED_OFFSET,
} from '../pager/constant.pager';
import { PageHeader } from '../pager/page-header.interface';
import { Slot } from '../pager/slot.interface';

@Injectable()
export class PageDeserializer {
  readHeader(page: Buffer): PageHeader {
    return {
      pageId: page.readUInt32LE(0),
      slotCount: page.readUInt16LE(4),
      tupleStart: page.readUInt16LE(6),
    };
  }

  readSlot(page: Buffer, slotId: number): Slot {
    const at = PAGE_HEADER_SIZE + slotId * SLOT_SIZE;
    const offset = page.readUInt16LE(at);
    return {
      offset,
      length: page.readUInt16LE(at + 2),
      deleted: offset === DELETED_OFFSET,
    };
  }

  readTuple(page: Buffer, slotId: number): Buffer | null {
    const slot = this.readSlot(page, slotId);
    if (slot.deleted) return null;

    return Buffer.from(page.subarray(slot.offset, slot.offset + slot.length));
  }

  freeSpace(page: Buffer): number {
    const header = this.readHeader(page);
    const directoryEnd = PAGE_HEADER_SIZE + header.slotCount * SLOT_SIZE;
    return header.tupleStart - directoryEnd;
  }
}
