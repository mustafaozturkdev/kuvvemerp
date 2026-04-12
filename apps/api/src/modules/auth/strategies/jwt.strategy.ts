import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '@kuvvem/contracts';
import type { Env } from '../../../config/env.validation.js';
import type { KullaniciBilgi } from '../../../common/types/request.js';

/**
 * JwtStrategy — Bearer token'i parser eder, KullaniciBilgi objesine donusturur.
 *
 * JWT payload'da kullanici_id ve oturum_id string olarak tasinir
 * (BigInt precision kaybi onlemi). Burada BigInt'e geri cevirilir.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtPayload): KullaniciBilgi {
    if (!payload.sub || !payload.kullanici_id || !payload.tenant_id) {
      throw new UnauthorizedException({
        kod: 'GECERSIZ_TOKEN',
        mesaj: 'Token payload eksik',
      });
    }
    return {
      id: BigInt(payload.kullanici_id),
      publicId: payload.sub,
      email: '',
      roller: payload.roller ?? [],
      yetkiler: payload.yetkiler ?? [],
      oturumId: BigInt(payload.oturum_id),
    };
  }
}
