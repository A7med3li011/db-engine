import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CreateDatabaseDto } from './dtos/create-database.dto';

@Controller('database')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Post()
  async createDatabase(@Body() payload: CreateDatabaseDto) {
    await this.databaseService.create(payload.name);
    return { message: `Database ${payload.name} created successfully.` };
  }

  @Post(':name/connect')
  async connectDatabase(@Param('name') name: string) {
    await this.databaseService.connect(name);
  }

  @Delete(':name')
  async dropDatabase(@Param('name') name: string) {
    await this.databaseService.drop(name);
  }
}
