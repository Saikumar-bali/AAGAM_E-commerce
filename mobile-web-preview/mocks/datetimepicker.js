/* Web mock for @react-native-community/datetimepicker. */
import React from 'react';
import { View, Text } from 'react-native';

const noop = () => undefined;

const DateTimePicker = (props) => (
  React.createElement(View, { style: props.style },
    React.createElement(Text, null, 'date picker'))
);

export default DateTimePicker;

export const DateTimePickerAndroid = { open: noop, dismiss: noop };
export const DateTimePickerAndroidComponent = DateTimePicker;
export const DateTimePickerIOS = DateTimePicker;
export const AndroidNativeProps = {};
export const IOSNativeProps = {};
