import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { created, ok } from 'src/shared/api-response';
import { DatabaseService } from './database.service';
import { CreateDatabaseDto } from './dtos/create-database.dto';

@Controller('database')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Post()
  async createDatabase(@Body() payload: CreateDatabaseDto) {
    await this.databaseService.create(payload.name);

    return created(`Database ${payload.name} created successfully`, {
      database: payload.name,
    });
  }

  @Post(':name/connect')
  async connectDatabase(@Param('name') name: string) {
    await this.databaseService.connect(name);

    return ok(`Connected to database ${name}`, { database: name });
  }

  @Delete(':name')
  async dropDatabase(@Param('name') name: string) {
    await this.databaseService.drop(name);

    return ok(`Database ${name} dropped successfully`, { database: name });
  }
}
