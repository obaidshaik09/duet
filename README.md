# Duet — voice-first household baby log (free)

Multi-user app: accounts, household invites, live sync, PWA, and a marketing site. No paid plan.

## Defaults

| Decision | Choice | Why |
|----------|--------|-----|
| Auth | Email/password + JWT | Simple, self-hosted |
| Database | SQLite (`duet-v3.db`) | Zero ops for class/demo |
| Sync | SSE with auto-reconnect + 15s poll | Survives phone lock / blips |
| Pricing | Free | Product direction |

## Setup

```bash
npm install
cp server/.env.example server/.env
# set JWT_SECRET; optional ANTHROPIC_API_KEY
npm run dev
```

Open http://127.0.0.1:3000

## Production

```bash
npm run build
npm start
```

```bash
npm test
```

## Share a link (class demo)

```bash
npm run share
```

Prints a public `https://….trycloudflare.com` link and saves a QR code to `docs/duet-link-qr.png`. It's free and needs no account, and voice and "Add to Home Screen" work on any phone. The link only works while this computer and that window stay open. You get a new link each time you run it.
