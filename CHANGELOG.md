# Changelog

## 0.1.4

- Advance onboarding after connecting or opening the demo, completing the appropriate steps only after success.
- Activate Demo only for its active sample tab; restore the real connection when switching away, reactivate on return, and end Demo when the last sample tab closes.
- Added a Flags panel listing the full known catalog, with search by name, project and description and links to configuration.

## 0.1.3

- Replaced the sidebar toolbar’s Getting Started button with GitHub and removed redundant Getting Started links from the panel. The walkthrough remains available from the Command Palette.

- Added a manually triggered GitHub release workflow with a version input, tested VSIX builds, checksums and optional Marketplace publishing.
- Switched the extension publisher to `nunogois`; earlier local-development installations need to be uninstalled and reconnected under the new identity.

## 0.1.2

- Added official Unleash branding to the extension details, walkthrough, Activity Bar and sidebar.
- Added website, GitHub repository and issue links.
- Simplified the Demo guidance.

## 0.1.1

- A 100% flexible rollout is green regardless of stickiness, when no targeting restrictions apply.
- Release plans use the active milestone's underlying strategies for classification. Show its title in the hover; ignore past/future milestone rules and safeguard metadata when calculating the current audience.
- Redesigned hovers with the name and description first, clear status and environment sections, human-readable rollout/targeting details, and a compact link/freshness footer.
- Added an Unleash Activity Bar view, first-use walkthrough, clear Connect status-bar action, and persistent setup/settings controls.
- Demo is temporary. Exit Demo returns to the saved connection and environment without asking for the PAT, and restores the previous editor. Demo environment changes are not persisted to the real connection.
- Existing connections can keep their saved PAT when reconnecting. Only Disconnect and Forget Credentials removes the saved connection.

## 0.1.0

- Initial local preview: setup, secure PAT storage, flag-string recognition, editor decorations, hovers, all-environment status, refresh cache, and offline demo.
