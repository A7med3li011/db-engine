import { Injectable } from '@nestjs/common';
import {
  access,
  writeFile,
  rm,
  mkdir,
  appendFile as fsAppendFile,
  readFile,
} from 'fs/promises';
import { AppendFileOptions } from './interfaces/append-file.interface';

@Injectable()
export class StorageService {
  async createDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async writeFile(filePath: string, data: string): Promise<void> {
    await writeFile(filePath, data, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async deleteDirectory(path: string): Promise<void> {
    await rm(path, { recursive: true });
  }

  async appendFile({
    path,
    content,
    encoding = 'utf-8',
  }: AppendFileOptions): Promise<void> {
    await fsAppendFile(path, content, encoding);
  }
  
  async readFile(options: { path: string; encoding?: BufferEncoding }) {
    const content = await readFile(options.path, options.encoding);
    return content;
  }
}
