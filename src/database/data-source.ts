import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

// This module is the TypeORM CLI entry point for migrations, so it runs
// outside the Nest DI container and cannot reach ConfigService. It is the one
// place allowed to read process.env directly.
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  synchronize: false,
});
