import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const mainSource = fs.readFileSync(
  path.join(root, 'apps/api-gateway/src/main.ts'),
  'utf8',
);
const serviceSource = fs.readFileSync(
  path.join(root, 'apps/api-gateway/src/app.service.ts'),
  'utf8',
);
const controllerSource = fs.readFileSync(
  path.join(root, 'apps/api-gateway/src/app.controller.ts'),
  'utf8',
);

describe('Redis client safety contract', () => {
  it('registers WebSocket pub/sub error listeners before connecting', () => {
    expect(mainSource).toContain("pubClient.on('error'");
    expect(mainSource).toContain("subClient.on('error'");
    expect(mainSource.indexOf("pubClient.on('error'")).toBeLessThan(
      mainSource.indexOf('pubClient.connect()'),
    );
    expect(mainSource.indexOf("subClient.on('error'")).toBeLessThan(
      mainSource.indexOf('subClient.connect()'),
    );
  });

  it('registers temporary health/readiness client error listeners', () => {
    expect(serviceSource).toContain("client.on('error'");
    expect(controllerSource).toContain("client.on('error'");
    expect(serviceSource.indexOf("client.on('error'")).toBeLessThan(
      serviceSource.indexOf('client.connect()'),
    );
    expect(controllerSource.indexOf("client.on('error'")).toBeLessThan(
      controllerSource.indexOf('client.connect()'),
    );
  });

  it('closes temporary Redis clients in finally blocks', () => {
    expect(serviceSource).toContain('finally {');
    expect(serviceSource).toContain('if (client.isOpen)');
    expect(serviceSource).toContain('await client.quit()');
    expect(controllerSource).toContain('finally {');
    expect(controllerSource).toContain('if (client.isOpen)');
    expect(controllerSource).toContain('await client.quit()');
  });

  it('uses the shared Prisma client and does not expose raw health errors', () => {
    expect(serviceSource).toContain("import { prisma } from '@aagam/database'");
    expect(serviceSource).not.toContain('new PrismaClient()');
    expect(serviceSource).toContain("error: 'Database health check failed'");
    expect(serviceSource).toContain("error: 'Redis health check failed'");
  });
});
