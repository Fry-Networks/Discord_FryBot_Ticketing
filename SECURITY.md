# Security Policy

## Supported Versions

We currently support the latest version of DiscoFryBot and the Fry Dashboard.

## Reporting a Vulnerability

If you discover a vulnerability or security issue, please **do not open a GitHub issue**.

Instead, email us directly at:  
📧 **security@frynetworks.com** (or replace with your actual email)

We take all reports seriously and will respond as quickly as possible.

## Best Practices for Contributions

- Do **not** commit `.env`, `.local`, `.supabase`, or credential files
- Avoid sharing access tokens, passwords, or private URLs in public commits
- Use `.gitignore` to filter sensitive files
- Run `npm audit` / `docker scan` before submitting PRs

## Secure Hosting

We recommend running DiscoFryBot and the Fry Dashboard behind a reverse proxy (e.g. Cloudflare Tunnel or Nginx), with HTTPS enforced.

All production deployments should use:
- Environment variable secrets
- Supabase Row Level Security (RLS) enabled
- Updated dependencies
