# Publishing ephemeorg

Deploy from repo root (`sillygooseia-corp/`) using:

```powershell
.\infra\deploy.ps1 -Target ephemeorg -Tag 2026.4.1.1
```

Or via platform entrypoint:

```powershell
.\platform.ps1 deploy ephemeorg 2026.4.1.1
```

The deployment publishes:

- Image: `silentcoil.sillygooseia.com:5000/ephemeorg/backend:<tag>`
- Namespace: `ephemeorg`
- Host: `epheme.org`
