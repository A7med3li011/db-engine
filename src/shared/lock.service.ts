import { Injectable } from '@nestjs/common';

@Injectable()
export class LockService {
  private readonly chains = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();

    const current = previous.catch(() => {}).then(task);

    this.chains.set(key, current);

    return current;
  }
}
