import { HttpException, Injectable } from '@nestjs/common';
import { Token, TokenType } from './token.interface';
import { KEYWORDS } from './keywords';

@Injectable()
export class TokenizerService {
  tokenize(sql: string): Token[] {
    const tokens: Token[] = [];

    let i = 0;
    let line = 1;
    let column = 1;

    while (i < sql.length) {

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
      if (
        /[0-9]/.test(sql[i]) ||
        (sql[i] === '-' && /[0-9]/.test(sql[i + 1]))
      ) {
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
        // 8
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

     
      if (['=', '>', '<'].includes(sql[i])) {
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

      // Pnuctuation
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
}
