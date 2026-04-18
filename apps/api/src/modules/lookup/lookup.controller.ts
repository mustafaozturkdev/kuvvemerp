import { Controller, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { LookupService } from './lookup.service.js';

/**
 * LookupController — Form dropdown'lari icin basit read-only endpoint'ler.
 * Yetki kontrolu yok (tum kullanicilar erisebilir — referans veri).
 */
@Controller('api/v1')
export class LookupController {
  constructor(private readonly lookupService: LookupService) {}

  @Get('birim')
  async birimler(@Req() req: FastifyRequest) {
    return this.lookupService.birimler(req.prisma!);
  }

  @Get('vergi-orani')
  async vergiOranlari(@Req() req: FastifyRequest) {
    return this.lookupService.vergiOranlari(req.prisma!);
  }
}
