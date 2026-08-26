import { LockService } from './lock.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('LockService', () => {
  let lock: LockService;

  beforeEach(() => {
    lock = new LockService();
  });

  it('serializes tasks that share a key', async () => {
    const order: string[] = [];

    const first = lock.runExclusive('users', async () => {
      order.push('A:start');
      await sleep(20);
      order.push('A:end');
    });
    const second = lock.runExclusive('users', async () => {
      order.push('B:start');
      await sleep(1);
      order.push('B:end');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('lets different keys run in parallel', async () => {
    const order: string[] = [];

    const first = lock.runExclusive('users', async () => {
      order.push('A:start');
      await sleep(20);
      order.push('A:end');
    });
    const second = lock.runExclusive('orders', async () => {
      order.push('B:start');
      await sleep(1);
      order.push('B:end');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['A:start', 'B:start', 'B:end', 'A:end']);
  });

  it('runs queued tasks in arrival order, not completion order', async () => {
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        lock.runExclusive('users', async () => {
          await sleep(6 - n); // later arrivals finish faster if run in parallel
          order.push(n);
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns the task result to the caller', async () => {
    await expect(lock.runExclusive('users', () => Promise.resolve(42))).resolves.toBe(42);
  });

  it('propagates a rejection to the caller without jamming the queue', async () => {
    await expect(
      lock.runExclusive('users', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    await expect(lock.runExclusive('users', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('still runs a queued task when the one ahead of it throws', async () => {
    const order: string[] = [];

    const failing = lock.runExclusive('users', async () => {
      order.push('A');
      await sleep(10);
      throw new Error('boom');
    });
    const queued = lock.runExclusive('users', async () => {
      order.push('B');
    });

    await expect(failing).rejects.toThrow('boom');
    await queued;

    expect(order).toEqual(['A', 'B']);
  });

  it('makes a read-modify-write sequence atomic', async () => {
    let shared = 0;

    await Promise.all(
      Array.from({ length: 50 }, () =>
        lock.runExclusive('counter', async () => {
          const read = shared; // read
          await sleep(1); // <- the window where a lost update happens
          shared = read + 1; // write
        }),
      ),
    );

    expect(shared).toBe(50);
  });
});
