# Ghost in the Web

A Chrome/Edge side-panel AI assistant that does things on the web with you, not instead of you. You drive, it executes — scraping pages, filling forms, chaining across tabs, turning whatever it finds into markdown, sheets, PDFs, or HTML.

Bring your own key or log in with a subscription (Anthropic, OpenAI, GitHub Copilot, Google). Everything — settings, API keys, chat history — stays on your machine. Zero telemetry, zero tracking.

## Install

1. Download the latest `ghost-in-the-web.zip` from the [Releases page](https://github.com/edgyarmati/ghostintheweb/releases/latest) and unzip it.
2. Open `chrome://extensions/` (or `edge://extensions/`) and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Click **Details** on the extension and enable:
   - **Allow user scripts**
   - **Allow access to file URLs**
5. Pin the extension and click its icon to open the side panel.

Requires Chrome 141+ (or Edge equivalent).

On first launch, connect at least one AI provider. Some subscription logins need the CORS proxy (Settings → Proxy, on by default). The default proxy is `https://proxy.mariozechner.at/proxy`, which belongs to the author of the upstream repo — swap it for your own if that matters to you.

## Development

Clone this repo alongside its sibling dependencies:

```
parent/
  mini-lit/     # https://github.com/badlogic/mini-lit
  pi-mono/      # https://github.com/badlogic/pi-mono
  sitegeist/    # this repo
```

Install dependencies in each:

```bash
(cd ../mini-lit && npm install)
(cd ../pi-mono && npm install)
npm install
```

Start the watchers (mini-lit, pi-mono, and the extension):

```bash
./dev.sh
```

Or just the extension:

```bash
npm run dev
```

Load `dist-chrome/` as an unpacked extension (same steps as Install above). The extension hot-reloads when the dev watcher rebuilds.

## Checks

```bash
./check.sh
```

Runs formatting, linting, and type checking. The Husky pre-commit hook runs the same checks before each commit.

## Build

```bash
npm run build
```

Outputs the unpacked extension to `dist-chrome/`.

## Release

```bash
./release.sh patch   # or minor / major
```

Bumps the version in `static/manifest.chrome.json`, commits, tags, and pushes. GitHub Actions builds and publishes the release.

## Credits

Forked from [badlogic/sitegeist](https://github.com/badlogic/sitegeist) by Mario Zechner. All the hard architectural work - the agent core, web UI, skills system, REPL tool, everything that makes this thing tick - is his. This fork exists to scratch a personal itch. Also, at the time when this was created, he stated that he won't be actively maintaining it, while this will receive updates (mostly stuff I personally need).

## License

AGPL-3.0. See [LICENSE](LICENSE).
