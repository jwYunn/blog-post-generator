import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN'),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Without this Nest ignores SIGTERM and the process dies mid-job on redeploy.
  // The publish worker drives a live Tistory editor session and is not retried
  // when it stalls, so an abrupt kill can leave a half-created post behind.
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 3000);
  // Bind to all interfaces so the app is reachable from outside its container
  await app.listen(port, '0.0.0.0');
}
bootstrap();
