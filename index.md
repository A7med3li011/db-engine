# Table Index File (`{tableName}.info.json`)

Fast row access by **PRIMARY KEY** or **SERIAL** column.

---

## 1. The idea in simple words

Today, when a user writes:

```sql
SELECT * FROM user WHERE id = 3;
```

the engine opens `user.csv`, reads **the whole file**, decodes **every row**, and keeps only the row where `id = 3`. If the table has 1 million rows, we read 1 million rows to return 1 row. This is slow.

The idea: keep a small **map file** beside the table. The map says:

> "The row with `id = 3` starts at byte 78 in the file and is 26 bytes long."

Now the engine can jump directly to byte 78, read only 26 bytes, decode one row, and return it. We never touch the rest of the file.

Think of it like a **book index**. You don't read the whole book to find the word "Nest" — you open the index page, it says "page 120", and you go straight there.

**Rule of the feature:**

| Query | What happens |
| --- | --- |
| `WHERE id = 3` (id is PK or SERIAL) | **Fast path** — read the index file, jump to the byte, read 1 row |
| `WHERE age = 22` (normal column) | **Slow path** — full scan like today |
| No `WHERE` at all | **Slow path** — we want all rows anyway, so full scan is correct |

---

## 2. Which tables get an index file?

Only tables that have a "row identity" column. We pick **one** column, with this priority:

1. A column with `primaryKey: true`
2. Else, a column with `autoIncrement: true` or `type: SERIAL`
3. Else → **no index file is created** (nothing changes for that table)

We pick only one column to keep the design simple. The primary key wins because it is the real identity of the row.

---

## 3. The file format

File name: `{tableName}.info.json`, placed beside `{tableName}.csv` inside the database folder.

```
databases/
  e_commerce/
    user.csv
    user.schema.json
    user.info.json        <-- new file
    product.csv
    product.schema.json
    product.incremental.json
    product.info.json     <-- new file
```

Content:

```json
{
  "table": "user",
  "keyColumn": "id",
  "source": "PRIMARY_KEY",
  "entries": {
    "3": { "offset": 24, "length": 26 },
    "2": { "offset": 50, "length": 27 }
  }
}
```

Meaning of each field:

- `table` — table name (helps when debugging / detecting a wrong file).
- `keyColumn` — which column this index is built on.
- `source` — `PRIMARY_KEY` or `SERIAL`, so we know why the index exists.
- `entries` — the map itself. **key** = the value of the key column as a string, **value** = position of the row inside the CSV file.
  - `offset` — how many bytes from the start of the file until the row begins.
  - `length` — how many bytes the row takes, **including** the wasted flag, the delimiters, and the final `\n`.

> Why is the JSON key a string? Because JSON object keys are always strings. So we always normalize with `String(value)` when we write **and** when we read. `1` and `"1"` become the same key — which matches the current engine behaviour, since `rowChecker` compares with `==` (loose equality).

---

## 4. Why `offset` and `length` are safe in this engine

Two facts about the CSV format make this design work:

**a) Rows are never moved or resized in place.**

- `INSERT` = append at the end of the file. Old rows keep their offsets.
- `DELETE` = mark the row as wasted (`markWasted`) — the row stays in the same place.
- `UPDATE` = mark the old row as wasted **and append** the new version at the end.

So an offset stays valid for the lifetime of the row.

**b) The wasted flag has a fixed width.**

```ts
export const LIVE_FLAG = 'false';   // 5 bytes
export const WASTED_FLAG = 'true '; // 5 bytes (note the trailing space)
export const FLAG_WIDTH = 5;
```

Flipping `false` → `true ` does **not** change the size of the row, so no offset after it shifts. This is why `writeAt` already works today, and it is exactly what our index needs.

Layout of one stored row:

```
false,3,01119919858,22,nader\n
^                            ^
|                            |
offset                       offset + length
|-----|
 flag (5 bytes, fixed)
```

---

## 5. Life cycle — when do we touch the index file?

| Operation | Action on `{table}.info.json` |
| --- | --- |
| `CREATE TABLE` | If the schema has a PK or SERIAL column → create the file with `entries: {}` |
| `INSERT` | Compute `offset = current file size`, `length = byte length of the new line`, then add `entries[key] = { offset, length }` |
| `SELECT ... WHERE key = X` | **Read only.** Look up the key, seek, read, decode |
| `SELECT` (other conditions) | Not used at all |
| `UPDATE` | Remove the old key entry (row became wasted), then the re-inserted row adds its new entry automatically |
| `DELETE` | Remove the key entry of every deleted row |
| `DROP TABLE` | Delete the `.info.json` file too |

Important ordering rule for `INSERT`: read the file size **before** appending. Because every write already runs inside `LockService.runExclusive(tableName, ...)`, no other insert can slip in between, so the size we read is exactly the offset of the row we are about to write.

---

## 6. Implementation steps

Order matters — each step compiles and runs on its own.

1. **Add the path** — `getIndexPath()` in `PathService`.
2. **Add types** — `IndexEntry`, `TableIndexFile`.
3. **Add `TableIndexService`** — the only class that reads/writes `.info.json`.
4. **Register it** in `StorageEngineModule`.
5. **Create the file on `createTable`.**
6. **Write entries on `insertRow`** (needs `offset` + `length`).
7. **Remove entries on `deleteRow` and `applyUpdate`.**
8. **Delete the file on `dropTable`.**
9. **Add the fast path in `select`.**
10. **Add `rebuildIndex()`** as a repair tool.
11. **(Optional) Use the index for duplicate-key validation** — the biggest extra win.

---

## 7. The code

### Step 1 — `src/shared/path.service.ts`

```ts
  getIndexPath(databaseName: string, table: string): string {
    return path.join(this.getDatabasePath(databaseName), `${table}.info.json`);
  }
```

### Step 2 — `src/storage-engine/index/table-index.interface.ts` (new file)

```ts
export type IndexSource = 'PRIMARY_KEY' | 'SERIAL';

export interface IndexEntry {
  offset: number;
  length: number;
}

export interface TableIndexFile {
  table: string;
  keyColumn: string;
  source: IndexSource;
  entries: Record<string, IndexEntry>;
}

export interface KeyColumn {
  name: string;
  source: IndexSource;
}
```

### Step 3 — `src/storage-engine/index/table-index.service.ts` (new file)

```ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import {
  ColumnType,
  TableSchema,
} from 'src/table/interfaces/table-schema.interface';
import {
  IndexEntry,
  KeyColumn,
  TableIndexFile,
} from './table-index.interface';

@Injectable()
export class TableIndexService {
  constructor(
    private readonly pathService: PathService,
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Decide which column this table is indexed by.
   * Primary key first, then SERIAL / autoIncrement, otherwise no index.
   */
  pickKeyColumn(schema: TableSchema): KeyColumn | null {
    const primary = schema.columns.find((column) => column.primaryKey);
    if (primary) return { name: primary.name, source: 'PRIMARY_KEY' };

    const serial = schema.columns.find(
      (column) => column.autoIncrement || column.type === ColumnType.SERIAL,
    );
    if (serial) return { name: serial.name, source: 'SERIAL' };

    return null;
  }

  /** JSON keys are strings, so every key passes through here. */
  normalizeKey(value: unknown): string {
    return String(value);
  }

  private getPath(tableName: string): string {
    const db = this.databaseService.requireCurrentDatabase();
    return this.pathService.getIndexPath(db, tableName);
  }

  async exists(tableName: string): Promise<boolean> {
    return this.storageService.exists(this.getPath(tableName));
  }

  /** Called by createTable. Does nothing when the table has no key column. */
  async create(schema: TableSchema): Promise<void> {
    const key = this.pickKeyColumn(schema);
    if (!key) return;

    await this.write(schema.name, {
      table: schema.name,
      keyColumn: key.name,
      source: key.source,
      entries: {},
    });
  }

  /** Returns null when the table has no index file. */
  async load(tableName: string): Promise<TableIndexFile | null> {
    const indexPath = this.getPath(tableName);
    if (!(await this.storageService.exists(indexPath))) return null;

    try {
      const content = await this.storageService.readFile({ path: indexPath });
      return JSON.parse(content) as TableIndexFile;
    } catch {
      // A broken index must never break a query, the caller falls back
      // to the full scan and can rebuild the file later.
      return null;
    }
  }

  async write(tableName: string, index: TableIndexFile): Promise<void> {
    await this.storageService.writeJson(this.getPath(tableName), index);
  }

  async addEntry(
    tableName: string,
    key: unknown,
    entry: IndexEntry,
  ): Promise<void> {
    const index = await this.load(tableName);
    if (!index) return;

    index.entries[this.normalizeKey(key)] = entry;
    await this.write(tableName, index);
  }

  async removeEntries(tableName: string, keys: unknown[]): Promise<void> {
    if (!keys.length) return;

    const index = await this.load(tableName);
    if (!index) return;

    for (const key of keys) {
      delete index.entries[this.normalizeKey(key)];
    }
    await this.write(tableName, index);
  }

  async lookup(tableName: string, key: unknown): Promise<IndexEntry | null> {
    const index = await this.load(tableName);
    if (!index) return null;

    return index.entries[this.normalizeKey(key)] ?? null;
  }

  /** True when the key already exists — used for O(1) duplicate checks. */
  async hasKey(tableName: string, key: unknown): Promise<boolean> {
    const index = await this.load(tableName);
    if (!index) return false;

    return this.normalizeKey(key) in index.entries;
  }

  async drop(tableName: string): Promise<void> {
    await this.storageService.deleteFile(this.getPath(tableName));
  }
}
```

### Step 4 — `src/storage-engine/storage-engine.module.ts`

```ts
import { TableIndexService } from './index/table-index.service';

@Module({
  imports: [DatabaseModule, StorageModule, SharedModule],
  controllers: [StorageEngineController],
  providers: [StorageEngineService, TableIndexService],
  exports: [StorageEngineService, TableIndexService],
})
export class StorageEngineModule {}
```

And inject it in `StorageEngineService`:

```ts
  constructor(
    private readonly pathService: PathService,
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly tableIndexService: TableIndexService,
  ) {}
```

### Step 5 — create the file with the table

In `StorageEngineService.createTable`, inside the `try` block, right after the schema is written:

```ts
      await this.storageService.writeJson(schemaPath, dto);

      // NEW: build the (empty) index when the table has a PK or SERIAL column
      await this.tableIndexService.create(dto);
    } catch {
      await this.storageService.deleteFile(dataPath);
      await this.tableIndexService.drop(dto.name); // NEW: clean up on failure
      throw new HttpException(`Failed to create table ${dto.name}`, 500);
    }
```

### Step 6 — record the position on insert

```ts
  async insertRow(tableName: string, row: Row): Promise<void> {
    const dataPath = await this.requireDataPath(tableName);
    const schema = await this.readSchema(tableName);

    const encodedRowResult = encodeRow(row, schema);
    const newRow = `${LIVE_FLAG}${DELIMITER}${encodedRowResult}${LINE_BREAK}`;

    // The row will land exactly at the current end of the file.
    // Safe because inserts run inside the per-table lock.
    const offset = await this.storageService.fileSize(dataPath);
    const length = Buffer.byteLength(newRow);

    await this.storageService.appendFile({ path: dataPath, content: newRow });

    const key = this.tableIndexService.pickKeyColumn(schema);
    if (key) {
      await this.tableIndexService.addEntry(tableName, row[key.name], {
        offset,
        length,
      });
    }
  }
```

> `Buffer.byteLength` — not `.length` — because a name like `"محمد"` is more characters in bytes than in JS string length. Offsets are byte positions, so everything must be measured in bytes.

### Step 7 — drop entries on delete and update

`deleteRow` — after `markWasted`:

```ts
    await this.markWasted(
      tableName,
      targets.map((target) => target.offset),
    );

    // NEW: those keys no longer exist
    await this.removeIndexKeys(tableName, targets.map((t) => t.row));
```

`applyUpdate` — the old versions become wasted, then `insertRow` re-adds the new positions:

```ts
  async applyUpdate(
    tableName: string,
    targets: StoredRow[],
    mergedRows: Row[],
  ): Promise<void> {
    await this.markWasted(
      tableName,
      targets.map((target) => target.offset),
    );

    // NEW: forget the old positions (the key may also have changed)
    await this.removeIndexKeys(tableName, targets.map((t) => t.row));

    for (const row of mergedRows) {
      await this.insertRow(tableName, row); // re-adds the new position
    }
  }
```

Small shared helper:

```ts
  private async removeIndexKeys(tableName: string, rows: Row[]): Promise<void> {
    const schema = await this.readSchema(tableName);
    const key = this.tableIndexService.pickKeyColumn(schema);
    if (!key) return;

    await this.tableIndexService.removeEntries(
      tableName,
      rows.map((row) => row[key.name]),
    );
  }
```

> Order matters: **remove first, insert second.** If the update does not change the key value, inserting first and removing second would delete the entry we just wrote and leave the table without an index for that row.

### Step 8 — delete the file with the table

```ts
  async dropTable(tableName: string) {
    // ...existing checks...
    await Promise.all([
      this.storageService.deleteFile(tablePath),
      this.storageService.deleteFile(schemaPath),
      this.tableIndexService.drop(tableName), // NEW
    ]);
  }
```

### Step 9 — the fast path in `select`

```ts
  async select(
    tableName: string,
    projection: string[] | undefined,
    where?: WhereClause,
  ): Promise<Row[]> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    const schema = await this.readSchema(tableName);

    // NEW: try the index before touching the data file
    if (where && where.operator === '=') {
      const fast = await this.selectByIndex(tableName, schema, projection, where);
      if (fast) return fast;
    }

    // ...existing full scan, unchanged...
  }

  /**
   * Returns null  -> "I cannot answer this, do a full scan".
   * Returns []    -> "the index is valid and the key does not exist".
   */
  private async selectByIndex(
    tableName: string,
    schema: TableSchema,
    projection: string[] | undefined,
    where: WhereClause,
  ): Promise<Row[] | null> {
    const key = this.tableIndexService.pickKeyColumn(schema);
    if (!key || key.name !== where.column) return null;

    const index = await this.tableIndexService.load(tableName);
    if (!index || index.keyColumn !== where.column) return null;

    const entry = index.entries[this.tableIndexService.normalizeKey(where.value)];
    if (!entry) return [];

    const row = await this.readRowAt(tableName, entry, schema);
    if (!row) return []; // stale entry: the row was already wasted

    return [projection?.length ? this.projectionMethod(row, projection) : row];
  }

  /** Read exactly one row using its byte position. */
  private async readRowAt(
    tableName: string,
    entry: IndexEntry,
    schema: TableSchema,
  ): Promise<Row | null> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);

    const buffer = Buffer.alloc(entry.length);
    const bytesRead = await this.storageService.readAt(
      tablePath,
      buffer,
      entry.offset,
    );
    if (!bytesRead) return null;

    const line = buffer.toString('utf-8', 0, bytesRead).split(LINE_BREAK)[0];
    if (!line) return null;

    const fields = splitFields(line);
    if (fields[0] === WASTED_FLAG) return null;

    return decodeRow(fields.slice(1).join(DELIMITER), schema);
  }
```

The three-state return (`null` / `[]` / `[row]`) is the heart of the feature: the fast path is allowed to say *"not my job"* and the engine silently falls back to the old, always-correct behaviour.

### Step 10 — rebuild (repair tool)

Any full scan can regenerate the index. Use it after a crash, after editing the CSV by hand, or when adding the feature to tables that already exist.

```ts
  async rebuildIndex(tableName: string): Promise<void> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    const schema = await this.readSchema(tableName);

    const key = this.tableIndexService.pickKeyColumn(schema);
    if (!key) return;

    const content = await this.storageService.readFile({ path: tablePath });
    const lines = content.split(LINE_BREAK);

    const entries: Record<string, IndexEntry> = {};
    let offset = Buffer.byteLength(lines[0] + LINE_BREAK); // skip the header

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const length = Buffer.byteLength(line + LINE_BREAK);
      const rowOffset = offset;
      offset += length;

      if (line === '') continue;

      const fields = splitFields(line);
      if (fields[0] === WASTED_FLAG) continue;

      const row = decodeRow(fields.slice(1).join(DELIMITER), schema);
      entries[this.tableIndexService.normalizeKey(row[key.name])] = {
        offset: rowOffset,
        length,
      };
    }

    await this.tableIndexService.write(tableName, {
      table: tableName,
      keyColumn: key.name,
      source: key.source,
      entries,
    });
  }
```

This is the same loop as `readAllRows`, it only stores positions instead of rows.

### Step 11 — bonus: O(1) duplicate-key check

Today every `INSERT` into a table with a PK calls `readAllRows()` just to answer *"does this key already exist?"* (see `ValidationService.needsAllRows` → `ConstrainCheckerService.validatePrimaryKey`). With the index, that answer is one `hasKey()` call.

In `TableService.insert`, the primary-key part of the check becomes:

```ts
        if (await this.storageEngineService.hasIndexedKey(tableName, row)) {
          throw new HttpException(`Duplicate primary key "${...}".`, 409);
        }
```

Do this **only** for the indexed column. Other `unique` columns still need the full scan, because the index knows nothing about them.

---

## 8. What we gain

For a table of **N** rows:

| Operation | Before | After |
| --- | --- | --- |
| `SELECT ... WHERE pk = X` | read N rows | read 1 row + 1 small JSON |
| `INSERT` (table has PK) | read N rows to check duplicates | read the index only |
| `SELECT` without `WHERE` | read N rows | read N rows (unchanged) |
| `SELECT ... WHERE other_col = X` | read N rows | read N rows (unchanged) |

---

## 9. Honest limits (read this before shipping)

1. **The index is loaded fully into memory.** For 1M rows the JSON is a few tens of MB, and we re-read + re-write it on **every** insert. This design is correct but it is *not* the final performance story — see "Next steps" below.
2. **Two files, no transaction.** If the process dies between the CSV append and the index write, the index misses a row. That row is then invisible to fast-path queries even though it exists. Mitigation: `rebuildIndex()`, plus writing the index **after** the data (never before), so the worst case is a *missing* entry, never a *lying* entry.
3. **Stale entries are handled, missing entries are not.** `readRowAt` re-checks the wasted flag, so an entry pointing at a deleted row returns "not found" instead of returning garbage. But a missing entry makes the fast path answer `[]` — wrong. This is why every write path must update the index, and why `rebuildIndex` exists.
4. **Only `=` is accelerated.** `>`, `<`, `!=` still full-scan.
5. **Only one column per table.** A second PK-like column, or `unique` columns, are not indexed.
6. **No compaction yet.** Wasted rows stay in the file forever. When you add compaction (rewriting the CSV without wasted rows), **every offset changes** — compaction must call `rebuildIndex()` at the end, inside the same lock.
7. **Key normalization is `String(value)`.** Works for INTEGER, SERIAL, VARCHAR, TEXT and BOOLEAN. TIMESTAMP keys are stored as ISO strings, so the `WHERE` value must be written in the exact same format to hit the fast path — otherwise the lookup misses and returns a wrong `[]`. Safest rule: only enable the fast path when the key column type is INTEGER, SERIAL, VARCHAR or TEXT.

---

## 10. Test list

- Create a table **without** PK/SERIAL → no `.info.json` file exists.
- Create a table **with** PK → file exists with `entries: {}`.
- Insert 3 rows → 3 entries, and each `offset` equals the sum of the byte lengths of everything before it.
- `SELECT * WHERE id = 2` → returns exactly the same object as the full scan does.
- `SELECT id, name WHERE id = 2` → projection still applied.
- `SELECT * WHERE id = 999` → `[]`.
- `SELECT * WHERE name = 'nader'` → falls back to the full scan and still works.
- Delete a row → its key disappears from `entries`, and `WHERE id = deleted` returns `[]`.
- Update a row → old entry gone, new entry points at the end of the file, values are the new ones.
- Update **the key itself** (`id = 2` → `id = 7`) → key `2` gone, key `7` present.
- Insert a row with a **non-ASCII** value (Arabic name) → `readRowAt` still returns the full row (byte-length check).
- Delete the `.info.json` file by hand → every query still returns correct results (full-scan fallback).
- Corrupt the `.info.json` file (write `not json`) → queries still work, then `rebuildIndex()` repairs it.
- `rebuildIndex()` on a table with wasted rows → wasted rows are not in `entries`.
- Drop the table → the `.info.json` file is deleted.

---

## 11. Next steps (later, not now)

- **Cache the index in memory** — a `Map<string, TableIndexFile>` inside `TableIndexService`, written to disk on change instead of read-then-write on every insert. This removes the biggest cost of the current design.
- **Append-only index log** — instead of rewriting the whole JSON, append one line per change (`+3,78,26` / `-3`) and compact it periodically. This is how real engines do it.
- **Range queries** — keep the keys sorted so `WHERE id > 100` can walk only the matching part of the index.
- **Secondary indexes** — one file per indexed column (`{table}.{column}.info.json`), where one key maps to a **list** of positions because the values are not unique.
- **B-Tree on disk** — the real answer when the index itself becomes too big to hold in memory.
