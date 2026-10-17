import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PosterService } from './poster.service.js';

@Controller('poster')
export class PosterController {
  constructor(private readonly poster: PosterService) {}
  @Get('sync')
  sync(@Headers('authorization') authorization?: string) {
    const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
    if (!authorization || !expected || Buffer.byteLength(authorization) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))) throw new UnauthorizedException();
    return this.poster.sync();
  }
}
