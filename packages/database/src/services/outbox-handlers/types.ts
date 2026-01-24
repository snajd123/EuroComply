import { OutboxEvent } from '../../entities/OutboxEvent.js';
import { MikroORM } from '@mikro-orm/postgresql';

export interface OutboxHandlerContext {
  orm: MikroORM;
  schema: string;
}

export interface OutboxHandler {
  eventType: string;
  handle(event: OutboxEvent, context: OutboxHandlerContext): Promise<void>;
}
