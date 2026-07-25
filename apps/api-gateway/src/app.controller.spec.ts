import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';

function createController(configured = true) {
  return new AppController(
    { getHello: jest.fn() } as any,
    {
      getReadiness: jest.fn().mockReturnValue(
        configured
          ? { configured: true, source: 'environment', projectId: 'aagam-production' }
          : { configured: false, source: 'missing', reason: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured' },
      ),
    } as any,
  );
}

describe('AppController deployment health', () => {
  const originalDeploySha = process.env.DEPLOY_SHA;

  afterEach(() => {
    if (originalDeploySha === undefined) delete process.env.DEPLOY_SHA;
    else process.env.DEPLOY_SHA = originalDeploySha;
  });

  it('reports the exact deployed revision for release verification', () => {
    process.env.DEPLOY_SHA = '0123456789abcdef';
    const controller = createController();

    expect(controller.getHealth()).toMatchObject({
      status: 'ok',
      service: 'aagam-api-gateway',
      revision: '0123456789abcdef',
    });
  });

  it('uses an explicit non-production revision outside deployments', () => {
    delete process.env.DEPLOY_SHA;
    const controller = createController();

    expect(controller.getHealth().revision).toBe('development');
  });

  it('reports closed-app phone push readiness without exposing credentials', () => {
    const controller = createController();

    expect(controller.getNotificationReady()).toMatchObject({
      status: 'ready',
      checks: {
        closedAppPhonePush: 'ok',
        provider: 'firebase-cloud-messaging',
        credentialSource: 'environment',
        projectId: 'aagam-production',
        reason: null,
      },
    });
  });

  it('blocks readiness when Firebase Admin credentials are missing', () => {
    const controller = createController(false);

    expect(() => controller.getNotificationReady()).toThrow(ServiceUnavailableException);
  });
});
