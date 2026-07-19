import { buildApplicationProgress } from './applicationReviewProgress';

describe('partner application review progress', () => {
  it('keeps an unverified applicant on contact verification', () => {
    const steps = buildApplicationProgress('DRAFT', false, 0);
    expect(steps[0]).toMatchObject({ key: 'CONTACT', state: 'CURRENT' });
    expect(steps.slice(1).every((step) => step.state === 'UPCOMING')).toBe(true);
  });

  it('shows a verified draft as application work in progress', () => {
    const steps = buildApplicationProgress('DRAFT', true, 60);
    expect(steps[0].state).toBe('COMPLETE');
    expect(steps[1]).toMatchObject({ key: 'APPLICATION', state: 'CURRENT' });
  });

  it('shows admin review as current after review starts', () => {
    const steps = buildApplicationProgress('UNDER_REVIEW', true, 100);
    expect(steps[0].state).toBe('COMPLETE');
    expect(steps[1].state).toBe('COMPLETE');
    expect(steps[2].state).toBe('COMPLETE');
    expect(steps[3]).toMatchObject({ key: 'REVIEW', state: 'CURRENT' });
  });

  it('shows corrections as applicant attention', () => {
    const steps = buildApplicationProgress('ACTION_REQUIRED', true, 80);
    expect(steps[1].state).toBe('ATTENTION');
    expect(steps[3]).toMatchObject({
      label: 'Applicant changes required',
      state: 'ATTENTION',
    });
  });

  it('shows approval and rejection as explicit final decisions', () => {
    expect(buildApplicationProgress('APPROVED', true, 100)[4]).toMatchObject({
      state: 'COMPLETE',
      label: 'Approved — activate account',
    });
    expect(buildApplicationProgress('REJECTED', true, 100)[4]).toMatchObject({
      state: 'REJECTED',
      label: 'Application not approved',
    });
  });
});
