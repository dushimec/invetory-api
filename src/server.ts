import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { corsMiddleware } from './config/cors.js';
import { prisma } from './config/db.js';
import { openApiSpec } from './config/swagger.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';
import { requestId } from './middlewares/request-id.middleware.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';

export const app = express();
app.disable('x-powered-by');
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.requestId,
  }),
);
app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Mwendo Traders Inventory and Trade Operations API',
    data: {
      service: 'stock-backend',
      status: 'ok',
      health: '/health',
      readiness: '/ready',
      documentation: '/api-docs',
      api: '/api/v1',
    },
    meta: null,
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service is healthy',
    data: { status: 'ok' },
    meta: null,
  });
});
app.get('/ready', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  logger.debug({ database: 'connected' }, 'Readiness check passed');
  res.status(200).json({
    success: true,
    message: 'Service is ready',
    data: { database: 'connected' },
    meta: null,
  });
});
const downloadOpenApiSpec = (_req: express.Request, res: express.Response) =>
  res.attachment('api-docs.json').json(openApiSpec);

app.get('/api-docs.json', downloadOpenApiSpec);
app.get('/api-docs/openapi.json', downloadOpenApiSpec);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use('/api/v1', routes);
app.use(notFound);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  const start = async () => {
    try {
      await prisma.$connect();
      logger.info({ database: 'connected' }, 'Database connection established');
      const server = app.listen(env.PORT, () =>
        logger.info({ port: env.PORT }, 'Mwendo Traders API listening'),
      );
      const shutdown = (signal: string) => {
        logger.info({ signal }, 'Shutting down');
        server.close((error) => {
          if (error) {
            logger.error({ err: error }, 'HTTP server shutdown failed');
            process.exitCode = 1;
          }
          void prisma.$disconnect();
        });
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    } catch (error) {
      logger.fatal(
        { err: error, database: 'disconnected' },
        'Application startup failed because the database connection could not be established',
      );
      await prisma.$disconnect();
      process.exitCode = 1;
    }
  };
  void start();
}
