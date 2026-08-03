import { HttpException, Injectable } from '@nestjs/common';
import * as path from 'path';

import { DatabaseMetadata } from './interfaces/database.metadata.interface';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class DatabaseService {
  private currentDatabase: string | null = null;
  constructor(private readonly storageService: StorageService) {}

  private getDatabasePath(name: string) {
    return path.join(process.cwd(), 'databases', name);
  }

  private async createMetaData(name: string, dataBasePath: string) {
    const metaData: DatabaseMetadata = {
      name,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    };
    const metaDataPath = path.join(dataBasePath, 'metadata.json');

    await this.storageService.writeFile(
      metaDataPath,
      JSON.stringify(metaData, null, 2),
    );
  }

  async create(name: string) {
    const dataBasePath = this.getDatabasePath(name);

    if (await this.storageService.exists(dataBasePath))
      throw new HttpException(`Database ${name} already exists`, 409);

    await this.storageService.createDirectory(dataBasePath);
    await this.createMetaData(name, dataBasePath);
  }

  async connect(name: string) {
    if (!(await this.storageService.exists(this.getDatabasePath(name))))
      throw new HttpException(`Database ${name} does not exist`, 404);

    this.currentDatabase = name;
  }

  requireCurrentDatabase(): string {
    if (!this.currentDatabase)
      throw new HttpException('No database is currently connected.', 400);

    return this.currentDatabase;
  }
  private getCurrentDatabase(): string | null {
    return this.currentDatabase;
  }

  async drop(name: string) {
    if (!(await this.storageService.exists(this.getDatabasePath(name))))
      throw new HttpException(`Database ${name} does not exist`, 404);

    if (name === this.getCurrentDatabase())
      throw new HttpException(
        'Cannot drop the currently connected database.',
        400,
      );
    await this.storageService.deleteDirectory(this.getDatabasePath(name));
  }
}
