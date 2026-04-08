# Interview Assist

A local-first **Next.js** app that helps a candidate prepare for interviews: multiple **people** (profiles), each with resume / job description / references, **chat sessions** grounded in those documents, and optional **thread file uploads** (documents, notebooks, images, zip, etc.) for a single conversation.

## Requirements

- **Node.js** 20+ (or the version your toolchain expects; see `package.json` engines if present)
- An **OpenAI API key** (entered in **Settings** in the UI, or set as `OPENAI_API_KEY` on the server)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On a small screen, the **chat** is shown first; scroll down for **profile, Settings, and History**.

### Production build

```bash
npm run build
npm start
```

## Use on your LAN

So other devices on the same Wi‑Fi or network can open the app:

```bash
npm run build
npm run start:lan
```

The app listens on **all interfaces** (`0.0.0.0`) on port **3000** by default. From another machine, use `http://<host-PC-LAN-IP>:3000` (find the IP with `ipconfig` on Windows).

**Windows Firewall:** inbound TCP **3000** must be allowed. Run **PowerShell as Administrator**:

```powershell
cd path\to\interview_assist
.\scripts\allow-lan-firewall.ps1
```

If the script fails with “Access is denied”, use an elevated shell or add an inbound rule manually for TCP 3000.

**Security:** LAN mode exposes the app to your network only. Do not expose it to the public internet without HTTPS, authentication, and hardening. Chat data and uploads stay in **`.data/`** on the machine that runs the server.

## Environment variables

Create **`.env.local`** in the project root (optional):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Server-side default API key if users do not paste one in Settings |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible API base URL |
| `INTERVIEW_MODELS` | Comma-separated allowlist of model ids (see `lib/models.ts`) |
| `INTERVIEW_DEFAULT_MODEL` | Default model id when not set in UI |

## Data storage

Everything is stored under **`.data/`** (gitignored):

- `profiles.json` — people, active profile, document metadata
- `uploads/` — profile resume, JD, reference files
- `chats/` — chat session JSON
- `chat-files/` — files attached inside a chat thread

Back up `.data/` if you care about history.

## Features (high level)

- **Profiles** — name, role, interview phase, custom prompt, pasted resume/JD text
- **Documents** — upload resume, job description, references (PDF, DOCX, etc.); text is extracted for the model
- **Chats** — history per person, **Next interview round** to chain sessions with prior-round context
- **Answer modes** — verbal, coding (markdown), system design (markdown / mermaid-friendly)
- **Thread attachments** — attach or paste/drag files into the composer; images show as previews; text/code/notebooks/spreadsheets/zips are extracted; linked to the user message that sent them
- **Model switcher** — constrained by server allowlist

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run dev:lan` | Dev server on `0.0.0.0:3000` |
| `npm run build` | Production build |
| `npm start` | Production server (default host/port per Next.js) |
| `npm run start:lan` | Production on `0.0.0.0:3000` |
| `npm run lint` | ESLint |

## Stack

- **Next.js 15** (App Router), **React 19**, **TypeScript**, **Tailwind CSS 4**
- OpenAI via **openai** SDK; document parsing (**pdf-parse**, **mammoth**, **xlsx**, **adm-zip**, etc.)

## License

Private project (`"private": true` in `package.json`). Add a license file if you open-source it.
