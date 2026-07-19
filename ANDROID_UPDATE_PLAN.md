# Android update strategy

Both APKs check the backend once per launch for the latest stable GitHub
release. When a higher version code exists, the app opens the exact Customer
or Partners APK asset and Android asks the user to approve installation.

Android does not permit a normal sideloaded application to silently replace
itself. Fully unattended updates require either Google Play in-app updates or
enterprise device-owner/MDM deployment. This release-aware prompt is the safe
professional option for directly distributed APKs. Moving to Play Internal
Testing enables flexible or immediate Play Core updates without requiring
users to enable installation from unknown sources.
