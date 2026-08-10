import { HttpException, Injectable } from '@nestjs/common';
import { Token, TokenType } from './tokenizer/token.interface';
import { Row } from 'src/table/interfaces/table-schema.interface';

@Injectable()
export class ParserService {
  parse(tokens: Token[]) {
    const firstToken = tokens[0];
    console.log(firstToken);
    console.log(tokens);

    let obj: any = {};

    if (firstToken.value.toUpperCase() === 'SELECT') {
      obj = this.parseSelect(tokens);
    }

    if (firstToken.value.toUpperCase() === 'INSERT') {
      obj = this.parseInsert(tokens);
    }

    if (firstToken.value.toUpperCase() === 'UPDATE') {
      obj = this.parseUpdate(tokens);
    }

    if (firstToken.value.toUpperCase() === 'DELETE') {
      obj = this.parseDelete(tokens);
    }

    if (
      firstToken.value.toUpperCase() === 'CREATE' &&
      tokens[1].value.toUpperCase() === 'DATABASE'
    ) {
      obj = this.ParseCreateDB(tokens);
    }
    if (
      firstToken.value.toUpperCase() === 'CREATE' &&
      tokens[1].value.toUpperCase() === 'TABLE'
    ) {
      obj = this.ParseCreateTable(tokens);
    }
    if (
      firstToken.value.toUpperCase() === 'DROP' &&
      tokens[1].value.toUpperCase() === 'DATABASE'
    ) {
      obj = this.ParseDropDatabase(tokens);
    }
    if (
      firstToken.value.toUpperCase() === 'DROP' &&
      tokens[1].value.toUpperCase() === 'TABLE'
    ) {
      obj = this.ParseDropTable(tokens);
    }
    console.log(obj);
    // throw new HttpException(`Unexpected token "${firstToken.value}"`, 400);
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
      throw new HttpException(
        `Expected FROM at line ${fromToken.line}, column ${fromToken.column}`,
        400,
      );
    }

    position++;

    const tableToken = tokens[position];

    if (tableToken.type !== TokenType.IDENTIFIER) {
      throw new HttpException(
        `Expected table name at line ${tableToken.line}, column ${tableToken.column}`,
        400,
      );
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
      throw new HttpException(
        `Expected FROM at line ${fromToken.line}, column ${fromToken.column}`,
        400,
      );
    }

    position++;

    const tableToken = tokens[position];

    if (tableToken.type !== TokenType.IDENTIFIER) {
      throw new HttpException(
        `Expected table name at line ${tableToken.line}, column ${tableToken.column}`,
        400,
      );
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
  // insert into user (name , age) values (ahmed,4)
  /*
    {
      type: 'INSERT',
      table: 'users',
      columns: ['name', 'age'],
      values: ['Ahmed', 25],
    }
    */
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
    const values: string[] = [];
    while (true) {
      console.log(tokens[position], position);
      if (
        tokens[position].type !== TokenType.IDENTIFIER &&
        tokens[position].type !== TokenType.NUMBER &&
        tokens[position].type !== TokenType.BOOLEAN &&
        tokens[position].type !== TokenType.STRING &&
        tokens[position].value.toUpperCase() != 'NULL' &&
        tokens[position].value.toUpperCase() != 'TRUE' &&
        tokens[position].value.toUpperCase() != 'FALSE'
      ) {
        console.log(tokens[position].value, tokens[position].type);
        throw new HttpException(`Expected column value`, 400);
      }

      values.push(tokens[position].value);
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

    // UPDATE
    if (
      tokens[position].type !== TokenType.KEYWORD ||
      tokens[position].value.toUpperCase() !== 'UPDATE'
    ) {
      throw new HttpException(`Expected UPDATE`, 400);
    }

    position++;

    // table name
    const tableToken = tokens[position];

    if (tableToken.type !== TokenType.IDENTIFIER) {
      throw new HttpException(
        `Expected table name at line ${tableToken.line}, column ${tableToken.column}`,
        400,
      );
    }

    const table = tableToken.value;
    position++;

    // SET
    const setToken = tokens[position];

    if (
      setToken.type !== TokenType.KEYWORD ||
      setToken.value.toUpperCase() !== 'SET'
    ) {
      throw new HttpException(
        `Expected SET at line ${setToken.line}, column ${setToken.column}`,
        400,
      );
    }

    position++;

    // updates
    const updates: Record<string, string | number | boolean | null> = {};

    while (true) {
      // column name
      const columnToken = tokens[position];

      if (columnToken.type !== TokenType.IDENTIFIER) {
        throw new HttpException(`Expected column name after SET`, 400);
      }

      const column = columnToken.value;
      position++;

      // =
      const operatorToken = tokens[position];

      if (
        operatorToken.type !== TokenType.OPERATOR ||
        operatorToken.value !== '='
      ) {
        throw new HttpException(`Expected '=' after "${column}"`, 400);
      }

      position++;

      // value
      const valueToken = tokens[position];
      const value = this.parseValue(valueToken);

      updates[column] = value;

      position++;

      // comma -> another update
      if (
        tokens[position].type === TokenType.PUNCTUATION &&
        tokens[position].value === ','
      ) {
        position++;
        continue;
      }

      break;
    }

    // WHERE
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

    // prevent UPDATE without WHERE
    if (!where) {
      throw new HttpException(`UPDATE requires a WHERE condition`, 400);
    }

    // must be EOF
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
  private ParseCreateTable(tokens: Token[]) {
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
