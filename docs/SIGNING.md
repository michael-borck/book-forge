# Code signing across the app portfolio

Status: audit + plan, 2026-11-10.

Scope: the 30 unique Electron/Tauri desktop apps found under
`/Volumes/Crucial X9/Projects`.

## What the audit found

Two stacks, two naming conventions, and a lot of duplicated secrets:

| Pattern | Count | Secret names in use |
|---|---:|---|
| Electron (legacy/current) | 15 | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Tauri (canonical Tauri names) | 7 | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Tauri using Electron names internally | 1 | `CSC_LINK` → `APPLE_CERTIFICATE`, `CSC_KEY_PASSWORD` → `APPLE_CERTIFICATE_PASSWORD`, `APPLE_APP_SPECIFIC_PASSWORD` → `APPLE_PASSWORD` (document-lens) |
| No signing secrets | 7 | `curriculum-curator`, `video-to-guide`, `case-crafter`, `karaoke-stage`, `bowerbird`, `cairn`, `Knotebook` |

Recent successful release runs with signing secrets include debrief,
playable-lessons, talk-buddy, study-buddy, character-craft-lite, cabinet,
career-compass, insight-lens, thematic-lens, assessment-bench-desktop,
book-forge, lesson-loom, ethos-mirror, limn, numeron, and astron.

Failures/cancellations that line up with credential or naming drift:
cite-sight (release cancelled), assessment-lens-desktop (repeated failures),
thematic-lens and talk-buddy (failed then succeeded), book-forge (failed until
the unsigned fallback was fixed).

The common failure mode is not the signing service itself: the credentials must
be present on the **packaging step**. In Electron that means the
`electron-builder` step plus the `afterSign` notarize hook; in Tauri it means the
`tauri-action` step. Setting them only on a later upload step, or using
`APPLE_PASSWORD` where a workflow expects `APPLE_APP_SPECIFIC_PASSWORD`, produces
exactly the “it worked in one repo and not another” pattern.

## One certificate, one notarization credential

It is not best practice to have one certificate per app. It is best practice to
have:

- **one Developer ID Application certificate per Apple team** (valid ~5 years),
  used for every app;
- **one notarization credential per team**: preferably an App Store Connect API
  key; an app-specific password is the fallback;
- **per-app keys only for app-specific signing**, notably Tauri updater keys
  (`TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD`), because the public key is embedded
  in that app’s `tauri.conf.json`.

App-specific passwords are tied to the Apple ID, not the app. One can notarize
every app. They are revoked when the Apple ID password changes; Apple caps the
number of active ones (currently around 25). Revoke unused ones at
`appleid.apple.com → Sign-In and Security → App-Specific Passwords`.

### Why the `.p12` seemed to change

A `.p12` should not change per app. It changes when the certificate expires, the
private key is lost, a new certificate is issued (often by letting Xcode manage
signing per app), or it is re-exported with a different password without
updating CI. Use one Developer ID Application certificate for the whole team.

## Canonical secret names

Adopt these names everywhere. For Electron, `CSC_LINK` and `CSC_KEY_PASSWORD`
remain **workflow environment names**, but their values come from the canonical
secrets.

| Secret | Value | Used by |
|---|---|---|
| `APPLE_CERTIFICATE` | base64 of the `.p12` | Tauri directly; Electron via mapping |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` export password | both |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Name (TEAMID)` | Tauri; Electron optional |
| `APPLE_TEAM_ID` | 10-character team id | both |
| `APPLE_API_KEY` | App Store Connect Key ID | both |
| `APPLE_API_ISSUER` | App Store Connect Issuer ID | both |
| `APPLE_API_KEY_CONTENT` | base64 of the `.p8` key file | both (written to a file in CI) |
| `APPLE_ID` | Apple ID email (transition only) | legacy notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password (transition only) | legacy notarization |
| `CSC_LINK` | base64 `.p12` (transition) | legacy Electron workflows |
| `CSC_KEY_PASSWORD` | `.p12` password (transition) | legacy Electron workflows |
| `TAURI_SIGNING_PRIVATE_KEY` | **per app**, updater key | Tauri only |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **per app** | Tauri only |

Recommended workflow mapping:

Electron:

```yaml
env:
  CSC_LINK: ${{ secrets.APPLE_CERTIFICATE }}
  CSC_KEY_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
  APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
  APPLE_API_KEY_CONTENT: ${{ secrets.APPLE_API_KEY_CONTENT }}
```

Write the `.p8` to a temp file before `electron-builder` and point the notarize
hook at it (`appleApiKey`, `appleApiKeyId`, `appleApiIssuer`).

Tauri:

```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
  APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
```

Before `tauri-action`, write the key:

```bash
mkdir -p ~/.appstoreconnect/private_keys
echo "$APPLE_API_KEY_CONTENT" | base64 --decode \
  > ~/.appstoreconnect/private_keys/AuthKey_${APPLE_API_KEY}.p8
```

If an unsigned fallback is needed, unset **all** Apple env vars including the
notarization ones. Clearing only `CSC_LINK` still lets the afterSign hook try to
notarize an unsigned app.

## Windows signing

The realistic options now that file-based `.pfx` signing is gone:

- **Azure Trusted Signing** (recommended for a portfolio): one account +
  certificate profile for all apps, OIDC from GitHub (`id-token: write`,
  `azure/login@v2`, `artifact-signing-cli`), no long-lived client secret.
  `document-lens` already contains a dormant reference implementation.
- **SignPath**: especially good for OSS projects; centralized service.
- **SSL.com eSigner / DigiCert KeyLocker / Sectigo**: cloud-HSM alternatives.

Standardize on repo **variables** for non-secret settings:
`AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`,
`AZURE_SIGNING_ENABLED`; and secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`
(with OIDC). Avoid `AZURE_CLIENT_SECRET` when OIDC is possible.

## Where to keep the credentials locally

Keep signing material outside the projects tree:

```text
~/.certs/
  Certificates.p12              # Developer ID Application certificate + private key
  AuthKey_<KEYID>.p8            # App Store Connect API private key
  apple.stuff                   # local notes/config; chmod 600
```

`~/.certs` should be `0700`; every file in it should be `0600`.

`apple.stuff` can hold the values the sync script reads:

```text
Certificate password: ...
Apple Team ID (10 chars): H7XP9TYKB5
Signing Identity: Developer ID Application: Michael Borck (H7XP9TYKB5)
API Key ID: ...
API Issuer ID: ...
```

The script defaults to these paths. You can also pass everything through
environment variables instead.

### Where each value comes from

- **`.p12` / certificate**: Apple Developer → Certificates, Identifiers &
  Profiles → Certificates → Developer ID Application. Import the `.cer` into
  Keychain Access (it must pair with the private key), then export the identity
  as `.p12` with a password. The current valid identity is
  `Developer ID Application: Michael Borck (H7XP9TYKB5)`, expiring
  **2027-02-01**.
- **Team ID**: Apple Developer → Membership details, or the certificate subject
  (`OU=H7XP9TYKB5`).
- **`.p8`, Key ID, Issuer ID**: App Store Connect → Users and Access →
  Integrations → Team Keys → add a key with Developer access. Download the
  `AuthKey_<KEYID>.p8` file once (it cannot be downloaded again). The Key ID is
  on the key row; the Issuer ID is shown above the keys table.

Do not commit any of these files. `.gitignore` covers `*.p12`, `*.pem`, and
`*.key`, but keep the whole directory outside the repo anyway.

## Secret rollout

`scripts/sync-apple-secrets.sh` populates canonical and transition secrets across
the repos in `scripts/apple-signing-repos.txt`. It is dry-run by default.

With the files and `apple.stuff` above:

```bash
scripts/sync-apple-secrets.sh --check          # show what exists
scripts/sync-apple-secrets.sh                  # dry run
scripts/sync-apple-secrets.sh --apply          # set secrets
```

Or override values via environment:

```bash
export APPLE_CERTIFICATE_P12=/path/to/DeveloperID.p12
export APPLE_CERTIFICATE_PASSWORD='...'
export APPLE_SIGNING_IDENTITY='Developer ID Application: Michael Borck (TEAMID)'
export APPLE_TEAM_ID='TEAMID'
export APPLE_API_KEY_P8=/path/to/AuthKey_KEYID.p8
export APPLE_API_KEY='KEYID'
export APPLE_API_ISSUER='issuer-uuid'
# optional during transition:
export APPLE_ID='you@example.com'
export APPLE_APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'
```

`michael-borck` is a personal account, so GitHub does not support user-level
shared secrets. The script sets repo secrets per repo. For the
`retroverse-studios` org, org-level secrets could replace the three repo-level
copies later.

Do **not** sync `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`; those are per app.

## Rollout plan

1. **Consolidate credentials**
   - Identify the current Developer ID Application certificate; check expiry and
     team.
   - Create one App Store Connect team API key (Developer role), download the
     `.p8` once, record Key ID + Issuer ID.
   - Keep one app-specific password as a temporary fallback.
2. **Populate secrets**
   - Run the sync script in `--check` mode, then dry-run, then `--apply`.
   - Canonical + legacy names are populated together so current workflows keep
     working during migration.
3. **Pilot one of each stack**
   - Electron: book-forge.
   - Tauri: lesson-loom (already uses canonical Tauri names).
   - Switch both to API-key notarization; cut a test release; verify with
     `codesign --verify`, `spctl -a -vv`, and `xcrun notarytool history`.
4. **Migrate the rest in batches**
   - Electron: map canonical secrets to `CSC_*`; update the notarize hook.
   - Tauri: add the `.p8` creation step; remove `APPLE_ID`/`APPLE_PASSWORD` once
     API-key notarization is proven.
   - Remove legacy `CSC_*`/`APPLE_ID` secrets only after every repo is migrated.
5. **Windows**
   - Set up one Azure Trusted Signing account/profile.
   - Pilot `document-lens` (already has the structure), then add OIDC signing to
     Electron workflows via `@electron/windows-sign` or the electron-builder
     custom sign hook.
6. **Keep it fixed**
   - Add a weekly “signing doctor” workflow: check secret names exist, certificate
     expiry, and that the latest release artifacts verify.

## Useful checks

```bash
# certificate subject + expiry
openssl pkcs12 -in DeveloperID.p12 -clcerts -nokeys -passin env:APPLE_CERTIFICATE_PASSWORD \
  | openssl x509 -noout -subject -dates

# local signature / Gatekeeper
codesign --verify --deep --strict --verbose=2 "BookForge.app"
spctl --assess --type execute --verbose=4 "BookForge.app"

# notarization history and log
xcrun notarytool history --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
xcrun notarytool log <submission-id> --apple-id ... --team-id ... --password ...
```

## Duplicate checkout

`venture-lab` exists twice:

- current: `/Volumes/Crucial X9/Projects/venture-lab` (v1.1.1, clean `main`)
- stale: `/Volumes/Crucial X9/Projects/curtin/ignition/venture-lab` (v1.0.0,
  11 uncommitted files, ~2,290 lines removed)

The stale one is a course/ignition copy. It has uncommitted local changes, so it
should be archived rather than deleted outright. Once the course material is
confirmed redundant, move it to an archive folder or trash it.
