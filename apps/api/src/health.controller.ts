import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/auth.decorators';
import { PrismaService } from './common/database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
