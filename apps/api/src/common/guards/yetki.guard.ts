import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PUBLIC_META_KEY } from './jwt.guard.js';
import { YETKI_META_KEY } from '../decorators/yetki.decorator.js';

/**
 * YetkiGuard — @RequireYetki() metadata'sini okur, kullanicinin tum yetkileri
 * tasidigindan emin olur. `*` wildcard tum yetkileri verir.
 * @Public() ile isaretlenmis endpoint'lerde skip eder (APP_GUARD uyumu).
 */
@Injectable()
export class YetkiGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Public endpoint'lerde yetki kontrolu gerekmez
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const handler = context.getHandler();
    const cls = context.getClass();
    const gerekliYetkiler =
      this.reflector.get<string[]>(YETKI_META_KEY, handler) ??
      this.reflector.get<string[]>(YETKI_META_KEY, cls);

    if (!gerekliYetkiler || gerekliYetkiler.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const kullanici = req.kullanici;
    if (!kullanici) {
      throw new ForbiddenException({
        kod: 'YASAK',
        mesaj: 'Yetki kontrolu icin oturum yok',
      });
    }

    const sahipOlunan = new Set(kullanici.yetkiler);
    if (sahipOlunan.has('*')) return true;

    const eksik = gerekliYetkiler.filter((y) => !sahipOlunan.has(y));
    if (eksik.length > 0) {
      throw new ForbiddenException({
        kod: 'YETKI_YOK',
        mesaj: `Yetersiz yetki: ${eksik.join(', ')}`,
        detay: { eksik_yetkiler: eksik },
      });
    }
    return true;
  }
}
