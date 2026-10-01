import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { InitialSchema20261001000000 } from './initial-schema.migration.js';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is required for migrations');

export default new DataSource({
  type: 'postgres',
  url,
  ssl: process.env['DATABASE_SSL'] === 'true' ? { rejectUnauthorized: true } : false,
  synchronize: false,
  migrationsRun: false,
  migrations: [InitialSchema20261001000000],
});
