import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './shared/interceptors/transform.interceptor';
import { parse, tokenize } from './parser/tokenizer/tokenizer';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1/');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}

const res = tokenize(`CREATE TABLE users 
  ,
  id INTEGER,
  name INTEGER,
  age INTEGER defauLt 20,
);`);

parse(res);

bootstrap();
