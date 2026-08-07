import { Injectable } from '@nestjs/common';
import { PAGE_SIZE } from './constant.pager';
import { PageHeader } from './page-header.interface';
import { PageSerializer } from '../serialization/page-serializer';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class PagerService {
  constructor(
    private readonly pageSerializer: PageSerializer,
    private readonly storageService: StorageService,
  ) {}

  createPage(pageId: number): Buffer {
    const page = Buffer.alloc(PAGE_SIZE);
    const header: PageHeader = {
      pageId,
      slotCount: 0,
      tupleStart: PAGE_SIZE,
    };
    this.pageSerializer.writeHeader(page, header);

    return page;
  }

  async pageCount(filePath: string): Promise<number> {
    const size = await this.storageService.fileSize(filePath);

    return Math.floor(size / PAGE_SIZE);
  }

  async readPage(filePath: string, pageId: number): Promise<Buffer> {
    const page = Buffer.alloc(PAGE_SIZE);
    await this.storageService.readAt(filePath, page, pageId * PAGE_SIZE);

    return page;
  }

  async writePage(
    filePath: string,
    pageId: number,
    page: Buffer,
  ): Promise<void> {
    await this.storageService.writeAt(filePath, page, pageId * PAGE_SIZE);
  }

  async appendPage(
    filePath: string,
  ): Promise<{ pageId: number; page: Buffer }> {
    const pageId = await this.pageCount(filePath);
    const page = this.createPage(pageId);
    await this.writePage(filePath, pageId, page);

    return { pageId, page };
  }
}
