import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: [
  fileURLToPath(new URL('../../.env.local', import.meta.url)),
  fileURLToPath(new URL('../../.env', import.meta.url)),
] });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();

