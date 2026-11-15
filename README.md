# CM Trophy

A static homepage and registration form, ready to deploy with Cloudflare Pages. The registration form is a preview: it does not send or save information or create accounts. Supabase integration can be added later.

## Event rules

The homepage links to event rules at `/rules/?event=<event>`. The sheets are images rendered from the supplied PDF; select a sheet to view it at full size. The PDF did not include marathon rules, and the carrom and badminton sheets contain inconsistent registration dates.

Add `allow_register=true` to the homepage or a rules-page URL to show a link to the registration preview on rules pages. This flag only controls visibility and is not an authorization mechanism; no registration is enabled.

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
