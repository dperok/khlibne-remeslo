import { Controller, Get, Header, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';

@Controller('database')
export class DatabaseController {
  constructor(private readonly database: DatabaseService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Query('probe') probe?: string) {
    return this.database.status((probe ?? randomUUID()).slice(0, 128));
  }
}
