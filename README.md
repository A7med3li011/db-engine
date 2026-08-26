# db-engine

A small SQL database engine written in NestJS. It tokenizes SQL text, parses it into an AST, and
executes it against CSV files on disk under `databases/`.

This README covers the **SQL endpoints** (`/sql/*`) — the two routes you send raw SQL to.

---

## Running

```bash
npm install
npm run start:dev     # watch mode
npm run start:prod    # after npm run build
```

The server listens on `http://localhost:3000` (override with the `PORT` env var).
Every route is prefixed with `api/v1`, so the base URL is:

```
http://localhost:3000/api/v1
```

---

## Endpoints

Both endpoints take the same body — a single SQL statement as a string:

```json
{ "statement": "SELECT * FROM product" }
```

| Method | Path          | Accepts                                  |
| ------ | ------------- | ---------------------------------------- |
| `POST` | `/sql/ddl`    | `CREATE` and `DROP` statements only       |
| `POST` | `/sql/dml`    | `SELECT`, `INSERT`, `UPDATE`, `DELETE`    |

The split is enforced on the first keyword. Sending a `SELECT` to `/sql/ddl` returns
`400 this method for DDL only`, and sending a `CREATE` to `/sql/dml` returns
`400 this method for DML only`.

Every successful response is wrapped in the same envelope:

```json
{
  "statusCode": 200,
  "message": "2 row(s) selected",
  "data": [{ "id": 1, "title": "laptop" }]
}
```

`data` is the result of the statement — an array of rows for `SELECT`, and a small object naming
what was touched for everything else. `statusCode` matches the HTTP status, and it varies with the
statement: **201** for `CREATE` and `INSERT`, **200** for everything else.

---

## Before you run any statement: connect

Tables live inside a database, and the engine keeps the "current database" **in memory**. Until you
connect, every table statement fails with:

```json
{ "statusCode": 400, "message": "No database is currently connected." }
```

There is no SQL for this — connecting is a separate route:

```bash
curl -X POST http://localhost:3000/api/v1/database/shop/connect
```

Because the connection is held in memory, **it is lost every time the server restarts**. After a
restart, connect again before sending SQL.

---

## Usage examples

All examples assume `BASE=http://localhost:3000/api/v1`.

### 1. Create a database and connect to it

```bash
curl -X POST $BASE/sql/ddl \
  -H 'Content-Type: application/json' \
  -d '{"statement":"CREATE DATABASE shop"}'
# → 201 {"statusCode":201,"message":"Database shop created successfully",
#            "data":{"database":"shop"}}

curl -X POST $BASE/database/shop/connect
# → 200 {"statusCode":200,"message":"Connected to database shop",
#            "data":{"database":"shop"}}
```

### 2. Create a table

```bash
curl -X POST $BASE/sql/ddl \
  -H 'Content-Type: application/json' \
  -d '{"statement":"CREATE TABLE product (id SERIAL PRIMARY KEY, title VARCHAR(50) NOT NULL, price INTEGER DEFAULT 0, active BOOLEAN DEFAULT TRUE)"}'
# → 201 {"statusCode":201,"message":"Table product created successfully",
#            "data":{"table":"product"}}
```

### 3. Insert rows

```bash
curl -X POST $BASE/sql/dml \
  -H 'Content-Type: application/json' \
  -d "{\"statement\":\"INSERT INTO product (title, price) VALUES ('laptop', 1500)\"}"
# → 201 {"statusCode":201,"message":"Row inserted into product successfully",
#            "data":{"table":"product"}}
```

`id` is omitted — `SERIAL` fills it in automatically.

### 4. Select

```bash
curl -X POST $BASE/sql/dml \
  -H 'Content-Type: application/json' \
  -d '{"statement":"SELECT * FROM product"}'
# → 200 {"statusCode":200,"message":"2 row(s) selected",
#            "data":[{"id":1,"title":"laptop","price":1500,"active":true},
#                    {"id":2,"title":"mouse","price":25,"active":true}]}
```

With a projection and a condition:

```bash
curl -X POST $BASE/sql/dml \
  -H 'Content-Type: application/json' \
  -d '{"statement":"SELECT title, price FROM product WHERE id = 1"}'
# → 200 {"statusCode":200,"message":"1 row(s) selected",
#            "data":[{"title":"laptop","price":1500}]}
```

### 5. Update and delete

```bash
curl -X POST $BASE/sql/dml \
  -H 'Content-Type: application/json' \
  -d '{"statement":"UPDATE product SET price = 1400 WHERE id = 1"}'
# → 200 {"statusCode":200,"message":"Rows in product updated successfully",
#            "data":{"table":"product"}}

curl -X POST $BASE/sql/dml \
  -H 'Content-Type: application/json' \
  -d '{"statement":"DELETE FROM product WHERE id = 2"}'
# → 200 {"statusCode":200,"message":"Rows deleted from product successfully",
#            "data":{"table":"product"}}
```

`UPDATE` and `DELETE` **require** a `WHERE` clause — this is a deliberate guard against wiping a
table by accident.

### 6. Drop

```bash
curl -X POST $BASE/sql/ddl \
  -H 'Content-Type: application/json' \
  -d '{"statement":"DROP TABLE product"}'
# → 200 {"statusCode":200,"message":"Table product dropped successfully",
#            "data":{"table":"product"}}
```

`DROP DATABASE shop` works the same way, but not while you are connected to it — disconnect by
connecting elsewhere first.

---

## Supported SQL

### DDL — `POST /sql/ddl`

```sql
CREATE DATABASE <name>
CREATE TABLE <name> (<column> <type> [constraints], ...)
DROP DATABASE <name>
DROP TABLE <name>
```

**Column types:** `INTEGER`, `VARCHAR(n)`, `TEXT`, `BOOLEAN`, `TIMESTAMP`, `SERIAL`

`SERIAL` is shorthand for an auto-incrementing, non-nullable `INTEGER`.

**Column constraints:** `PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `DEFAULT <value>`

A table may have at most one `PRIMARY KEY`.

### DML — `POST /sql/dml`

```sql
SELECT <* | col, col> FROM <table> [WHERE <col> <op> <value>]
INSERT INTO <table> (<col>, ...) VALUES (<value>, ...)
UPDATE <table> SET <col> = <value>[, ...] WHERE <col> <op> <value>
DELETE FROM <table> WHERE <col> <op> <value>
```

**Comparison operators:** `=`, `>`, `<`, `>=`, `<=`, `!=`, `<>`

### Syntax notes

- Keywords are case-insensitive (`select` and `SELECT` both work); table and column names are not.
- String literals use single quotes: `'laptop'`. A doubled `''` is accepted by the tokenizer, but
  it is currently stored verbatim — `'it''s'` comes back as `it''s`, not `it's`.
- `--` starts a comment that runs to the end of the line.
- Literals may be numbers (including negatives), `TRUE` / `FALSE`, or `NULL`.

### Not supported yet

One statement per request. `WHERE` takes a single condition — `AND` / `OR` are tokenized but not
parsed. There are no joins, no `ORDER BY`, `GROUP BY`, or `LIMIT`, and no aggregate functions.

---

## Errors

Failures return a consistent shape:

```json
{
  "statusCode": 400,
  "message": "UPDATE requires a WHERE condition",
  "data": null,
  "timestamp": "2026-08-19T09:46:55.373Z",
  "path": "/api/v1/sql/dml"
}
```

Common ones:

| Status | Message                                                  | Cause                                    |
| ------ | -------------------------------------------------------- | ---------------------------------------- |
| 400    | `No database is currently connected.`                     | You skipped the connect step             |
| 400    | `this method for DDL only`                                | Non-`CREATE`/`DROP` sent to `/sql/ddl`   |
| 400    | `this method for DML only`                                | `CREATE`/`DROP` sent to `/sql/dml`       |
| 400    | `statement can't be empty`                                | Empty or missing `statement`             |
| 400    | `UPDATE requires a WHERE condition`                       | `UPDATE` with no `WHERE`                 |
| 400    | `we prevent deleting without condition ...`               | `DELETE` with no `WHERE`                 |
| 400    | `Expected column name at line 1, column 8`                | Parse error — includes line and column   |
| 400    | `Unterminated string at line 1, column 37`                | Unclosed `'` literal                     |
| 400    | `table "t2" can have only one PRIMARY KEY`                | More than one `PRIMARY KEY`              |
| 400    | `Cannot drop the currently connected database.`           | `DROP DATABASE` on the active database   |
| 404    | `Schema ghost does not exist`                             | Unknown table                            |
| 409    | `Database shop already exists`                            | `CREATE DATABASE` with a name in use     |
