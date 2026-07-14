// macOS notarization (afterSign hook). The family-standard custom hook: reads
// NOTARIZE_APPLE_* (NOT APPLE_*, to avoid electron-builder's buggy auto-notarize
// firing alongside this), notarizes via notarytool, staples the ticket. Staple
// failure is non-fatal (online fallback). No-op off macOS or without creds.
const { execFileSync } = require("node:child_process");

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appleId = process.env.NOTARIZE_APPLE_ID;
  const appleIdPassword = process.env.NOTARIZE_APPLE_PASSWORD;
  const teamId = process.env.NOTARIZE_APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    console.log("[notarize] skipped (NOTARIZE_APPLE_* not set)");
    return;
  }
  const { notarize } = require("@electron/notarize");
  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  console.log(`[notarize] ${appPath}`);
  await notarize({ tool: "notarytool", appPath, appleId, appleIdPassword, teamId });
  try {
    execFileSync("xcrun", ["stapler", "staple", appPath]);
  } catch (e) {
    console.warn("[notarize] staple failed (non-fatal):", e.message);
  }
};
