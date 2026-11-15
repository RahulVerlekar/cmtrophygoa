# CM Trophy

A static homepage and registration form, ready to deploy with Cloudflare Pages. The registration form is a preview: it does not send or save information or create accounts. Supabase integration can be added later.

## Run locally

Serve the `public` directory with any static HTTP server. For example:

```sh
python3 -m http.server 8000 --directory public
```

Open <http://localhost:8000>.

## Deploy to Cloudflare Pages

Connect this project to Cloudflare Pages or upload the `public` directory using Direct Upload. For a Git-connected deployment, use these build settings:

- Framework preset: **None**
- Build command: leave empty
- Build output directory: `public`

No Supabase credentials or environment variables are needed for this preview.
