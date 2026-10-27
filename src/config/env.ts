import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(365).default(30),
  ALLOW_ORG_REGISTRATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:8003'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  throw new Error(
    `Invalid environment configuration: ${JSON.stringify(z.treeifyError(result.error))}`,
  );
}

export const env = result.data;
