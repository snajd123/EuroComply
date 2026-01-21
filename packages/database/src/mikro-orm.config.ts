import { defineConfig } from '@mikro-orm/postgresql';
import {
  Organization,
  Category,
  UnitDefinition,
  AttributeTemplate,
  Product,
  ProductVersion,
  OutboxEvent,
  AuditLog,
} from './entities/index.js';

export default defineConfig({
  entities: [
    Organization,
    Category,
    UnitDefinition,
    AttributeTemplate,
    Product,
    ProductVersion,
    OutboxEvent,
    AuditLog,
  ],
  dbName: process.env['DATABASE_NAME'] ?? 'eurocomply',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
  user: process.env['DATABASE_USER'] ?? 'eurocomply',
  password: process.env['DATABASE_PASSWORD'] ?? 'eurocomply',
  schema: 'public',
  debug: process.env['NODE_ENV'] !== 'production',
  migrations: {
    path: './src/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
  },
});
