<p align="center">
  <img src=".github/assets/portada.png" alt="andarama: walk through panoramas" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img alt="EUPL-1.2 licence" src="https://img.shields.io/badge/licence-EUPL--1.2-f59e00?style=flat-square&labelColor=33260f" /></a>
  <a href="https://github.com/joseluissaorin/andarama/actions/workflows/ci.yml"><img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/joseluissaorin/andarama/ci.yml?branch=main&style=flat-square&label=CI&labelColor=33260f&color=3d8b40" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-ff8a00?style=flat-square&labelColor=33260f" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-242%20unit%20%2B%2020%20E2E-ffd900?style=flat-square&labelColor=33260f" />
  <a href="https://andarama.com"><img alt="Reference instance" src="https://img.shields.io/badge/demo-andarama.com-e8501a?style=flat-square&labelColor=33260f" /></a>
</p>

<p align="center">
  <a href="https://andarama.com"><b>Website</b></a> ·
  <a href="https://app.andarama.com"><b>Studio</b></a> ·
  <a href="https://docs.andarama.com"><b>Docs</b></a> ·
  <a href="https://andarama.com/t/recorrido-real"><b>Live tour</b></a> ·
  <a href="README.md"><b>Español</b></a>
</p>

---

Andarama is an open source platform to **build, publish and share 360 virtual tours**. Upload your spherical photos, connect them the way you would sketch a floor plan, and get a tour that anyone can walk through in a browser, VR headsets included. No plugins, no paid account, no handing your data to someone else: it runs entirely on Cloudflare's free tier or in a Docker container of your own.

It started as **ULL360**, commissioned by Universidad de La Laguna, and is now an independent project any organisation can use. The interface ships in Spanish and English; the documentation is in Spanish.

## What is inside

<table>
  <tr>
    <td width="22%"><b>Visual editor</b></td>
    <td>Scenes, hotspots and a tour graph, with a WYSIWYG preview running the real viewer. Drag a scene onto the panorama and the step towards it is created where you dropped it.</td>
  </tr>
  <tr>
    <td width="22%"><b>Seventeen hotspot types</b></td>
    <td>Navigation, text, image, gallery, video, audio, PDF, embedded web, 3D model, quiz, form, polygon, state, treasure and more, all reachable inside VR too.</td>
  </tr>
  <tr>
    <td width="22%"><b>WebGL viewer</b></td>
    <td>Multiresolution with its own tiler, 360 video, spatial audio, projections (little planet, stereographic, fisheye), compass, floor plan and gyroscope.</td>
  </tr>
  <tr>
    <td width="22%"><b>Real virtual reality</b></td>
    <td>WebXR with 25-joint hand tracking and controllers, plus a cardboard mode for phones without WebXR. Open the URL in the headset and you are in.</td>
  </tr>
  <tr>
    <td width="22%"><b>One-click publishing</b></td>
    <td>Public link, <code>&lt;script&gt;</code> embed, custom domain via CNAME, password, expiry date and a social card rendered with the actual projection of the opening scene.</td>
  </tr>
  <tr>
    <td width="22%"><b>Open export</b></td>
    <td>Self-contained static ZIP, single HTML file, SCORM 1.2 and 2004, kiosk mode and PWA. What you export keeps working with no Andarama behind it.</td>
  </tr>
  <tr>
    <td width="22%"><b>Collaboration</b></td>
    <td>Per-scene presence and locking on Durable Objects, comments, versions and live guided visits.</td>
  </tr>
  <tr>
    <td width="22%"><b>Accessibility and languages</b></td>
    <td>Plain-text alternative walkthrough, visible focus, 44 px targets, <code>prefers-reduced-motion</code> honoured, and translations per scene and per hotspot.</td>
  </tr>
</table>

## The editor

<p align="center">
  <img src=".github/assets/studio-editor.jpg" alt="The Andarama editor showing a cathedral scene, the scene list on the left and the arrivals panel on the right" width="100%" />
</p>

The orientation you arrive with **belongs to the path, not to the room**: walking into the hall from the corridor and walking in from the kitchen are two different arrivals, and each keeps its own view. The «how you get here» panel gathers all of them so you can decide them while standing in the destination scene, which is the only place where the result can be judged.

<table>
  <tr>
    <td width="50%"><img src=".github/assets/studio-grafo.png" alt="The tour graph with scenes grouped into areas and connections drawn as arrows" /></td>
    <td width="50%"><img src=".github/assets/studio-proyectos.png" alt="The Andarama project board showing the covers of four tours" /></td>
  </tr>
  <tr>
    <td><b>The graph</b>: every arrow <i>is</i> a navigation hotspot, not a parallel data structure. Drag from the edge of a node to connect, and the way back is created in the same gesture.</td>
    <td><b>The board</b>: folders, templates, trash and search. Each tour's cover is the panorama of its opening scene.</td>
  </tr>
</table>

## The viewer

<p align="center">
  <img src=".github/assets/visor.jpg" alt="The Andarama viewer showing a cathedral interior, with the control dock on the right and the thumbnail strip at the bottom" width="100%" />
</p>

Dark glass that stays legible over any panorama, a single grouped control dock, a thumbnail strip and nothing covering the photograph. Try it: [andarama.com/t/recorrido-real](https://andarama.com/t/recorrido-real) (photographs from Wikimedia Commons under CC BY-SA, credited inside the tour).

## Run your own

### Cloudflare, one command

The whole platform fits in Workers, D1, R2, KV, Durable Objects, Queues and Analytics Engine, within the free tier for small and medium use.

```bash
git clone https://github.com/joseluissaorin/andarama && cd andarama
pnpm install
pnpm deploy:cloudflare
```

The script creates any missing resources, applies the migrations and leaves the instance served on your domain.

### Docker, one file

A single image with Node and SQLite that mirrors the Cloudflare behaviour through the adapter layer.

```bash
curl -O https://raw.githubusercontent.com/joseluissaorin/andarama/main/deploy/docker/docker-compose.yml
docker compose up -d
```

Both paths are documented at [docs.andarama.com](https://docs.andarama.com).

## Development

Requirements: Node.js 20+ and pnpm 10.

```bash
pnpm install
pnpm build:packages      # build packages/
pnpm dev                 # API locally (wrangler dev, port 8787)
pnpm dev:studio          # Studio with Vite (port 5173, proxying the API)
pnpm dev:node            # self-host variant (Node + SQLite) on 8788
pnpm test                # 242 unit tests (Vitest)
pnpm test:e2e            # 20 E2E tests (Playwright against a real server)
pnpm lint && pnpm typecheck
```

## How it is put together

```
andarama/
├─ apps/
│  ├─ studio/            # Editor SPA (React + Vite + TanStack + Zustand)
│  ├─ api/               # Hono Worker: API, auth, tour serving and assets
│  ├─ realtime/          # Durable Objects (LiveTourRoom, ProjectPresence)
│  ├─ landing/           # The andarama.com front page
│  └─ docs/              # Documentation (Astro Starlight)
├─ packages/
│  ├─ schema/            # tour.json: types, JSON Schema and version migrators
│  ├─ viewer/            # 360 engine (WebGL on Marzipano, with our own layers)
│  ├─ viewer-ui/         # Viewer skin (Web Components, framework free)
│  ├─ tiler/             # Tiling in the browser (WebWorkers) and in Node (sharp)
│  ├─ exporter/          # Static packages, SCORM, kiosk and PWA
│  ├─ adapters/          # Interfaces + cloudflare/ and node/ implementations
│  ├─ db/                # Drizzle schema + migrations (D1 and SQLite)
│  └─ ui/                # Studio design system (Radix + Tailwind)
├─ deploy/               # wrangler.jsonc, bootstrap, Dockerfile, compose
└─ tooling/              # eslint, tsconfig, Playwright, brand images
```

Three golden rules hold it together:

1. **No domain module talks to Cloudflare.** Everything goes through `packages/adapters`, which is what makes the self-hosted build the same application rather than a port of it.
2. **`tour.json` is the contract.** Changing it requires a new version and a migrator in `packages/schema`; what you export today has to keep opening ten years from now.
3. **The viewer depends on no framework.** It embeds into any page with a single tag and outlives whatever is fashionable.

## Contributing

Contributions are welcome, from a typo to a new language or a new hotspot type. Start with [CONTRIBUTING.md](CONTRIBUTING.md); issues labelled `good first issue` are a good way in. The project follows its [code of conduct](CODE_OF_CONDUCT.md).

Found a vulnerability? Please do not open a public issue: [SECURITY.md](SECURITY.md) describes the private channel.

## Licence

[EUPL-1.2](LICENSE), the European Commission's copyleft licence, compatible with GPL, AGPL, MPL and EPL. In short: use it, study it, modify it and redistribute it, commercially too, as long as derivative work is shared under the same licence or a compatible one.

Third-party material (fonts, dependencies) and the project's origin are listed in [NOTICE.md](NOTICE.md). Authorship in [AUTHORS](AUTHORS).

<p align="center">
  <img src=".github/assets/social.png" alt="andarama, open source 360 virtual tours" width="70%" />
</p>

<p align="center">
  <sub>Built by <a href="https://joseluissaorin.com">José Luis Saorín</a> · <a href="https://andarama.com">andarama.com</a></sub>
</p>
