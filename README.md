# ephemeorg

Public-facing showcase page for the Epheme platform.

## Run locally

```powershell
cd ephemeorg
npm run install:all
npm run dev
```

Open: http://localhost:8791

## What this project is

- Standalone static marketing/showcase page
- Served by a lightweight Express backend
- Includes a new `/blog` area for posts, tutorials, and technical notes
- Deployable to Kubernetes via Helm chart in `infra/helm/ephemeorg`
