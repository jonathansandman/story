#!/usr/bin/env bash
# Build for GitHub Pages and publish dist/ to the gh-pages branch.
# Pages setting: Source = "Deploy from a branch", Branch = gh-pages, folder = / (root).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_NAME=$(basename -s .git "$(git config --get remote.origin.url)")
npm test
BASE_PATH="/${REPO_NAME}/" npm run build
cp dist/index.html dist/404.html   # SPA fallback for links within the app
touch dist/.nojekyll                # serve files as-is
SHA=$(git rev-parse --short HEAD)
TMP=$(mktemp -d)
cp -r dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name || echo deploy)" -c user.email="$(git -C "$OLDPWD" config user.email || echo deploy@localhost)" \
  commit -q -m "Deploy ${SHA}"
git push -f "$(git -C "$OLDPWD" config --get remote.origin.url)" gh-pages
rm -rf "$TMP"
echo "Published ${SHA} to gh-pages."
