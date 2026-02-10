import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerCfg = new DocumentBuilder()
    .setTitle('Energy Ingestion Engine')
    .setDescription('High-scale energy meter data ingestion & analytics API')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerCfg));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Server listening on http://localhost:${port}`);
  logger.log(`Swagger docs  → http://localhost:${port}/docs`);
  logger.log(`Health check  → http://localhost:${port}/health`);
}

bootstrap();
