import { NativeModules, Platform } from 'react-native';

export type PartnerPickedDocument = {
  uri: string;
  name: string;
  type: string;
  size: number;
  source: 'DOCUMENT' | 'CAMERA';
};

type NativePicker = {
  pickDocument: () => Promise<PartnerPickedDocument>;
  captureImage: () => Promise<PartnerPickedDocument>;
};

const nativePicker = NativeModules.AagamPartnerDocumentPicker as NativePicker | undefined;

function requirePicker(): NativePicker {
  if (Platform.OS !== 'android' || !nativePicker) {
    throw new Error('Document selection is unavailable in this build');
  }
  return nativePicker;
}

export const PartnerDocumentPicker = {
  pickDocument: () => requirePicker().pickDocument(),
  captureImage: () => requirePicker().captureImage(),
};
