import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createSqliteAdapter } from './prisma-client-factory';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: createSqliteAdapter() });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
