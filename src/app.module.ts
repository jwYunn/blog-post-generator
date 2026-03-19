import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TopicSeedModule } from './topic-seed/topic-seed.module';
import { TopicGenerateModule } from './topic-generate/topic-generate.module';
import { TopicCandidateModule } from './topic-candidate/topic-candidate.module';
import { ArticleDraftModule } from './article-draft/article-draft.module';
import { ArticleOutlineModule } from './article-outline/article-outline.module';
import { ArticleContentModule } from './article-content/article-content.module';
import { ArticleThumbnailModule } from './article-thumbnail/article-thumbnail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST', 'localhost'),
        port: configService.get<number>('POSTGRES_PORT', 5432),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
      }),
    }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
    TopicSeedModule,
    TopicGenerateModule,
    TopicCandidateModule,
    ArticleDraftModule,
    ArticleOutlineModule,
    ArticleContentModule,
    ArticleThumbnailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
