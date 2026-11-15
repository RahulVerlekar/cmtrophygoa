# CM Trophy

A Cloudflare Pages site with an event registration wizard and a Pages Function that submits registrations to Supabase.

## Event rules

The homepage links to event rules at `/rules/?event=<event>`. The sheets are images rendered from the supplied PDF; select a sheet to view it at full size. The PDF did not include marathon rules, and the carrom and badminton sheets contain inconsistent registration dates.

Add `allow_register=true` to the homepage or a rules-page URL to show the registration link on rules pages. This flag only controls visibility and is not an authorization mechanism.

## Registration setup

1. In the Supabase project's SQL Editor, run [supabase/schema.sql](supabase/schema.sql) to create the private registration table. Anonymous and authenticated clients cannot access the table; the Pages Function writes with a server-only secret.
2. In the Cloudflare Pages project settings, add `SUPABASE_URL` as a variable and `SUPABASE_SECRET_KEY` as an encrypted secret for the intended environment. Use the project's Supabase URL and its `sb_secret_...` key from Supabase Settings > API Keys. Never put the secret in client code or source control. The key provides elevated access to the entire Supabase project.
3. Redeploy after setting these values. Confirm the Pages Function works using test data and verify the resulting row in the Supabase dashboard before opening registrations.

The public endpoint accepts unauthenticated submissions and has no built-in CAPTCHA or rate limiting. Configure appropriate Cloudflare abuse protection before production. Registrations include government ID numbers and blood groups: restrict organizer access, define retention and handling policies, and confirm that collection is appropriate for your use case.

## Run locally

Serve the `public` directory with any static HTTP server to view the pages. For example:

```sh
python3 -m http.server 8000 --directory public
```

Open <http://localhost:8000>.

The static server does not run the registration endpoint. For local end-to-end testing, use `npx wrangler pages dev public` with a separate test Supabase project and configure `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in a local `.dev.vars` file. Do not use real participant data for testing.

## Deploy to Cloudflare Pages

Connect this project to Cloudflare Pages. For a Git-connected deployment, use these build settings:

- Framework preset: **None**
- Build command: leave empty
- Build output directory: `public`

The Pages build must include the root `functions` directory, and the registration environment variables described above must be configured for submissions. Uploading only the `public` directory through the dashboard's Direct Upload does not deploy Pages Functions, so registration will not work that way.
