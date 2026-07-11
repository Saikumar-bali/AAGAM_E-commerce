import { TrackingGateway } from './tracking.gateway';

describe('Phase 1 rider socket queue removal', () => {
  const gateway = new TrackingGateway({ verify: jest.fn() } as any);

  function client() {
    return {
      data: {
        user: {
          id: 'rider-user-id',
          email: 'rider@test.com',
          role: 'RIDER',
          name: 'Rider',
        },
      },
      join: jest.fn(),
    } as any;
  }

  it('rejects joinRiderZone without joining a zone room', () => {
    const socket = client();
    const response = gateway.handleJoinRiderZone(socket);
    expect(response).toEqual(expect.objectContaining({
      ok: false,
      code: 'RIDER_PUBLIC_QUEUE_REMOVED',
    }));
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects joinRidersQueue without joining the public rider room', () => {
    const socket = client();
    const response = gateway.handleJoinRidersQueue(socket);
    expect(response).toEqual(expect.objectContaining({
      ok: false,
      code: 'RIDER_PUBLIC_QUEUE_REMOVED',
    }));
    expect(socket.join).not.toHaveBeenCalled();
  });
});
