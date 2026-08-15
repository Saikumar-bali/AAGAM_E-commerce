import fs from 'fs';
import path from 'path';

describe('Rider pickup verification usability', () => {
  const source = fs.readFileSync(path.join(__dirname, 'RiderPickupOperationsScreen.tsx'), 'utf8');

  it('keeps verified handoff above the collapsed checklist', () => {
    expect(source.indexOf('{handoffCard}')).toBeLessThan(source.indexOf('{!checklistVerified ? <View'));
    expect(source).toContain('checklist complete');
  });

  it('keeps focused fields visible and keyboard interactions predictable', () => {
    expect(source).toContain('<KeyboardAvoidingView');
    expect(source).toContain('keyboardShouldPersistTaps="handled"');
    expect(source).toContain('keyboardDismissMode="on-drag"');
    expect(source).toContain('automaticallyAdjustKeyboardInsets');
  });

  it('uses persistent labels and typed-value feedback for PIN and notes', () => {
    expect(source).toContain('Store pickup PIN');
    expect(source).toContain('{pickupPin.length}/6 digits');
    expect(source).toContain('Problem details');
    expect(source).toContain('{problemNote.length}/500');
    expect(source).toContain('accessibilityLabel="Six-digit store pickup PIN"');
  });
});
