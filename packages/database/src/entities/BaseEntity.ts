import { PrimaryKey, Property } from '@mikro-orm/core';
import { createId } from '@eurocomply/core';

export abstract class BaseEntity {
  @PrimaryKey({ type: 'text' })
  id: string = createId();

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
