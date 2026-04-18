import { Controller, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { DashboardService } from './dashboard.service.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';

@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('istatistik')
  @RequireYetki('cari.goruntule')
  async istatistik(@Req() req: FastifyRequest) {
    return this.dashboardService.istatistik(req.prisma!);
  }
}
