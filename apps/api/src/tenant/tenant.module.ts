import { Global, Module } from '@nestjs/common';
import { TenantService } from './tenant.service.js';
import { PrismaMasterService } from './prisma-master.service.js';
import { TenantResolverMiddleware } from './tenant-resolver.middleware.js';

@Global()
@Module({
  providers: [PrismaMasterService, TenantService, TenantResolverMiddleware],
  exports: [PrismaMasterService, TenantService, TenantResolverMiddleware],
})
export class TenantModule {}
