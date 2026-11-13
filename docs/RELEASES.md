# CodeTeo releases

CodeTeo checks GitHub Releases for updates only in an installed, packaged Windows build. The development build shows that updates are available from an installed build.

## Create a Windows release

1. Update `version` in `package.json` and keep `package-lock.json` in sync with `npm.cmd install --package-lock-only`.
2. Commit and push the source to `dijiteo/codeteo`.
3. In PowerShell, sign in to GitHub CLI as `dijiteo` if needed, then set a temporary publish token and run the release build:

   ```powershell
   gh auth login --hostname github.com
   $env:GH_TOKEN = gh auth token
   npm.cmd run release:win
   Remove-Item Env:GH_TOKEN
   ```

   The build checks types, builds the app, creates the x64 NSIS installer, and publishes the setup, `latest.yml`, and `.blockmap` files to GitHub Releases. GitHub Actions is not required.
4. Confirm the release contains the `CodeTeo-<version>-Setup.exe` installer, `latest.yml`, and the `.blockmap` file.
5. Install the release once and check that the toolbar can find a later release, then verify the download and restart flow.

Public GitHub Releases provide the feed used by the built-in updater. Do not upload `.env` files, keys, credentials, user data, or local build output to the source repository.

## Update behavior

- Users choose when to download an available update.
- The app offers to restart and install after the download completes.
- Installation is blocked while editor changes are unsaved.
- Version metadata and installer assets are served by GitHub Releases over HTTPS. Configure Windows code signing before distributing broadly; this project currently builds unsigned installers.
