# Together — watch anything, in sync

Two people, each with their own copy of the same video file (a downloaded
movie, a show, anything playable in a browser `<video>` tag), watch it
perfectly in sync — plus a live mic/camera call in the corner. No video file
is ever uploaded; only tiny "play/pause/seek" messages travel over the
network.

## How it works

- One person clicks **Start a room** → gets a 6-letter code.
- They send that code to the other person (text, WhatsApp, whatever).
- Both people pick their own local copy of the video file.
- Play, pause, and seeking on one side sync to the other automatically.
- A floating box shows both webcams, with mic/camera on-off buttons.

**Important:** both people need the *same* video file already on their
device before joining. This app does not stream or transfer the video
itself — that would be slow, and copyright-risky if the content isn't
yours to redistribute. It only syncs playback position.

## Running it locally (to test)

```bash
npm install
npm start
```

Then open `http://localhost:3000` in two different browser windows (or two
devices on the same network) to test with yourself.

## Putting it on the real internet (not localhost)

You need a host that can run a small always-on Node.js server (this app
needs a live WebSocket connection for syncing — it can't be hosted as a
plain static site). Two easy free options:

### Option A: Render.com (recommended, simplest)

1. Create a free account at render.com.
2. Push this folder to a GitHub repo (or use Render's "public git repo" option).
3. In Render: **New +** → **Web Service** → connect your repo.
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Click **Create Web Service**. Render gives you a public URL like
   `https://your-app-name.onrender.com` — that's the link you share.

Free tier note: the server may "sleep" after inactivity and take ~30s to
wake up on the next visit. Fine for personal use.

### Option B: Railway.app

1. Create a free account at railway.app.
2. **New Project** → **Deploy from GitHub repo** (or drag-and-drop this folder).
3. Railway auto-detects Node.js and runs `npm install && npm start`.
4. Under **Settings → Networking**, click **Generate Domain** to get a
   public URL.

### After deploying

Share the public URL (not `localhost`) with your friend. Whoever creates a
room sends the 6-letter code to the other person — they enter it on the
same site.

## Notes / things you may want to extend later

- Rooms are stored in memory, so they reset if the server restarts.
- The call uses a public STUN server; on some strict networks (corporate
  Wi-Fi, some mobile carriers) a direct peer connection can fail, which
  would need a TURN server (e.g. a free Twilio/Metered TURN plan) added to
  `rtcConfig` in `public/client.js`.
- Currently built for exactly 2 people per room.
