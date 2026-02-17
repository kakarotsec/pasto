First public release of Pasto — a minimal, ephemeral sharing tool for moving text and files between devices.

No accounts, no installs. Open a browser, connect your devices, and go.

**Live:** [usepasto.vercel.app](https://usepasto.vercel.app)

---

### What's in this release

- Real-time text sync across devices via WebSockets
- File sharing — drag & drop up to 5 files, 50 MB each
- QR code or short pin to connect devices
- No sign-up required, works on any browser
- Sessions auto-expire after 15 minutes — nothing is stored
- Admin dashboard for monitoring active sessions
- Automatic cleanup of expired data via Edge Functions

### Stack

React, TypeScript, Vite, Tailwind CSS, Supabase (Edge Functions + Realtime + Storage), Vercel

