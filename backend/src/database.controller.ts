import { Controller, Get, Header, Query, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';

@Controller('database')
export class DatabaseController {
  constructor(private readonly database: DatabaseService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Query('probe') probe?: string) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new NotFoundException();
    return this.database.status((probe ?? randomUUID()).slice(0, 128));
  }
}
