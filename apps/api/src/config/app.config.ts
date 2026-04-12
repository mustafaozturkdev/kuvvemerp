import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: validateEnv,
});
