# Blocktime

A private, browser-based Minecraft playtime calculator. Select a Minecraft
`logs` folder and the app reads `.log` and `.log.gz` files locally, detects play
sessions, and calculates the total time played.

## Local development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

The web app is built to `apps/web/dist` with relative asset paths, so it works
from a GitHub Pages project subpath. The included GitHub Actions workflow deploys
that folder whenever the `main` branch is updated.

To publish, choose **GitHub Actions** under **Settings → Pages → Build and
deployment → Source** in the repository.
