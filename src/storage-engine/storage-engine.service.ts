import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import { Row, TableSchema } from 'src/table/interfaces/table-schema.interface';
import { PagerService } from './pager/pager.service';
import { PageSerializer } from './serialization/page-serializer';
import { PageDeserializer } from './serialization/page-deserializer';
import { serializeTuple } from './serialization/tuple-serializer';
import { RowId } from './interfaces/row.id.inerface';
import { deserializeTuple } from './serialization/tuple-deserializer';

@Injectable()
export class StorageEngineService {
  constructor(
    private readonly pathService: PathService,
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly pagerService: PagerService,
    private readonly pageSerializer: PageSerializer,
    private readonly pageDeserializer: PageDeserializer,
  ) {}

  async readSchema(tableName: string): Promise<TableSchema> {
    const db = this.databaseService.requireCurrentDatabase();
    const schemaPath = this.pathService.getSchemaPath(db, tableName);

    if (!(await this.storageService.exists(schemaPath))) {
      throw new HttpException(`Schema ${tableName} does not exist`, 404);
    }

    const content = await this.storageService.readFile({ path: schemaPath });

    return JSON.parse(content) as TableSchema;
  }

  async insertRow(tableName: string, row: Row): Promise<RowId> {
    const dataPath = await this.requireDataPath(tableName);
    const schema = await this.readSchema(tableName);
    const tuple = serializeTuple(row, schema);

    const pageCount = await this.pagerService.pageCount(dataPath);

    if (pageCount > 0) {
      const pageId = pageCount - 1;
      const page = await this.pagerService.readPage(dataPath, pageId);
      const slotId = this.pageSerializer.insertTuple(page, tuple);

      if (slotId !== null) {
        await this.pagerService.writePage(dataPath, pageId, page);
        return { pageId, slotId };
      }
    }

    const { pageId, page } = await this.pagerService.appendPage(dataPath);
    const slotId = this.pageSerializer.insertTuple(page, tuple);

    if (slotId === null) {
      throw new HttpException('Row is too large to fit in one page.', 400);
    }

    await this.pagerService.writePage(dataPath, pageId, page);

    return { pageId, slotId };
  }

  async scan(tableName: string): Promise<{ rowId: RowId; row: Row }[]> {
    const dataPath = await this.requireDataPath(tableName);
    const schema = await this.readSchema(tableName);
    const pageCount = await this.pagerService.pageCount(dataPath);
    const rows: { rowId: RowId; row: Row }[] = [];

    for (let pageId = 0; pageId < pageCount; pageId++) {
      const page = await this.pagerService.readPage(dataPath, pageId);
      const header = this.pageDeserializer.readHeader(page);

      for (let slotId = 0; slotId < header.slotCount; slotId++) {
        const tuple = this.pageDeserializer.readTuple(page, slotId);

        if (!tuple) continue;

        rows.push({
          rowId: { pageId, slotId },
          row: deserializeTuple(tuple, schema),
        });
      }
    }

    return rows;
  }

  async updateRow(tableName: string, rowId: RowId, row: Row): Promise<RowId> {
    const dataPath = await this.requireDataPath(tableName);
    const schema = await this.readSchema(tableName);
    const tuple = serializeTuple(row, schema);

    const page = await this.pagerService.readPage(dataPath, rowId.pageId);

    if (this.pageSerializer.overwriteTuple(page, rowId.slotId, tuple)) {
      await this.pagerService.writePage(dataPath, rowId.pageId, page);
      return rowId;
    }

    this.pageSerializer.markDeleted(page, rowId.slotId);
    await this.pagerService.writePage(dataPath, rowId.pageId, page);

    return this.insertRow(tableName, row);
  }

  private async requireDataPath(tableName: string): Promise<string> {
    const db = this.databaseService.requireCurrentDatabase();
    const dataPath = this.pathService.getTablePath(db, tableName);

    if (!(await this.storageService.exists(dataPath))) {
      throw new HttpException(`Table ${tableName} does not exist`, 404);
    }

    return dataPath;
  }
}
