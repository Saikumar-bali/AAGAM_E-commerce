import { AppController } from './app.controller';

describe('AppController deployment health', () => {
  const originalDeploySha = process.env.DEPLOY_SHA;

  afterEach(() => {
    if (originalDeploySha === undefined) delete process.env.DEPLOY_SHA;
    else process.env.DEPLOY_SHA = originalDeploySha;
  });

  it('reports the exact deployed revision for release verification', () => {
    process.env.DEPLOY_SHA = '0123456789abcdef';
    const controller = new AppController({ getHello: jest.fn() } as any);

    expect(controller.getHealth()).toMatchObject({
      status: 'ok',
      service: 'aagam-api-gateway',
      revision: '0123456789abcdef',
    });
  });

  it('uses an explicit non-production revision outside deployments', () => {
    delete process.env.DEPLOY_SHA;
    const controller = new AppController({ getHello: jest.fn() } as any);

    expect(controller.getHealth().revision).toBe('development');
  });
});
