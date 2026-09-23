<img src="media/unleash-icon.png" alt="Unleash" width="88" height="88">

# Unleash for VS Code

[Website](https://getunleash.io) · [GitHub](https://github.com/nunogois/unleash-vscode) · [Report an issue](https://github.com/nunogois/unleash-vscode/issues)

An independent, read-only extension that brings Unleash flag configuration into your editor. It highlights complete flag-name strings wherever they appear, without requiring a specific SDK call.

## Try it

1. Install the local `.vsix` with **Extensions → … → Install from VSIX**.
2. The **Welcome to Unleash** editor page opens on first use. Reopen it with **Unleash: Getting Started**, **Unleash: Connect**, or the sidebar’s **Connect to Unleash** button.
3. Enter your URL and PAT directly on the welcome page, then choose **Connect to Unleash**. Errors and connection progress stay on that page. You can also **Try the offline demo**.
4. Open code containing an exact flag name. Hover for configuration or follow **Open in Unleash**. Cmd/Ctrl-click also opens the flag.

**Demo is temporary.** It preserves your real URL, PAT and selected environment. Click **Unleash Demo · Exit** in the status bar or **Return to my instance** in the sidebar to reconnect without re-entering credentials and return to your previous editor. Changing environments in Demo only affects Demo. Demo is active only while its sample tab is active. Switching to a real file restores the saved connection and cached flags; returning to the sample reactivates Demo. Closing the last sample tab ends Demo entirely. Reloading VS Code also resumes the saved connection. If you have not connected yet, Exit Demo returns to setup. Only the explicit **Disconnect and Forget Credentials** action removes your saved connection.

After connecting, the welcome page confirms access and offers **Browse flags** and **Quick open a flag**. Changing connections uses the same form; leaving PAT blank reuses the saved token, including when you change the URL. The new connection is validated before replacing the saved one. The sidebar stays focused on everyday flag browsing.

The **Flags** section lists the complete known catalog, with project names and descriptions on hover. Click the search icon to filter by flag name, project or description, and clear the search to restore the full list. Each flag shows its status for the selected environment scope. Selecting it opens the same configuration summary as the hover in an editor tab, with Open in Unleash, Find in workspace, Copy name and Refresh actions. Missing strategy details load as you browse, in batches of 50 flags with at most four requests at a time. Search covers the entire catalog; Show more flags expands the list.

The sidebar stays available after onboarding with connection status, environment selection, refresh and settings. Existing connections can reuse their saved PAT during setup by leaving the token field blank.

Generate a PAT in your Unleash profile settings. The extension uses the Admin API and inherits that user's read permissions. Every accessible project is included automatically. The status bar defaults to **All** environments; click it to select a particular environment, refresh, reconnect, or change settings.

The URL and chosen environment belong to the workspace. The PAT is stored only in VS Code SecretStorage, keyed to the connection and workspace. Remote instances require HTTPS; localhost HTTP is supported for development. Tokens are never written to settings, output logs, or source files. The extension only sends GET requests and refuses redirects. It does not modify flags, execute source code, or send source files to Unleash. No telemetry is included.

## Developer shortcuts

- **Unleash: Quick Open Flag**: search names, projects and descriptions in the Command Palette, then open its configuration in an editor tab.
- **Copy Flag Name**: use the inline copy button or right-click a flag in the panel.
- **Find Flag in Workspace**: right-click a flag to open VS Code’s literal, case-sensitive workspace search. Results can include comments and longer strings; this is text search, not a semantic reference index.

The welcome page adapts to your editor theme, supports keyboard navigation, and clears the PAT field on submission. Saved tokens are never sent back to the page or stored in webview state.

## What the colors mean

| Indicator | Meaning in the selected scope |
| --- | --- |
| 🟢 Green | Every configured environment is enabled with only recognized unconditional active strategies, with no dependencies or targeting conditions. Active release milestone strategies are included. |
| 🟡 Yellow | Mixed environment states, partial rollouts, constraints, segments, custom strategies, dependencies, or other known conditional rules. |
| 🔴 Red | Every environment toggle in scope is disabled. |
| ⚪ White/gray | Loading, missing, invalid, or outdated configuration; network or permission failure; selected environment is absent. |

**All means all environments configured for the flag's project.** Environments not attached to that project are not part of its scope. The hover always lists the available environments, even when an individual environment is selected.

This is a conservative configuration summary, not runtime SDK evaluation. A redundant constrained strategy still makes an enabled environment yellow, even if another strategy grants access to everyone. Disabled strategies are ignored. Variant distribution does not itself limit whether a flag is enabled; variant data is shown in the hover. Parent variant dependencies do prevent green. An enabled flag with zero active strategies is green, matching SDK evaluation, unless a dependency or another activation rule applies. A 0% rollout is yellow while the environment toggle remains on.

A 100% flexible rollout is green regardless of stickiness, provided there are no constraints or other activation restrictions. Safeguard and release-plan metadata do not change the color by themselves; the current targeting rules determine it. Stickiness is shown as configuration context, not a reason for yellow. Release plans are evaluated using the strategies in `activeMilestoneId`; past and future milestones do not affect the current color. An unavailable active milestone is unknown rather than assumed unrestricted. The extension recognizes unconstrained `default`, `flexibleRollout` at 100%, and `gradualRolloutRandom` at 100% as unconditional. Other strategy types stay yellow.

## Hover layout

The flag name and description appear first. A status summary and project/scope context follow, then compact environment sections with bold headings. The selected environment comes first. Rollout percentages, stickiness, constraints, variants and current release milestones are shown in readable text rather than raw JSON. The configuration link and refresh time appear at the bottom. Server-provided text is escaped and command links remain untrusted.

## Languages and matching

The extension reuses TextMate grammars contributed by VS Code and installed language extensions, via `vscode-textmate` and `vscode-oniguruma`. It uses public extension metadata and file APIs; it does not depend on private editor tokenization APIs.

There is no language allowlist. Complete, single-line quoted literals and grammar-recognized unquoted strings can match in any language with a compatible installed grammar. Normal literals are tested against VS Code's actual grammars for JavaScript, TypeScript, TSX, Python, Go, Rust, Java, C#, Ruby, PHP, shell, JSON, YAML, SQL, C++, Swift and Lua.

Exact source spelling must match the entire flag name. Comments, regex literals, interpolation, substrings and escaped spellings are excluded. The first version does not resolve variables, concatenations, escaped names, multiline literals, or every language-specific delimiter (for example Ruby `%q` and heredocs). A custom language without a TextMate grammar is not recognized. Grammar quality affects coverage. Restart/reload after installing a language extension if its grammar is not picked up immediately.

Recognition has a 100ms budget per document and skips files over 512KB by default. This keeps editing responsive, but very large/complex files can have incomplete highlighting. A compatible grammar enables broad language coverage; it is not a promise of perfect parsing in every language.

## Refresh and cache

Polling pauses while the VS Code window is inactive and resumes with a refresh on return. The default refresh is **15 seconds**, configurable with `unleash.refreshIntervalSeconds`. The extension refreshes project/flag catalogs and details for flags in visible editors or the open flag configuration page. Browsing the Flags list loads missing details once; it does not repeatedly poll every listed flag. Cached list statuses become unverified when outdated. Detailed requests have a concurrency limit of four and are shared when in flight. Background catalogs never overlap. Failures back off; authentication and permission errors are shown in the status-bar tooltip. One inaccessible project currently makes the catalog refresh fail visibly rather than silently claim complete coverage.

Flag metadata is cached in memory for the current extension session, not persisted to disk. Opening or editing a document uses the local catalog and fetches only newly encountered flag details. Editing is debounced. Configuration older than twice the refresh interval, or data affected by a failed request, is shown as unknown. The hover displays the fetch time. Deleting flags or losing access removes them after a successful catalog refresh. No live credentials are required for demo mode or automated tests.

## Develop

Requires Node.js 22+ and VS Code 1.99+.

```sh
npm ci
npm run check
npm test
npm run build
```

Open this folder in VS Code and press **F5** to start an Extension Development Host, then run **Unleash: Try Demo** or **Unleash: Connect**.

```sh
npm run test:integration
npm run package
```

The integration test uses a separate temporary VS Code profile and opens/closes its own development window. On macOS it locates the `Code` or `Electron` executable in `/Applications/Visual Studio Code.app`; set `VSCODE_EXECUTABLE_PATH` elsewhere. Grammar tests use the bundled extensions in the default macOS app; set `VSCODE_EXTENSIONS_PATH` to your VS Code `resources/app/extensions` directory on other systems. Grammar tests are reported as skipped if those grammars are not available.

## Release

Open **Actions → Release extension → Run workflow**, select **main**, and enter a numeric version such as `0.2.0` (no `v` prefix). The workflow checks types, runs unit/grammar tests and VS Code integration tests, packages the extension, and creates a GitHub release with the VSIX and SHA-256 checksum. It also retains the VSIX as an Actions artifact.

The release tag is `v` followed by your version. Its source contains the matching package version; the workflow does not push a version commit onto main. New releases must not be older than an existing release tag. Rerunning an existing version uses its original tagged source and, when present, its already-published GitHub installer. This lets you retry Marketplace publishing after fixing credentials without replacing a released installer.

### Enable Marketplace publishing

The extension publisher is **nunogois**. Add an Azure DevOps publishing token as the repository Actions secret **VSCE_PAT** under **Settings → Secrets and variables → Actions**. Give it **Marketplace (Manage)** scope and access to this publisher. Do not put the token in source files or workflow inputs. [Microsoft's publishing instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) explain token creation and publisher access.

Every release run publishes the same GitHub VSIX to Marketplace when that secret exists; without it, the run succeeds with GitHub distribution only and reports the skipped Marketplace step. A Marketplace failure leaves the GitHub release available. After configuring or fixing the secret, rerun the same version. Already-published Marketplace versions are skipped.

Microsoft currently documents retirement of global Azure DevOps PATs on **December 1, 2026**. This initial workflow uses PAT authentication supported by our pinned tooling; migrate to Microsoft's supported identity-based publishing before that deadline.

When upgrading from the earlier **local-development** build, uninstall that extension, install **nunogois.unleash-vscode**, and reconnect. VS Code treats them as separate extensions, including their saved credentials.

## Architecture

- `api.ts`: read-only Admin API, URL handling, response validation and safe errors.
- `cache.ts`: catalog and detail cache, request sharing, concurrency and cancellation.
- `model.ts`: active release milestone resolution and conservative status classification.
- `hover.ts`: escaped, formatted hover content shared with tests.
- `session.ts`: secure saved connection and temporary Demo state.
- `welcome.ts`: dedicated editor setup page and restricted message handling.
- `sidebar.ts` / `flags-view.ts`: connection controls and flag browsing.
- `grammars.ts` / `recognition.ts`: installed grammar loading and complete-string recognition.
- `extension.ts`: onboarding, secure credentials, refresh scheduling, editor decorations, hovers and links.
- `demo.ts`: deterministic offline examples.

API reference: [Unleash Admin API](https://docs.getunleash.io/api/admin-api-overview). Editor reference: [VS Code syntax highlighting](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide).

Automated checks cover mocked API responses, classification, connection/Demo state, installed language grammars, and the VS Code Extension Host.

## Flag autocomplete and cleanup

Invoke IntelliSense inside a string (Ctrl+Space) to complete a flag name from the local catalog. Suggestions include project, cached status, description and configuration; completing a flag makes no API requests. Installed language grammars identify strings, excluding comments and interpolated expressions. Unsupported literals are skipped.

Stale flags are labeled in the Flags panel, configuration page and suggestions. Use **Find in workspace** to locate their usages. **Copy Flag Reference** in the flag context menu copies its name and Unleash URL for sharing.
