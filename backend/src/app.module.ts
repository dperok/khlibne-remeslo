import { OrdersService } from './orders.service.js';
import { OrdersController, AdminOrdersController } from './orders.controller.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseController } from './database.controller.js';
import { DatabaseService } from './database.service.js';
import { CatalogController } from './catalog.controller.js';
import { ContentService } from './content.service.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { TelegramService } from './telegram.service.js';
import { BotCommandsService } from './bot-commands.service.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { SupportRepository } from './support.repository.js';
import { BotInteractionsService } from './bot-interactions.service.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { PosterService } from './poster.service.js';
import { PosterController } from './poster.controller.js';

@Module({
  imports: [],
  controllers: [OrdersController, AdminOrdersController, AppController, DatabaseController, CatalogController, AdminController, AnalyticsController, TelegramWebhookController, PosterController],
  providers: [OrdersService, AppService, DatabaseService, ContentService, AdminAuthService, BotCommandsService, TelegramService, AnalyticsService, SupportRepository, BotInteractionsService, PosterService],
})
export class AppModule {}
