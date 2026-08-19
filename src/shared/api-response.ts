import { HttpStatus } from '@nestjs/common';

const EXECUTION_RESULT = Symbol('EXECUTION_RESULT');

export interface ApiResponse<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
}

export interface ExecutionResult<T = unknown> extends ApiResponse<T> {
  [EXECUTION_RESULT]: true;
}

export const ok = <T>(message: string, data: T): ExecutionResult<T> => ({
  [EXECUTION_RESULT]: true,
  statusCode: HttpStatus.OK,
  message,
  data,
});

export const created = <T>(message: string, data: T): ExecutionResult<T> => ({
  [EXECUTION_RESULT]: true,
  statusCode: HttpStatus.CREATED,
  message,
  data,
});

export const isExecutionResult = (value: unknown): value is ExecutionResult =>
  typeof value === 'object' && value !== null && EXECUTION_RESULT in value;
