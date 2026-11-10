# Signing and notarization

Fleet-wide signing and notarization are maintained in the private **app-hq** repo:

- runbook: https://github.com/michael-borck/app-hq/blob/main/runbooks/signing.md
- secret sync: https://github.com/michael-borck/app-hq/blob/main/scripts/sync-apple-secrets.sh

This repo intentionally keeps only the book-forge-specific pieces:

- `.github/workflows/build.yml` — canonical secret mapping, API-key preparation,
  `macos-15` pin, unsigned fallback
- `scripts/notarize.js` — App Store Connect API key preferred; Apple ID fallback
- `package.json` — macOS packaging configuration

Do not add fleet secret-sync scripts or duplicate the runbook here. Update
app-hq instead so the whole portfolio stays in sync.
