#!/usr/bin/env bash
set -Eeuo pipefail

mkdir -p artifacts/maestro
adb wait-for-device
adb devices -l | tee artifacts/maestro/adb-devices.txt

device_serial="$(adb devices | awk '$2 == "device" && $1 ~ /^emulator-/ { print $1; exit }')"
if [[ -z "$device_serial" ]]; then
  echo "No ready Android emulator was discovered through ADB." | tee artifacts/maestro/emulator-error.txt
  exit 1
fi

echo "$device_serial" | tee artifacts/maestro/emulator-serial.txt
{
  echo "serial=$device_serial"
  echo "sdk=$(adb -s "$device_serial" shell getprop ro.build.version.sdk | tr -d '\r')"
  echo "release=$(adb -s "$device_serial" shell getprop ro.build.version.release | tr -d '\r')"
  echo "abi=$(adb -s "$device_serial" shell getprop ro.product.cpu.abi | tr -d '\r')"
  echo "model=$(adb -s "$device_serial" shell getprop ro.product.model | tr -d '\r')"
} | tee artifacts/maestro/emulator-properties.txt

collect_device_proof() {
  adb -s "$device_serial" logcat -d > artifacts/maestro/android-logcat.txt 2>&1 || true
  adb -s "$device_serial" shell dumpsys package com.aagampartners > artifacts/maestro/android-package-dump.txt 2>&1 || true
  adb -s "$device_serial" exec-out screencap -p > artifacts/maestro/final-device-screen.png 2>/dev/null || true
  adb -s "$device_serial" shell uiautomator dump /sdcard/final-ui.xml >/dev/null 2>&1 || true
  adb -s "$device_serial" pull /sdcard/final-ui.xml artifacts/maestro/final-ui.xml >/dev/null 2>&1 || true
}
trap collect_device_proof EXIT

set +e
adb -s "$device_serial" install -r release/aagam-partners-maestro-release.apk \
  2>&1 | tee artifacts/maestro/adb-install.txt
install_status=${PIPESTATUS[0]}
set -e
if (( install_status != 0 )); then
  exit "$install_status"
fi

adb -s "$device_serial" shell pm path com.aagampartners \
  | tee artifacts/maestro/installed-package-path.txt
adb -s "$device_serial" logcat -c

set +e
pushd apps/mobile-partners/maestro >/dev/null
"$HOME/.maestro/bin/maestro" --device="$device_serial" test \
  --format=JUNIT \
  --output=../../../artifacts/maestro/junit.xml \
  --test-output-dir=../../../artifacts/maestro/test-output \
  --debug-output=../../../artifacts/maestro/debug \
  --test-suite-name="AAGAM Partners release APK" \
  -e MAESTRO_STORE_EMAIL="${MAESTRO_STORE_EMAIL}" \
  -e MAESTRO_EMPTY_STORE_EMAIL="${MAESTRO_EMPTY_STORE_EMAIL}" \
  -e MAESTRO_STORE_PASSWORD="${MAESTRO_STORE_PASSWORD}" \
  flows 2>&1 | tee ../../../artifacts/maestro/maestro-console.txt
maestro_status=${PIPESTATUS[0]}
popd >/dev/null
set -e

exit "$maestro_status"
