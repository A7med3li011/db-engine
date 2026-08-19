import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, isExecutionResult } from '../api-response';

@Injectable()
export class ResponseInterceptor implements NestInterceptor<unknown, ApiResponse> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse> {
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((value: unknown) => {
        if (isExecutionResult(value)) {
          res.status(value.statusCode);

          return {
            statusCode: value.statusCode,
            message: value.message,
            data: value.data,
          };
        }

        return {
          statusCode: res.statusCode,
          message: 'Success',
          data: value ?? null,
        };
      }),
    );
  }
}
