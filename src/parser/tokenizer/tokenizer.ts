import { HttpException } from '@nestjs/common';
import { KEYWORDS } from './keywords';
import { Token, TokenType } from './token.interface';
import { Row } from 'src/table/interfaces/table-schema.interface';

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];

  let i = 0;
  let line = 1;
  let column = 1;

  while (i < sql.length) {
    // Whitespace
    if (/\s/.test(sql[i])) {
      if (sql[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }

      i++;
      continue;
    }

    // Comment
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i++;
        column++;
      }

      continue;
    }

    // Number / Negative Number
    if (/[0-9]/.test(sql[i]) || (sql[i] === '-' && /[0-9]/.test(sql[i + 1]))) {
      const start = i;
      const startColumn = column;

      if (sql[i] === '-') {
        i++;
        column++;
      }

      while (i < sql.length && /[0-9]/.test(sql[i])) {
        i++;
        column++;
      }

      tokens.push({
        type: TokenType.NUMBER,
        value: sql.slice(start, i),
        start,
        line,
        column: startColumn,
      });

      continue;
    }

    // Identifier / Keyword
    if (/[a-zA-Z_]/.test(sql[i])) {
      const start = i;
      const startColumn = column;

      while (i < sql.length && /[a-zA-Z0-9_]/.test(sql[i])) {
        i++;
        column++;
      }

      const value = sql.slice(start, i);
      const upperValue = value.toUpperCase();

      tokens.push({
        type: KEYWORDS.has(upperValue)
          ? TokenType.KEYWORD
          : TokenType.IDENTIFIER,
        value,
        start,
        line,
        column: startColumn,
      });

      continue;
    }

    // String
    if (sql[i] === "'") {
      const start = i;
      const startColumn = column;
      let closed = false;
      i++;
      column++;

      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            column += 2;
            continue;
          }

          i++;
          column++;
          closed = true;
          break;
        }

        if (sql[i] === '\n') {
          line++;
          column = 1;
          i++;
          continue;
        }

        i++;
        column++;
      }

      if (!closed) {
        throw new HttpException(
          `Unterminated string at line ${line}, column ${startColumn}`,
          400,
        );
      }

      tokens.push({
        type: TokenType.STRING,
        value: sql.slice(start + 1, i - 1),
        start,
        line,
        column: startColumn,
      });

      continue;
    }

    // Two-character operators
    const twoCharOperator = sql.slice(i, i + 2);

    if (['>=', '<=', '!=', '<>'].includes(twoCharOperator)) {
      tokens.push({
        type: TokenType.OPERATOR,
        value: twoCharOperator,
        start: i,
        line,
        column,
      });

      i += 2;
      column += 2;

      continue;
    }

    // One-character operators
    if (['=', '>', '<', '-'].includes(sql[i])) {
      tokens.push({
        type: TokenType.OPERATOR,
        value: sql[i],
        start: i,
        line,
        column,
      });

      i++;
      column++;

      continue;
    }

    // Punctuation
    if (['(', ')', ',', ';', '*', '.'].includes(sql[i])) {
      tokens.push({
        type: TokenType.PUNCTUATION,
        value: sql[i],
        start: i,
        line,
        column,
      });

      i++;
      column++;

      continue;
    }

    // Unknown character
    throw new HttpException(
      `Unexpected character "${sql[i]}" at line ${line}, column ${column}`,
      400,
    );
  }

  // EOF
  tokens.push({
    type: TokenType.EOF,
    value: '',
    start: i,
    line,
    column,
  });

  return tokens;
}

export function parse(tokens: Token[]) {
  
  const firstToken = tokens[0];
  console.log(firstToken);
  console.log(tokens);

  let obj: any = {};

  if (
    firstToken.value.toUpperCase() === 'CREATE' &&
    tokens[1].value.toUpperCase() === 'TABLE'
  ) {
    obj = ParseCreateTable(tokens);
  }

  console.log(obj);
  // throw new HttpException(`Unexpected token "${firstToken.value}"`, 400);
}

function ParseCreateTable(tokens: Token[]) {
  let position = 0;
  const obj: {
    type: string;
    tableName: string;
    columns: any[];
  } = {
    type: 'CREATE',
    tableName: '',
    columns: [],
  };

  if (
    tokens[position].type !== TokenType.KEYWORD ||
    tokens[position].value.toUpperCase() !== 'CREATE'
  )
    throw new HttpException("expected 'create' as keyword", 400);

  position++;

  if (
    tokens[position].type !== TokenType.KEYWORD ||
    tokens[position].value.toUpperCase() !== 'TABLE'
  )
    throw new HttpException("expected 'TABLE' as keyword after create", 400);

  position++;

  if (tokens[position].type !== TokenType.IDENTIFIER)
    throw new HttpException('expected table name after Table', 400);

  obj.tableName = tokens[position].value;
  position++;

  if (tokens[position].type !== TokenType.PUNCTUATION)
    throw new HttpException(
      `expected  '(' as a symbol after ${obj.tableName}`,
      400,
    );

  position++;
  let iteration = 0;
  while (true) {
    console.log(iteration);
    iteration++;
    console.log(iteration, tokens[position].value, position);
    if (
      tokens[position].type === TokenType.PUNCTUATION &&
      tokens[position].value === ')'
    ) {
      position++;
      break;
    }
    if (
      tokens[position].type === TokenType.PUNCTUATION &&
      tokens[position].value === ','
    ) {
      position++;
      continue;
    }
    const row: Row = {};
    row.nullable = true;
    if (tokens[position].type !== TokenType.IDENTIFIER) {
      throw new HttpException(`expected column name after '(' `, 400);
    }
    row.name = tokens[position].value;
    position++;

    if (tokens[position].type !== TokenType.KEYWORD) {
      throw new HttpException(`expected column type after his name  `, 400);
    }
    row.type = tokens[position].value;
    position++;
    if (
      tokens[position - 1].value.toUpperCase() === 'VARCHAR' &&
      tokens[position].type === TokenType.PUNCTUATION &&
      tokens[position].value === '('
    ) {
      position++;
      if (tokens[position].type !== TokenType.NUMBER) {
        throw new HttpException(`expected number  after VARCHAR(  `, 400);
      }
      row.length = tokens[position].value;
      position++;
      if (
        tokens[position].type !== TokenType.PUNCTUATION ||
        tokens[position].value !== ')'
      ) {
        throw new HttpException(
          `expected )  after VARCHAR(${row?.length as string}  `,
          400,
        );
      }
      position++;
    }

    if (
      tokens[position].type === TokenType.KEYWORD &&
      tokens[position].value.toUpperCase() === 'PRIMARY' &&
      tokens[position + 1].type === TokenType.KEYWORD &&
      tokens[position + 1].value.toUpperCase() === 'KEY'
    ) {
      row.primaryKey = true;
      row.nullable = false;
      position += 2;
    }
    if (
      tokens[position].type === TokenType.KEYWORD &&
      tokens[position].value.toUpperCase() === 'UNIQUE'
    ) {
      row.unique = true;
      position++;
    }

    if (
      tokens[position].type === TokenType.KEYWORD &&
      tokens[position].value.toUpperCase() === 'NOT' &&
      tokens[position + 1].type === TokenType.KEYWORD &&
      tokens[position + 1].value.toUpperCase() === 'NULL'
    ) {
      row.nullable = false;
      position += 2;
    }
    if (
      tokens[position].type === TokenType.KEYWORD &&
      tokens[position].value.toUpperCase() === 'DEFAULT' &&
      (tokens[position + 1].type === TokenType.KEYWORD ||
        tokens[position + 1].type === TokenType.NUMBER ||
        tokens[position + 1].type === TokenType.STRING)
    ) {
      row.default = tokens[position + 1].value;
      position += 2;
    }

    obj.columns.push(row);
  }

  return obj;
}
