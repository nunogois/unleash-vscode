# Project guidance

Build a VS Code extension that helps developers inspect Unleash flags in code.

Product decisions agreed with the user:
- Automatically cover every project the PAT can read; default to **All** environments.
- “All” covers every environment configured for each flag's project. Individual environment selection is optional and available in the status-bar menu.
- Green means enabled everywhere in scope without activation restrictions. **Enabled with an empty strategy list is green**, matching Unleash SDK evaluation. Do not change this to yellow or red based on speculation.
- A 100% flexible rollout is green regardless of stickiness. Release plans are judged by their active milestone strategies, not by the presence of a plan or its name. Past and future milestones must not influence the current color.
- Demo is temporary: preserve URL, PAT and the real environment, provide an obvious Exit Demo action, and restore the previous editor. Only an explicit forget action deletes credentials.
- Keep setup discoverable through the first-use walkthrough, Unleash Activity Bar view and disconnected status-bar Connect action.
- Hover content leads with the flag name and description; use readable Markdown summaries instead of raw configuration JSON.
- A dependency or any active targeting condition makes an enabled flag yellow. This is deliberately stricter than SDK OR evaluation: even redundant conditional strategies prevent green.
- Red means all environment toggles in scope are off. Missing or outdated data is white/gray, never incorrectly red/green.
- Support languages through installed TextMate grammars without a language allowlist. Match the whole string exactly, wherever it appears, not just specific SDK calls. Be honest about unsupported literal syntax.
- Default refresh is 15 seconds with a local in-memory cache. Avoid network requests for every edit or every string.
- Keep credentials in SecretStorage, scope them to the connection/workspace, and never log them. First version is read-only against Unleash.

Check actual Unleash evaluation code when interpreting edge cases. The nearby `../unleash` and `../unleash-node-sdk` repositories can provide reference implementations; do not modify those repositories as part of this project.

Run `npm run check`, `npm test`, and `npm run build` for implementation changes. Run `npm run test:integration` when editor behavior changes. Grammar tests use real installed VS Code grammars; check for skipped cases. Package with `npm run package`; do not publish without an explicit request.
