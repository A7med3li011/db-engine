export enum TokenType {
  KEYWORD,
  IDENTIFIER,
  NUMBER,
  STRING,
  BOOLEAN,
  NULL,
  OPERATOR,
  PUNCTUATION,
  EOF,
}

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  line: number;
  column: number;
}
