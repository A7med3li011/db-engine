import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDatabaseDto {
  @IsString()
  @IsNotEmpty({
    message: 'The name field must be empty when creating a database.',
  })
  name!: string;
}
