import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

export default defineConfig({
  driver: PostgreSqlDriver,
  host: process.env['DATABASE_HOST'] || 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] || '5432', 10),
  user: process.env['DATABASE_USER'] || 'postgres',
  password: process.env['DATABASE_PASSWORD'] || 'postgres',
  dbName: process.env['DATABASE_NAME'] || 'eurocomply',
  schema: 'public',
  entities: ['./dist/entities/**/*.js'],
  entitiesTs: ['./src/entities/**/*.ts'],
  metadataProvider: TsMorphMetadataProvider,
  debug: process.env['NODE_ENV'] === 'development',
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
  },
  // Allow global context for simpler testing
  allowGlobalContext: process.env['NODE_ENV'] === 'test',
});
