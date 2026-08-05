# DB Engine — Implementation Plan

A virtual SQL execution and version-controlled schema management engine, built on NestJS.

The system accepts **raw SQL statements over HTTP**, parses and validates them with a
hand-written SQL front end, and executes them against **plain files on disk** — no real
database server is involved. Schema lives in JSON, rows live in NDJSON, and every change is
recorded in an append-only history that can be inspected and rolled back.

> This document is the design and roadmap for the project. It describes both what exists today
> and the full target system, with every section marked so the two are never confused.

---

## Table of Contents

1. [Project Status](#project-status)
2. [Constraints](#constraints)
3. [Architecture](#architecture)
4. [Request Lifecycle](#request-lifecycle)
5. [Project Structure](#project-structure)
6. [On-Disk Layout](#on-disk-layout)
7. [File Formats](#file-formats)
8. [Supported SQL Grammar](#supported-sql-grammar)
9. [Type System](#type-system)
10. [API Reference](#api-reference)
11. [Worked Examples](#worked-examples)
12. [Error Catalog](#error-catalog)
13. [Validation & Safety](#validation--safety)
14. [Versioning Model](#versioning-model)
15. [Roadmap](#roadmap)
16. [Setup & Running](#setup--running)
17. [Testing Strategy](#testing-strategy)
18. [Design Decisions](#design-decisions)
19. [Open Questions](#open-questions)

---

## Project Status

| Marker | Meaning |
| :----: | ------- |
| ✅ | Implemented and working |
| 🚧 | Planned — designed but not yet built |

### Implemented today ✅

| Component | Location | Notes |
| --- | --- | --- |
| Storage primitives | `src/storage/storage.service.ts` | `fs/promises` wrapper — create/read/write/append/delete/exists |
| Path resolution | `src/shared/path.service.ts` | Single source of truth for on-disk layout |
| Database lifecycle | `src/database/` | create / connect / drop + `metadata.json` |
| Table creation | `src/table/` | Creates an empty `.ndjson` data file |
| HTTP exception filter | `src/shared/interceptors/transform.interceptor.ts` | Shapes `HttpException` responses |

### Not yet built 🚧

The SQL layer — lexer, parser, type system, catalog, executor, expression evaluator,
constraints, versioning, and the `/execute/*` endpoints. This is the bulk of the project and
is fully specified below.

---

## Constraints

These are hard project rules, not preferences.

- **No external packages for query compilation.** The lexer and parser are written by hand.
  No `node-sql-parser`, no `pgsql-ast-parser`, no PEG/ANTLR generators.
- **No external packages for file I/O.** Node's built-in `fs/promises` only.
- **No real database.** Nothing connects to PostgreSQL or any other engine. PostgreSQL is
  imitated only in *syntax* and *error message wording*.
- **No LLM-generated code.** Implementation is written by hand. (Documentation, planning, and
  review are not subject to this rule.)
- **Backend is NestJS** on Node.js, returning JSON.

---

## Architecture

```
                         HTTP
                          │
   POST /execute/ddl ─────┤
   POST /execute/dml ─────┼──▶  ExecuteController          🚧
   GET  /history     ─────┘            │
                                       ▼
                              ┌─────────────────┐
                              │      Lexer      │  SQL text ──▶ tokens
                              └────────┬────────┘
                                       ▼
                              ┌─────────────────┐
                              │     Parser      │  tokens ──▶ AST
                              └────────┬────────┘
                                       ▼
                              ┌─────────────────┐
                              │    Validator    │  relation & column existence,
                              └────────┬────────┘  type checking, constraints
                                       ▼
                              ┌─────────────────┐
                              │    Executor     │  DDL │ INSERT │ UPDATE
                              └────────┬────────┘  DELETE │ SELECT
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                  ┌──────────┐  ┌────────────┐  ┌──────────┐
                  │ Catalog  │  │  Storage   │  │  Index   │
                  │ schema   │  │  NDJSON    │  │ unique / │
                  │  .json   │  │   rows     │  │   PK     │
                  └──────────┘  └────────────┘  └──────────┘
                        └──────────────┼──────────────┘
                                       ▼
                              ┌─────────────────┐
                              │ VersionService  │  commit log + snapshots
                              └─────────────────┘
```

### Layer responsibilities

| Layer | Responsibility | Must not |
| --- | --- | --- |
| **Controller** | HTTP boundary, response shaping | Contain SQL knowledge |
| **Lexer** | Characters → tokens, track line/column | Understand grammar |
| **Parser** | Tokens → AST, report syntax errors | Touch the filesystem or catalog |
| **Validator** | Semantic checks against the catalog | Mutate anything |
| **Executor** | Carry out the AST against catalog + storage | Re-parse or re-validate |
| **Catalog** | Own the virtual schema, guarantee its integrity | Know about rows |
| **Storage** | Byte-level file operations, atomicity | Know about SQL or types |
| **Version** | Record history, snapshot, restore | Be optional to correctness |

The separation matters: the parser being filesystem-free is what makes it unit-testable, and
the executor never re-validating is what keeps error messages in one place.

---

## Request Lifecycle

A single `POST /execute/dml` request travels this path:

1. **Receive** — controller takes `{ "sql": "..." }`.
2. **Tokenize** — lexer produces a token stream; unknown characters raise a syntax error with
   a line/column position.
3. **Parse** — recursive-descent parser builds an AST. Any statement type outside the
   supported grammar is rejected here.
4. **Route** — statement kind decides the executor (DDL vs. DML) and rejects DDL sent to the
   DML endpoint and vice versa.
5. **Validate** — relation exists? columns exist? values type-check? constraints satisfiable?
6. **Snapshot** — before any mutation, copy the schema file and affected data files into a
   version directory.
7. **Execute** — mutate the catalog and/or data files using write-temp-then-rename.
8. **Record** — append a commit entry to the history log.
9. **Respond** — JSON result, or a descriptive error with the mutation rolled back.

Steps 6–8 are what make the "version-controlled" part of the project real rather than
decorative.

---

## Project Structure

```
src/
├── main.ts                       ✅ bootstrap, global prefix, validation pipe, filters
├── app.module.ts                 ✅ root module
│
├── shared/                       ✅ cross-cutting
│   ├── path.service.ts           ✅ every on-disk path resolves here
│   ├── shared.module.ts          ✅
│   ├── filter/                   🚧 exception filters (currently empty)
│   └── interceptors/             ✅ currently holds HttpExceptionFilter (misplaced — see Roadmap)
│
├── storage/                      ✅ raw file I/O
│   ├── storage.service.ts        ✅ + 🚧 streaming reads, atomic rewrite
│   └── interfaces/
│
├── database/                     ✅ database lifecycle (create / connect / drop)
│   ├── database.service.ts       ✅
│   ├── database.controller.ts    ✅
│   ├── dtos/
│   └── interfaces/
│
├── table/                        ✅ table creation (to be superseded by CREATE TABLE)
│   ├── table.service.ts          ✅ create(); drop/insert/update/delete are stubs
│   ├── table.controller.ts       ✅
│   └── interfaces/
│       └── table-schema.interface.ts  ✅ defined, not yet used
│
├── parser/                       🚧 the SQL front end
│   ├── lexer.ts                  🚧 characters → tokens
│   ├── token.ts                  🚧 token kinds, keyword table
│   ├── parser.ts                 🚧 recursive descent → AST
│   ├── ast/                      🚧 node type definitions
│   └── errors.ts                 🚧 SyntaxError with line/column
│
├── schema/                       🚧 the catalog (module stub exists)
│   ├── catalog.service.ts        🚧 load/save/mutate schema.json
│   ├── validator.service.ts      🚧 semantic validation
│   └── types/                    🚧 SQL type definitions & coercion
│
├── executor/                     🚧 execution (module stub exists)
│   ├── ddl.executor.ts           🚧 CREATE / DROP / ALTER
│   ├── dml.executor.ts           🚧 INSERT / UPDATE / DELETE
│   ├── select.executor.ts        🚧 the SELECT pipeline
│   ├── expression.evaluator.ts   🚧 WHERE / HAVING, three-valued logic
│   └── execute.controller.ts     🚧 /execute/ddl, /execute/dml
│
├── index/                        🚧 unique & primary-key lookup (module stub exists)
│   └── index.service.ts          🚧 in-memory Map per unique column
│
└── version/                      🚧 version control
    ├── version.service.ts        🚧 commit, snapshot, rollback
    └── history.controller.ts     🚧 GET /history
```

---

## On-Disk Layout

Everything lives under `databases/` at the project root, resolved exclusively through
`PathService`.

```
databases/
└── <database_name>/
    ├── metadata.json              ✅ database-level metadata
    ├── schema.json                🚧 the virtual schema — all table definitions
    ├── <table_name>.ndjson        ✅ one JSON object per line, one line per row
    └── .history/                  🚧
        ├── history.ndjson         🚧 append-only commit log
        └── versions/
            └── <commit_id>/       🚧 snapshot of files touched by that commit
                ├── schema.json
                └── <table>.ndjson
```

**Why NDJSON for rows.** One JSON object per line means `INSERT` is a pure append (O(1), no
rewrite), and a table can be scanned line-by-line without loading it entirely into memory.
The tradeoff is that `UPDATE`/`DELETE` require a full rewrite — acceptable at this scale, and
handled atomically (see below).

**Atomicity.** Every write that replaces an existing file goes to `<file>.tmp` first and is
then `rename`d over the target. `rename` is atomic within a filesystem, so a crash mid-write
can never leave a half-written schema or a truncated table. This is the concrete mechanism
behind the requirement to *"ensure structural integrity of schema files."*

---

## File Formats

### `metadata.json` ✅

Database-level information, written at creation.

```json
{
  "name": "test_db",
  "version": "1.0.0",
  "createdAt": "2026-08-03T11:01:08.363Z"
}
```

### `schema.json` 🚧

The virtual schema — the single authority on what tables and columns exist. `version` is
incremented on every DDL change so history entries can reference an exact schema state.

```json
{
  "database": "test_db",
  "version": 3,
  "updatedAt": "2026-08-03T12:14:02.001Z",
  "tables": {
    "users": {
      "name": "users",
      "createdAt": "2026-08-03T11:20:00.000Z",
      "columns": [
        {
          "name": "id",
          "type": "SERIAL",
          "nullable": false,
          "primaryKey": true
        },
        {
          "name": "email",
          "type": "VARCHAR",
          "length": 255,
          "nullable": true,
          "unique": true
        },
        {
          "name": "created_at",
          "type": "TIMESTAMP",
          "nullable": true,
          "default": null
        }
      ],
      "primaryKey": ["id"],
      "sequences": { "id": 4 },
      "foreignKeys": []
    }
  }
}
```

**`sequences`** holds the next value for each `SERIAL` column. It is bumped inside the same
atomic schema write as the insert that consumed it, so a crash cannot hand out a duplicate id.

### `<table>.ndjson` ✅ format / 🚧 content

One row per line. Keys are column names; values are JSON representations of SQL values
(see [Type System](#type-system)). No trailing commas, no wrapping array.

```
{"id":1,"email":"a@example.com","created_at":"2025-11-21T09:00:00.000Z"}
{"id":2,"email":"b@example.com","created_at":"2025-11-22T15:30:00.000Z"}
{"id":3,"email":null,"created_at":"2025-11-23T10:00:00.000Z"}
```

### `.history/history.ndjson` 🚧

Append-only. One commit per line, never rewritten.

```json
{
  "id": "c_000004",
  "timestamp": "2026-08-03T12:14:02.001Z",
  "type": "DML",
  "operation": "UPDATE",
  "statement": "update users set name=\"maram\" where id=2",
  "status": "success",
  "affectedRows": 1,
  "schemaVersion": 3,
  "snapshot": ".history/versions/c_000004",
  "user": "anonymous"
}
```

---

## Supported SQL Grammar

The parser implements a **deliberately bounded subset**. Anything outside it is rejected with
a syntax error rather than partially honored — a narrow grammar that is fully correct is worth
more than a broad one that is unreliable, and it is also what makes *"prevent harmful SQL
commands"* true by construction: statement types that are not in this grammar cannot execute
because they cannot parse.

Keywords are **case-insensitive**.

```ebnf
statement       := ddl | dml

(* ---------- DDL ---------- *)
ddl             := create_table | drop_table | alter_table

create_table    := CREATE TABLE [IF NOT EXISTS] ident
                   "(" column_def { "," column_def } ")" [";"]

column_def      := ident data_type { column_constraint }

column_constraint
                := PRIMARY KEY
                 | UNIQUE
                 | NOT NULL
                 | NULL
                 | DEFAULT literal
                 | REFERENCES ident "(" ident ")"          (* bonus *)

data_type       := SERIAL
                 | INT | INTEGER | BIGINT
                 | VARCHAR "(" number ")"
                 | TEXT
                 | BOOLEAN
                 | TIMESTAMP
                 | DATE
                 | NUMERIC [ "(" number "," number ")" ]
                 | FLOAT

drop_table      := DROP TABLE [IF EXISTS] ident [";"]

alter_table     := ALTER TABLE ident alter_action [";"]     (* bonus *)
alter_action    := ADD [COLUMN] column_def
                 | DROP [COLUMN] ident
                 | RENAME COLUMN ident TO ident
                 | RENAME TO ident

(* ---------- DML ---------- *)
dml             := insert | update | delete | select

insert          := INSERT INTO ident [ "(" ident_list ")" ]
                   VALUES value_row { "," value_row } [";"]
value_row       := "(" expr { "," expr } ")"

update          := UPDATE ident SET assignment { "," assignment }
                   [ WHERE expr ] [";"]
assignment      := ident "=" expr

delete          := DELETE FROM ident [ WHERE expr ] [";"]

select          := SELECT [DISTINCT] select_list
                   FROM table_ref { join_clause }
                   [ WHERE expr ]
                   [ GROUP BY expr_list ]                   (* bonus *)
                   [ HAVING expr ]                          (* bonus *)
                   [ ORDER BY order_item { "," order_item } ]
                   [ LIMIT number [ OFFSET number ] ] [";"]

select_list     := "*" | select_item { "," select_item }
select_item     := expr [ [AS] ident ]
table_ref       := ident [ [AS] ident ]
join_clause     := [INNER | LEFT [OUTER]] JOIN table_ref ON expr   (* bonus *)
order_item      := expr [ ASC | DESC ]
```

### Expression grammar

Parsed by precedence climbing, lowest precedence first:

| Level | Operators |
| --- | --- |
| 1 | `OR` |
| 2 | `AND` |
| 3 | `NOT` |
| 4 | `=` `<>` `!=` `<` `<=` `>` `>=` · `IS [NOT] NULL` · `[NOT] IN (…)` · `[NOT] LIKE` · `[NOT] BETWEEN … AND …` |
| 5 | `+` `-` |
| 6 | `*` `/` `%` |
| 7 | unary `-` `+` |
| 8 | literal · column reference · `COUNT/SUM/AVG/MIN/MAX(…)` · `( expr )` |

### String literals — an intentional deviation

Standard SQL uses single quotes for strings and double quotes for identifiers. The project
specification's examples use double quotes for **string values**:

```sql
insert into users(name, created_date) values ("mohammed","ahmed")
update users set name="maram" where id=2
```

To match the specification, this engine accepts **both `'…'` and `"…"` as string literals**.
Quoted identifiers are therefore not supported; identifiers must be bare. This is a documented
divergence from the SQL standard, adopted because the specification's own examples require it.

---

## Type System

Each SQL type is a self-contained unit responsible for parsing a literal, validating a value,
comparing two values, and serializing to JSON. Centralizing this is what makes error messages
consistent and `ORDER BY` correct across types.

| SQL type | JSON representation | Accepted input | Notes |
| --- | --- | --- | --- |
| `SERIAL` | number | *auto-generated* | Implies `INTEGER NOT NULL`; value taken from `sequences` |
| `INT` / `INTEGER` | number | integer literal | Range-checked to 32-bit |
| `BIGINT` | number | integer literal | Range-checked to `Number.MAX_SAFE_INTEGER` |
| `VARCHAR(n)` | string | string literal | Rejected if longer than `n` |
| `TEXT` | string | string literal | Unbounded |
| `BOOLEAN` | boolean | `TRUE` / `FALSE` | |
| `TIMESTAMP` | ISO-8601 string | parseable date-time string | Stored normalized as ISO-8601 UTC |
| `DATE` | `YYYY-MM-DD` string | parseable date string | Time component rejected |
| `NUMERIC(p,s)` | number | numeric literal | Scale enforced |
| `FLOAT` | number | numeric literal | |
| *any* | `null` | `NULL` | Rejected when the column is `NOT NULL` |

**NULL semantics.** SQL uses three-valued logic: `NULL = NULL` is *unknown*, not *true*, and a
`WHERE` clause only keeps rows where the predicate is *true* — not *unknown*. The expression
evaluator implements this from the outset. Getting it wrong silently corrupts every filter,
which is why it is a foundational concern rather than an edge case.

---

## API Reference

All routes are served under the global prefix **`/api/v1`** (set in `src/main.ts`). The
specification writes paths as `/execute/ddl`; the full path in this implementation is
`/api/v1/execute/ddl`.

### `POST /api/v1/execute/ddl` 🚧

Execute a Data Definition Language statement.

**Request**

```json
{ "sql": "CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, created_at TIMESTAMP);" }
```

**Success — `200`**

```json
{
  "success": true,
  "ddl": "CREATE TABLE users (...);",
  "message": "DDL generated and saved to schema files."
}
```

**Failure — `400`**

```json
{ "success": false, "message": "relation \"users\" already exists" }
```

---

### `POST /api/v1/execute/dml` 🚧

Execute a Data Manipulation Language statement. The response shape depends on the statement —
`SELECT` and `UPDATE` return a row array on success, while failures always return the
`{ success, message }` envelope. This mirrors the specification's examples exactly.

**Request**

```json
{ "sql": "select id, name from users where id > 1 order by id desc" }
```

**Success — `200`** — `SELECT` / `UPDATE` return matched or affected rows:

```json
[{ "id": 3, "name": "Ali" }, { "id": 2, "name": "Maram" }]
```

**Success — `200`** — `INSERT` / `DELETE` return a summary:

```json
{ "success": true, "affectedRows": 1, "message": "INSERT 1" }
```

**Failure — `400`**

```json
{ "success": false, "message": "relation \"orders\" does not exist" }
```

---

### `GET /api/v1/history` 🚧

Retrieve the version history, newest first.

**Query parameters**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `limit` | number | `50` | Maximum entries to return |
| `offset` | number | `0` | Entries to skip |
| `type` | `DDL` \| `DML` | *all* | Filter by statement class |

**Response — `200`**

```json
{
  "success": true,
  "total": 4,
  "history": [
    {
      "id": "c_000004",
      "timestamp": "2026-08-03T12:14:02.001Z",
      "type": "DML",
      "operation": "UPDATE",
      "statement": "update users set name=\"maram\" where id=2",
      "status": "success",
      "affectedRows": 1
    }
  ]
}
```

---

### Database management ✅

These routes exist today and are outside the specification's scope. They provide the namespace
that `/execute/*` operates within.

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/database` | `{ "name": "test_db" }` | Create a database directory + `metadata.json` |
| `POST` | `/api/v1/database/:name/connect` | — | Set the active database |
| `DELETE` | `/api/v1/database/:name` | — | Drop a database (refuses if it is the active one) |

### Table management ✅

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/table` | `{ "name": "users" }` | Create an empty data file |

> This endpoint is transitional. Once `CREATE TABLE` is implemented it becomes redundant,
> because it creates a data file without a schema. See [Roadmap](#roadmap) Phase 2.

---

## Worked Examples

The examples below are drawn from the project specification and serve as the acceptance
checks for each phase.

### 1. Create a table

```http
POST /api/v1/execute/ddl
Content-Type: application/json

{ "sql": "CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, created_at TIMESTAMP);" }
```

```json
{
  "success": true,
  "ddl": "CREATE TABLE users (...);",
  "message": "DDL generated and saved to schema files."
}
```

*Effect:* `schema.json` gains a `users` entry, `users.ndjson` is created empty, and a `DDL`
commit is appended to the history.

### 2. Insert with a type error

```http
POST /api/v1/execute/dml

{ "sql": "insert into users(name, created_date) values (\"mohammed\",\"ahmed\")" }
```

```json
{ "success": false, "message": "invalid input syntax for type timestamp" }
```

*Effect:* none. The statement is rejected during validation, before any file is touched.

### 3. Update

```http
POST /api/v1/execute/dml

{ "sql": "update users set name=\"maram\" where id=2" }
```

```json
[{ "id": 2, "name": "maram" }]
```

*Effect:* `users.ndjson` is rewritten atomically; the pre-change file is snapshotted into the
commit directory first.

### 4. Delete against a missing table

```http
POST /api/v1/execute/dml

{ "sql": "delete from orders where id=1" }
```

```json
{ "success": false, "message": "relation orders does not exist" }
```

### 5. Select with ordering

```http
POST /api/v1/execute/dml

{ "sql": "select id, name, created_date from users where id > 1 order by created_date desc" }
```

```json
[
  { "id": 3, "name": "Ali",   "created_date": "2025-11-23T10:00:00Z" },
  { "id": 2, "name": "Maram", "created_date": "2025-11-22T15:30:00Z" }
]
```

---

## Error Catalog

Error text imitates PostgreSQL so that failures are recognizable and descriptive. All are
produced from a single error module so wording never drifts.

### Syntax errors — raised by the parser

| Condition | Message |
| --- | --- |
| Unexpected token | `syntax error at or near "FORM"` |
| Unterminated string | `unterminated quoted string at or near "'abc"` |
| Unsupported statement | `statement type not supported` |
| Trailing input | `syntax error at end of input` |

### Schema errors — raised by the validator

| Condition | Message |
| --- | --- |
| Missing table | `relation "orders" does not exist` |
| Duplicate table | `relation "users" already exists` |
| Missing column | `column "nmae" of relation "users" does not exist` |
| Duplicate column in `CREATE` | `column "id" specified more than once` |
| Column count mismatch | `INSERT has more expressions than target columns` |

### Type errors — raised by the type system

| Condition | Message |
| --- | --- |
| Bad literal for type | `invalid input syntax for type timestamp: "ahmed"` |
| Over-long string | `value too long for type character varying(255)` |
| Integer overflow | `integer out of range` |

### Constraint errors — raised during execution

| Condition | Message |
| --- | --- |
| `NOT NULL` violated | `null value in column "email" of relation "users" violates not-null constraint` |
| `UNIQUE` / `PRIMARY KEY` violated | `duplicate key value violates unique constraint "users_email_key"` |
| Foreign key violated | `insert or update on table "orders" violates foreign key constraint` |
| Foreign key blocks delete | `update or delete on table "users" violates foreign key constraint on table "orders"` |

### State errors

| Condition | Message |
| --- | --- |
| No active database | `no database is currently connected` |
| DDL sent to the DML endpoint | `DDL statements must be sent to /execute/ddl` |

---

## Validation & Safety

The specification's safety requirements map onto concrete mechanisms:

| Requirement | Mechanism |
| --- | --- |
| Verify table/column existence | Validator consults the catalog before execution; nothing reaches the executor unresolved |
| Prevent harmful SQL commands | The grammar is a whitelist — `DROP DATABASE`, `TRUNCATE`, `GRANT`, `COPY`, and anything else outside it fail to parse and therefore cannot run |
| Ensure structural integrity of schema files | All replacing writes are write-temp-then-`rename`, which is atomic; the schema is never partially written |
| Treat each change as a versioned commit | Every mutation snapshots the files it will touch and appends a history entry before responding |

### Additional hardening

- **Identifier sanitization.** Database and table names are validated against
  `^[A-Za-z_][A-Za-z0-9_]{0,62}$` inside `PathService`, so no caller can construct a name that
  escapes the `databases/` directory via `../`. Enforcing this at the path layer rather than at
  each controller means it cannot be bypassed by a future endpoint.
- **Reserved words** cannot be used as bare identifiers.
- **Statement count.** One statement per request; a second statement after the terminating
  semicolon is a syntax error. This removes stacked-statement injection as a category.

---

## Versioning Model

Every mutation is a commit, and every commit is reversible.

**On each mutating statement:**

1. Allocate a monotonic commit id (`c_000001`, `c_000002`, …).
2. Copy `schema.json` and each data file the statement will touch into
   `.history/versions/<commit_id>/`.
3. Execute the statement.
4. Append a commit record to `.history/history.ndjson`.

**On failure**, the snapshot from step 2 is restored, and the commit is recorded with
`"status": "failed"` — so failures are traceable too, not silently discarded.

**Rollback** copies a commit's snapshot back over the live files, which is why snapshots hold
whole files rather than diffs: restoring is a copy, not a replay.

**Transactions** 🚧 build directly on this. `BEGIN` opens a snapshot scope, statements execute
normally, `COMMIT` discards the scope, and `ROLLBACK` — or any error — restores it. Because
the snapshot machinery already exists for single statements, grouped transactions add very
little new code.

---

## Roadmap

### Phase 0 — Foundation fixes · *small*

- [ ] Identifier sanitization in `PathService` (closes a path-traversal hole in the current
      `create`/`drop` endpoints)
- [ ] Move `HttpExceptionFilter` out of `shared/interceptors/transform.interceptor.ts` into
      `shared/filter/`; it is a filter, not an interceptor, and its current filename describes
      neither
- [ ] Remove the leftover `console.log` debug statement from the filter
- [ ] Add a catch-all filter so non-`HttpException` throws still return the JSON envelope
- [ ] Add streaming line reads and atomic write-temp-then-rename to `StorageService`
- [ ] Decide the database-scoping model (see [Open Questions](#open-questions))

### Phase 1 — SQL front end · *largest, highest risk*

- [ ] Token definitions and keyword table
- [ ] Lexer with line/column tracking
- [ ] AST node type definitions
- [ ] Recursive-descent parser: `CREATE TABLE`, `DROP TABLE`, `INSERT`, `UPDATE`, `DELETE`,
      `SELECT`
- [ ] Expression parser with precedence climbing
- [ ] Syntax errors reporting position

**Exit criterion:** every statement in [Worked Examples](#worked-examples) parses to the
correct AST under unit test. Do not begin Phase 2 before this holds.

### Phase 2 — Catalog & DDL · *medium*

- [ ] `schema.json` format and `CatalogService` with atomic persistence
- [ ] `CREATE TABLE` and `DROP TABLE` execution
- [ ] `POST /execute/ddl`

**Exit criterion:** Worked Example 1 passes end to end.

### Phase 3 — Types & INSERT · *medium*

- [ ] Type modules with validation and coercion
- [ ] `DEFAULT` values and `SERIAL` sequence allocation
- [ ] `NOT NULL`, `UNIQUE`, `PRIMARY KEY` enforcement (backed by `IndexService`)
- [ ] `INSERT` execution and `POST /execute/dml`

**Exit criterion:** Worked Example 2 returns the documented type error.

### Phase 4 — SELECT · *medium*

- [ ] Expression evaluator with three-valued logic
- [ ] `WHERE` filtering, projection, aliases
- [ ] `ORDER BY` (type-aware comparison), `LIMIT` / `OFFSET`, `DISTINCT`

**Exit criterion:** Worked Example 5 returns rows in the documented order.

### Phase 5 — UPDATE & DELETE · *small once Phase 4 lands*

- [ ] `UPDATE` with `SET` type checking and constraint recheck
- [ ] `DELETE`
- [ ] Atomic rewrite; return affected rows

**Exit criterion:** Worked Examples 3 and 4 pass.

### Phase 6 — Versioning & history · *medium*

- [ ] `VersionService` — commit ids, snapshots, restore
- [ ] History log writing on success and failure
- [ ] `GET /history` with filters

**Exit criterion:** every acceptance criterion in the specification is satisfied.

### Phase 7 — Bonus features · *in value order*

- [ ] `ALTER TABLE` — add / drop / rename column, rename table
- [ ] Schema diffing between versions
- [ ] Transactions with rollback (cheap once Phase 6 exists)
- [ ] `JOIN` support (`INNER`, `LEFT`)
- [ ] `GROUP BY`, `HAVING`, aggregate functions
- [ ] Foreign keys with referential integrity checks
- [ ] Operation logging with user attribution

---

## Setup & Running

**Requirements:** Node.js 20+ and npm.

```bash
# install dependencies
npm install

# development, with watch
npm run start:dev

# one-off run
npm run start

# production
npm run build
npm run start:prod
```

The server listens on `PORT`, defaulting to **3000**. All routes are under `/api/v1`.

```bash
# quick check
curl http://localhost:3000/api/v1

# create and connect a database
curl -X POST http://localhost:3000/api/v1/database \
  -H "Content-Type: application/json" \
  -d '{"name":"test_db"}'

curl -X POST http://localhost:3000/api/v1/database/test_db/connect
```

Data is written to `databases/` in the project root and is intentionally **not** git-ignored,
so schema and history are inspectable as ordinary files.

### Other scripts

```bash
npm run lint     # eslint --fix
npm run format   # prettier
npm test         # jest
```

---

## Testing Strategy

Jest is configured with `rootDir: src` and a `*.spec.ts` pattern. No test files exist yet.

| Layer | Approach | Priority |
| --- | --- | --- |
| **Lexer** | Token stream assertions, including malformed input | High |
| **Parser** | AST snapshot tests per statement type; a table of invalid statements each expecting a specific syntax error | **Highest** |
| **Type system** | Valid/invalid literal tables per type; boundary values | High |
| **Expression evaluator** | Truth tables, with NULL cases given first-class coverage | High |
| **Catalog** | Round-trip persistence; interrupted-write recovery | Medium |
| **Executors** | Temp-directory integration tests over real files | High |
| **Endpoints** | Supertest against the worked examples | Medium |

The parser deserves the heaviest coverage: it is the component most likely to be wrong in ways
that surface as confusing failures three layers downstream.

---

## Design Decisions

**NDJSON rather than a single JSON array.** Appends stay O(1) and scans stay streamable. A
single array would require parsing and rewriting the whole table for every insert.

**One `schema.json` per database rather than one file per table.** Multi-table DDL becomes a
single atomic write, and validation only ever reads one file.

**All paths through `PathService`.** One chokepoint for layout means one place to enforce
sanitization, and changing the on-disk layout later touches one file.

**Parser has no filesystem access.** Keeps it unit-testable in isolation and forces a clean
AST boundary between the front end and execution.

**Validation is separate from execution.** Executors assume a valid AST, so error messages
live in one place and cannot drift between statement types.

**Whitelist grammar rather than a blacklist of dangerous keywords.** Blacklists leak. If a
statement type is not in the grammar, no code path exists to run it.

**Whole-file snapshots rather than diffs.** Restore becomes a copy rather than a replay, which
makes rollback correct by construction and trivial to reason about.

---

## Open Questions

Decisions worth settling before Phase 1 begins, since each changes downstream work:

1. **Database scoping.** The specification assumes one implicit schema space, but this project
   already has a database layer. Should `/execute/*` operate on a `default` database when none
   is connected, or require an explicit connect first? *Recommendation:* auto-create and use
   `default`, so the specification's examples work verbatim with no setup.

2. **`currentDatabase` is process-global.** NestJS providers are singletons, so `connect` sets
   the active database for **every** concurrent request, not per client. Fine for single-user
   evaluation; worth deciding now because the entire execution layer will read this value.
   *Options:* accept it and document it, scope it per session/header, or pass the database
   explicitly on each `/execute` call.

3. **Response envelope.** The specification is internally inconsistent — DDL returns an object,
   failed DML returns `{success, message}`, and successful `SELECT`/`UPDATE` return a bare
   array. *Recommendation:* mirror it exactly as written and note the inconsistency here, since
   the examples are the acceptance criteria.

4. **`POST /table`.** Retire it once `CREATE TABLE` works, or keep it as an internal helper? It
   currently creates a data file with no schema entry, which will become an inconsistent state
   once the catalog exists. *Recommendation:* retire it.

5. **Multi-statement requests.** Reject anything after the first statement, or support batches
   as an implicit transaction? *Recommendation:* reject for now; revisit with Phase 7
   transactions.
