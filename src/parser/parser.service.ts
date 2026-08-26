import { HttpException, Injectable } from '@nestjs/common';

import {
  ColumnDefinition,
  ColumnType,
} from 'src/table/interfaces/table-schema.interface';
import { ExecutorService } from 'src/executor/executor.service';
import { Token, TokenType } from 'src/tokenizer/token.interface';

const COLUMN_TYPES: ReadonlySet<string> = new Set<string>(
  Object.values(ColumnType),
);
@Injectable()
export class ParserService {
  constructor(private readonly executorService: ExecutorService) {}
  parse(tokens: Token[]) {
    const firstToken = tokens[0];

    if (!firstToken || firstToken.type === TokenType.EOF) {
      throw new HttpException('Empty statement', 400);
    }

    const firstTokenValue = firstToken.value.toUpperCase();
    const secondTokenValue = tokens[1]?.value?.toUpperCase() ?? '';
    let obj: any = null;

    if (firstTokenValue === 'SELECT') {
      obj = this.parseSelect(tokens);
    }

    if (firstTokenValue === 'INSERT') {
      obj = this.parseInsert(tokens);
    }

    if (firstTokenValue === 'UPDATE') {
      obj = this.parseUpdate(tokens);
    }

    if (firstTokenValue === 'DELETE') {
      obj = this.parseDelete(tokens);
    }

    if (firstTokenValue === 'CREATE' && secondTokenValue === 'DATABASE') {
      obj = this.ParseCreateDB(tokens);
    }
    if (firstTokenValue === 'CREATE' && secondTokenValue === 'TABLE') {
      obj = this.ParseCreateTable(tokens);
    }
    if (firstTokenValue === 'DROP' && secondTokenValue === 'DATABASE') {
      obj = this.ParseDropDatabase(tokens);
    }
    if (firstTokenValue === 'DROP' && secondTokenValue === 'TABLE') {
      obj = this.ParseDropTable(tokens);
    }

    if (obj === null) {
      throw new HttpException(`Unexpected token "${firstToken.value}"`, 400);
    }

    console.log(obj, 'parser');

    return this.executorService.executeDDL(obj);
  }
  private parseSelect(tokens: Token[]) {
    let position = 0;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position].value.toUpperCase() !== 'SELECT'
    ) {
      throw new HttpException(`Expected SELECT`, 400);
    }

    position++;

    const columns: string[] = [];
    while (true) {
      const token = tokens[position];

      if (token.type !== TokenType.IDENTIFIER && token.value != '*') {
        throw new HttpException(
          `Expected column name at line ${token.line}, column ${token.column}`,
          400,
        );
      }

      columns.push(token.value);
      position++;

      if (
        tokens[position].type !== TokenType.PUNCTUATION ||
        tokens[position].value !== ','
      ) {
        break;
      }

      position++;
    }

    const fromToken = tokens[position];

    if (
      fromToken.type !== TokenType.KEYWORD ||
      fromToken.value.toUpperCase() !== 'FROM'
    ) {
      throw new HttpException(`Expected FROM after columns name`, 400);
    }

    position++;

    const tableToken = tokens[position];

    if (tableToken.type !== TokenType.IDENTIFIER) {
      throw new HttpException(`Expected table name after 'FROM' keyword`, 400);
    }

    const from = tableToken.value;

    position++;

    let where: {
      column: string;
      operator: string;
      value: string | number | boolean | null;
    } | null = null;

    if (
      tokens[position].type === TokenType.KEYWORD &&
      tokens[position].value.toUpperCase() === 'WHERE'
    ) {
      position++;

      const columnToken = tokens[position];

      if (columnToken.type !== TokenType.IDENTIFIER) {
        throw new HttpException(`Expected column name after WHERE`, 400);
      }

      const column = columnToken.value;

      position++;

      const operatorToken = tokens[position];

      if (operatorToken.type !== TokenType.OPERATOR) {
        throw new HttpException(`Expected operator after "${column}"`, 400);
      }

      const operator = operatorToken.value;

      position++;

      const valueToken = tokens[position];

      const value = this.parseValue(valueToken);

      position++;

      where = {
        column,
        operator,
        value,
      };
    }

    if (tokens[position].type !== TokenType.EOF) {
      throw new HttpException(
        `Unexpected token "${tokens[position].value}"`,
        400,
      );
    }

    return {
      type: 'SELECT',
      columns,
      from,
      where,
    };
  }
  private parseDelete(tokens: Token[]) {
    let position = 0;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position].value.toUpperCase() !== 'DELETE'
    ) {
      throw new HttpException(`Expected DELETE`, 400);
    }

    position++;

    const fromToken = tokens[position];

    if (
      fromToken.type !== TokenType.KEYWORD ||
      fromToken.value.toUpperCase() !== 'FROM'
    ) {
      throw new HttpException(`Expected FROM 'DELETE' keyword`, 400);
    }

    position++;

    const tableToken = tokens[position];

    if (tableToken.type !== TokenType.IDENTIFIER) {
      throw new HttpException(`Expected table name after 'FROM' keyword`, 400);
    }

    const from = tableToken.value;

    position++;

    let where: {
      column: string;
      operator: string;
      value: string | number | boolean | null;
    } | null = null;

    if (
      tokens[position].type === TokenType.KEYWORD &&
      tokens[position].value.toUpperCase() === 'WHERE'
    ) {
      position++;

      const columnToken = tokens[position];

      if (columnToken.type !== TokenType.IDENTIFIER) {
        throw new HttpException(`Expected column name after WHERE`, 400);
      }

      const column = columnToken.value;

      position++;

      const operatorToken = tokens[position];

      if (operatorToken.type !== TokenType.OPERATOR) {
        throw new HttpException(`Expected operator after "${column}"`, 400);
      }

      const operator = operatorToken.value;

      position++;

      const valueToken = tokens[position];

      const value = this.parseValue(valueToken);

      position++;

      where = {
        column,
        operator,
        value,
      };
    }

    if (tokens[position].type !== TokenType.EOF) {
      throw new HttpException(
        `Unexpected token "${tokens[position].value}"`,
        400,
      );
    }

    if (!where) {
      throw new HttpException(
        `we prevent deleting without condition to avoid delete all rows by accident   "${tokens[position].value}"`,
        400,
      );
    }

    return {
      type: 'DELETE',
      from,
      where,
    };
  }

  private parseInsert(tokens: Token[]) {
    let position = 0;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position].value.toUpperCase() !== 'INSERT'
    ) {
      throw new HttpException(`Expected INSERT`, 400);
    }
    position++;

    if (
      tokens[position].type != TokenType.KEYWORD ||
      tokens[position].value.toLowerCase() !== 'into'
    ) {
      throw new HttpException(`Expected INTO after INSERT`, 400);
    }
    position++;

    if (tokens[position].type != TokenType.IDENTIFIER) {
      throw new HttpException(`Expected TableName after INTO`, 400);
    }

    const table = tokens[position].value;
    position++;

    if (
      tokens[position].type != TokenType.PUNCTUATION ||
      tokens[position].value != '('
    ) {
      throw new HttpException(`Expected '(' after ${table}`, 400);
    }
    position++;
    const columns: string[] = [];
    while (true) {
      if (tokens[position].type !== TokenType.IDENTIFIER) {
        throw new HttpException(`Expected column name`, 400);
      }

      columns.push(tokens[position].value);
      position++;

      if (
        tokens[position].type === TokenType.PUNCTUATION &&
        tokens[position].value === ')'
      ) {
        position++;
        break;
      }

      if (
        tokens[position].type !== TokenType.PUNCTUATION ||
        tokens[position].value !== ','
      ) {
        throw new HttpException(`Expected ',' or ')' after column`, 400);
      }

      position++;
    }

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position].value.toLowerCase() !== 'values'
    ) {
      throw new HttpException(`Expected values keyword`, 400);
    }
    position++;

    if (
      tokens[position].type != TokenType.PUNCTUATION ||
      tokens[position].value != '('
    ) {
      throw new HttpException(`Expected '(' after values keyword`, 400);
    }

    position++;
    const values: (string | number | boolean | null)[] = [];
    while (true) {
      if (
        tokens[position].type !== TokenType.IDENTIFIER &&
        tokens[position].type !== TokenType.NUMBER &&
        tokens[position].type !== TokenType.BOOLEAN &&
        tokens[position].type !== TokenType.STRING &&
        tokens[position].value.toUpperCase() != 'NULL' &&
        tokens[position].value.toUpperCase() != 'TRUE' &&
        tokens[position].value.toUpperCase() != 'FALSE'
      ) {
        throw new HttpException(`Expected column value`, 400);
      }
      if (tokens[position].type == TokenType.NUMBER) {
        values.push(Number(tokens[position].value));
      } else if (
        tokens[position].type == TokenType.KEYWORD &&
        (tokens[position].value == 'true' || tokens[position].value == 'false')
      ) {
        const v = tokens[position].value === 'true' ? true : false;
        values.push(v);
      } else {
        values.push(tokens[position].value);
      }
      position++;

      if (
        tokens[position].type === TokenType.PUNCTUATION &&
        tokens[position].value === ')'
      ) {
        position++;
        break;
      }

      if (
        tokens[position].type !== TokenType.PUNCTUATION ||
        tokens[position].value !== ','
      ) {
        throw new HttpException(`Expected ',' or ')' after each value`, 400);
      }

      position++;
    }

    if (columns.length !== values.length) {
      throw new HttpException(
        `number of columns not match number of values `,
        400,
      );
    }

    return {
      type: 'INSERT',
      table,
      columns,
      values,
    };
  }

  private parseUpdate(tokens: Token[]) {
    let position = 0;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position].value.toUpperCase() !== 'UPDATE'
    ) {
      throw new HttpException(`Expected UPDATE`, 400);
    }

    position++;

    const tableToken = tokens[position];

    if (tableToken.type !== TokenType.IDENTIFIER) {
      throw new HttpException(
        `Expected table name after 'update' keyword "`,
        400,
      );
    }

    const table = tableToken.value;
    position++;

    const setToken = tokens[position];

    if (
      setToken.type !== TokenType.KEYWORD ||
      setToken.value.toUpperCase() !== 'SET'
    ) {
      throw new HttpException(`Expected SET after ${table}`, 400);
    }

    position++;

    const updates: Record<string, string | number | boolean | null> = {};

    while (true) {
      const columnToken = tokens[position];

      if (columnToken.type !== TokenType.IDENTIFIER) {
        throw new HttpException(`Expected column name after SET`, 400);
      }

      const column = columnToken.value;
      position++;

      const operatorToken = tokens[position];

      if (
        operatorToken.type !== TokenType.OPERATOR ||
        operatorToken.value !== '='
      ) {
        throw new HttpException(`Expected '=' after "${column}"`, 400);
      }

      position++;

      const valueToken = tokens[position];
      const value = this.parseValue(valueToken);

      updates[column] = value;

      position++;

      if (
        tokens[position].type === TokenType.PUNCTUATION &&
        tokens[position].value === ','
      ) {
        position++;
        continue;
      }

      break;
    }

    let where: {
      column: string;
      operator: string;
      value: string | number | boolean | null;
    } | null = null;

    if (
      tokens[position].type === TokenType.KEYWORD &&
      tokens[position].value.toUpperCase() === 'WHERE'
    ) {
      position++;

      const columnToken = tokens[position];

      if (columnToken.type !== TokenType.IDENTIFIER) {
        throw new HttpException(`Expected column name after WHERE`, 400);
      }

      const column = columnToken.value;
      position++;

      const operatorToken = tokens[position];

      if (operatorToken.type !== TokenType.OPERATOR) {
        throw new HttpException(`Expected operator after "${column}"`, 400);
      }

      const operator = operatorToken.value;
      position++;

      const valueToken = tokens[position];
      const value = this.parseValue(valueToken);

      position++;

      where = {
        column,
        operator,
        value,
      };
    }

    if (!where) {
      throw new HttpException(`UPDATE requires a WHERE condition`, 400);
    }

    if (tokens[position].type !== TokenType.EOF) {
      throw new HttpException(
        `Unexpected token "${tokens[position].value}"`,
        400,
      );
    }

    return {
      type: 'UPDATE',
      table,
      updates,
      where,
    };
  }

  private ParseCreateDB(tokens: Token[]) {
    let position = 0;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position]?.value?.toUpperCase() !== 'CREATE'
    ) {
      throw new HttpException('Expected Create', 400);
    }
    position++;

    if (
      tokens[position].type !== TokenType.IDENTIFIER ||
      tokens[position]?.value?.toUpperCase() !== 'DATABASE'
    ) {
      throw new HttpException(`Expected 'DATABASE keyword after Create'`, 400);
    }
    position++;

    if (tokens[position].type !== TokenType.IDENTIFIER) {
      throw new HttpException(`Expected DATABASE Name`, 400);
    }
    return {
      type: 'CREATE',
      databaseName: tokens[position].value.toLowerCase(),
    };
  }
  // CREATE TABLE product (id SERIAL PRIMARY KEY, title VARCHAR(50) NOT NULL)
  private ParseCreateTable(tokens: Token[]) {
    let position = 0;
    const obj: {
      type: string;
      tableName: string;
      columns: ColumnDefinition[];
    } = {
      type: 'CREATE',
      tableName: '',
      columns: [],
    };

    const word = () => tokens[position].value.toUpperCase();

    if (tokens[position].type !== TokenType.KEYWORD || word() !== 'CREATE')
      throw new HttpException("expected 'CREATE' as keyword", 400);

    position++;

    if (tokens[position].type !== TokenType.KEYWORD || word() !== 'TABLE')
      throw new HttpException("expected TABLE  after 'CREATE' keyword", 400);

    position++;

    if (tokens[position].type !== TokenType.IDENTIFIER)
      throw new HttpException(`expected table name after 'TABLE' keyword`, 400);

    obj.tableName = tokens[position].value;
    position++;

    if (
      tokens[position].type !== TokenType.PUNCTUATION ||
      tokens[position].value !== '('
    )
      throw new HttpException(`expected '(' after ${obj.tableName}`, 400);

    position++;

    while (true) {
      if (
        tokens[position].type === TokenType.PUNCTUATION &&
        tokens[position].value === ')'
      ) {
        position++;
        break;
      }

      if (obj.columns.length > 0) {
        if (
          tokens[position].type !== TokenType.PUNCTUATION ||
          tokens[position].value !== ','
        )
          throw new HttpException(`expected ',' or ')' `, 400);
        position++;
      }

      if (tokens[position].type !== TokenType.IDENTIFIER)
        throw new HttpException(`expected a column name after '('`, 400);

      const name = tokens[position].value;
      position++;

      if (
        tokens[position].type !== TokenType.KEYWORD ||
        !COLUMN_TYPES.has(word())
      )
        throw new HttpException(`expected a type for column "${name}"`, 400);

      const column: ColumnDefinition = {
        name,
        type: word() as ColumnType,
        nullable: true,
      };
      position++;

      if (column.type === ColumnType.SERIAL) {
        column.type = ColumnType.INTEGER;
        column.autoIncrement = true;
        column.nullable = false;
      }

      if (
        column.type === ColumnType.VARCHAR &&
        tokens[position].type === TokenType.PUNCTUATION &&
        tokens[position].value === '('
      ) {
        position++;

        if (tokens[position].type !== TokenType.NUMBER)
          throw new HttpException(
            `expected a number inside VARCHAR( ) for column "${name}"`,
            400,
          );

        column.length = Number(tokens[position].value);
        position++;

        if (column.length <= 0)
          throw new HttpException(
            `VARCHAR size for column "${name}" must be bigger than 0`,
            400,
          );

        if (tokens[position].value !== ')')
          throw new HttpException(
            `expected ')' after VARCHAR(${column.length} `,
            400,
          );

        position++;
      }

      while (tokens[position].type === TokenType.KEYWORD) {
        if (word() === 'PRIMARY') {
          position++;
          if (word() !== 'KEY')
            throw new HttpException(`expected 'KEY' after 'PRIMARY' `, 400);
          position++;
          column.primaryKey = true;
          column.nullable = false;
        } else if (word() === 'UNIQUE') {
          position++;
          column.unique = true;
        } else if (word() === 'NOT') {
          position++;
          if (word() !== 'NULL')
            throw new HttpException(
              `expected 'NULL' after 'not' keyword `,
              400,
            );
          position++;
          column.nullable = false;
        } else if (word() === 'DEFAULT') {
          position++;
          if (tokens[position].type === TokenType.NUMBER)
            column.default = Number(tokens[position].value);
          else if (tokens[position].type === TokenType.STRING)
            column.default = tokens[position].value;
          else if (word() === 'TRUE') column.default = true;
          else if (word() === 'FALSE') column.default = false;
          else if (word() === 'NULL') column.default = null;
          else
            throw new HttpException(
              `unkonwn DEFAULT value for column "${name}"`,
              400,
            );
          position++;
        } else {
          break;
        }
      }

      if (tokens[position].value !== ',' && tokens[position].value !== ')')
        throw new HttpException(`unexpected  after column "${name}"`, 400);

      obj.columns.push(column);
    }

    if (obj.columns.filter((column) => column.primaryKey).length > 1)
      throw new HttpException(
        `table "${obj.tableName}" can have only one PRIMARY KEY`,
        400,
      );

    return obj;
  }
  private ParseDropDatabase(tokens: Token[]) {
    let position = 0;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position]?.value?.toUpperCase() !== 'DROP'
    ) {
      throw new HttpException('Expected DROP', 400);
    }
    position++;

    if (
      tokens[position].type !== TokenType.IDENTIFIER ||
      tokens[position]?.value?.toUpperCase() !== 'DATABASE'
    ) {
      throw new HttpException(`Expected 'DATABASE keyword after DROP'`, 400);
    }
    position++;

    if (tokens[position].type !== TokenType.IDENTIFIER) {
      throw new HttpException(`Expected DATABASE Name`, 400);
    }
    return {
      type: 'DROP',
      databaseName: tokens[position].value.toLowerCase(),
    };
  }
  private ParseDropTable(tokens: Token[]) {
    let position = 0;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position]?.value?.toUpperCase() !== 'DROP'
    ) {
      throw new HttpException('Expected DROP', 400);
    }
    position++;

    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position]?.value?.toUpperCase() !== 'TABLE'
    ) {
      throw new HttpException(`Expected 'TABLE keyword after DROP'`, 400);
    }
    position++;

    if (tokens[position].type !== TokenType.IDENTIFIER) {
      throw new HttpException(`Expected TABLE Name`, 400);
    }
    return {
      type: 'DROP',
      tableName: tokens[position].value.toLowerCase(),
    };
  }

  private parseValue(valueToken: Token): string | number | boolean | null {
    switch (valueToken.type) {
      case TokenType.STRING:
        return valueToken.value;
      case TokenType.NUMBER:
        return Number(valueToken.value);
      case TokenType.BOOLEAN:
        return valueToken.value.toLowerCase() === 'true';
      case TokenType.NULL:
        return null;
      case TokenType.IDENTIFIER:
        return valueToken.value;
      default:
        throw new HttpException(
          `Unexpected value token "${valueToken.value}"`,
          400,
        );
    }
  }
}
