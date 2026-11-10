import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

describe('HTTP application', () => {
  let app: (typeof import('../src/server.js'))['app'];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://stock:stock@localhost:5432/stock?schema=public';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-longer-than-32-characters';
    process.env.JWT_REFRESH_SECRET =
      'test-refresh-secret-that-is-longer-than-32-characters';
    const server = await import('../src/server.js');
    app = server.app;
  });

  it('serves liveness and request correlation metadata', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok' },
    });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('serves API information from the root route', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        service: 'stock-backend',
        status: 'ok',
        health: '/health',
        readiness: '/ready',
        documentation: '/api-docs',
        api: '/api/v1',
      },
    });
  });

  it('allows the configured local Swagger UI origin and rejects unknown origins', async () => {
    const allowed = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:8003');
    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:8003',
    );

    const denied = await request(app)
      .get('/health')
      .set('Origin', 'https://untrusted.example');
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('CORS_ORIGIN_DENIED');
  });

  it('publishes the versioned OpenAPI description', async () => {
    const response = await request(app).get('/api-docs/openapi.json');
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="api-docs.json"',
    );
    expect(response.body.openapi).toBe('3.0.3');
    expect(response.body.paths['/inventory/receive']).toBeDefined();
    expect(response.body.paths['/purchase-orders']).toBeDefined();
    expect(response.body.paths['/goods-receipts/{id}/post']).toBeDefined();
    expect(response.body.paths['/sales-orders/{id}/reserve']).toBeDefined();
    expect(
      response.body.paths['/inventory/transfers/{id}/receive'],
    ).toBeDefined();
    expect(response.body.paths['/dashboard']).toBeDefined();
    expect(response.body.paths['/organization/settings']).toBeDefined();
    expect(response.body.paths['/reports/imports']).toBeDefined();
    expect(response.body.paths['/reports/deliveries']).toBeDefined();
    expect(
      response.body.paths['/sales-orders/{id}/deliveries/{deliveryId}'],
    ).toBeDefined();
    expect(response.body.paths['/roles']).toBeDefined();
    expect(response.body.paths['/roles/{id}']).toBeDefined();
    expect(response.body.paths['/auth/password/change']).toBeDefined();
    expect(response.body.paths['/users'].post).toBeDefined();
    expect(response.body.paths['/reports/low-stock']).toBeDefined();
    expect(response.body.paths['/returns/{id}/post']).toBeDefined();
    expect(response.body.paths['/audit-logs']).toBeDefined();
  });

  it('downloads the OpenAPI description from the short JSON URL', async () => {
    const response = await request(app).get('/api-docs.json');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="api-docs.json"',
    );
    expect(response.body.openapi).toBe('3.0.3');
  });

  it('rejects access to tenant APIs without authentication', async () => {
    const response = await request(app).get('/api/v1/products');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('protects transfer workflows behind authentication', async () => {
    const response = await request(app).get('/api/v1/inventory/transfers');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('protects administrative and reporting APIs behind authentication', async () => {
    const [dashboard, users, returns, audit, settings] = await Promise.all([
      request(app).get('/api/v1/dashboard'),
      request(app).get('/api/v1/users'),
      request(app).get('/api/v1/returns'),
      request(app).get('/api/v1/audit-logs'),
      request(app).get('/api/v1/organization/settings'),
    ]);
    for (const response of [dashboard, users, returns, audit, settings]) {
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
  });
});
