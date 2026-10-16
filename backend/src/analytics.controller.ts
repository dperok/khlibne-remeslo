import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service.js';
import { AdminAuthService } from './admin-auth.service.js';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService, private readonly auth: AdminAuthService) {}
  @Post('visit')
  record(@Req() request: Request, @Body() body: Parameters<AnalyticsService['record']>[0]) {
    this.auth.checkOrigin(request);
    return this.analytics.record(body);
  }
}
