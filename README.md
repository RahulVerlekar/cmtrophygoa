# CM Trophy

A Cloudflare Pages site with an event registration wizard and a Pages Function that submits registrations to Supabase.

## Event rules

The homepage links to event rules at `/rules/?event=<event>`. The sheets are images rendered from the supplied PDF; select a sheet to view it at full size. The carrom and badminton images have their registration end dates corrected to 26 November 2026; the supplied PDF itself retains the original errors. The Marathon page shows the supplied event poster, details and contacts; formal competition rules have not been supplied.

Homepage links include `allow_register=true` to show the registration link on rules pages. Direct rules-page URLs can also use this flag. It only controls visibility and is not an authorization mechanism.

## Registration setup

1. In the Supabase project's SQL Editor, run [supabase/schema.sql](supabase/schema.sql) to create the private registration table. Anonymous and authenticated clients cannot access the table; the Pages Function writes with a server-only secret.
2. In the Cloudflare Pages project settings, add `SUPABASE_URL` as a variable and `SUPABASE_SECRET_KEY` as an encrypted secret for the intended environment. Use the project's Supabase URL and its `sb_secret_...` key from Supabase Settings > API Keys. Never put the secret in client code or source control. The key provides elevated access to the entire Supabase project.
3. In Cloudflare, create a Turnstile widget for every hostname used to access registration (for example `cmtrophygoa.com` and the project's `pages.dev` hostname). Add its public site key as `TURNSTILE_SITE_KEY` and its secret as an encrypted `TURNSTILE_SECRET_KEY` in the Pages project's environment. Use the same widget for both keys; never put the secret in client code or source control.
4. Run [supabase/event-settings.sql](supabase/event-settings.sql) in the SQL Editor before deploying the event availability code. It creates any missing event settings without changing existing open/closed values and installs a database trigger that enforces them when registrations are saved.
5. Redeploy after setting these values. Confirm the security check and registration work using test data and verify the resulting row in the Supabase dashboard before opening registrations. Submissions fail closed if verification or event availability is missing, unavailable, or unsuccessful.

To open or close an event without a deployment, edit its `registration_open` value in **Table Editor > cm_trophy_event_settings**. The registration form checks the selected event before collecting details, and the database checks again when saving, including for forms already in progress. Existing registrations are unaffected. If an event setting is missing, registration for that event is unavailable until it is restored.

Turnstile reduces automated abuse but does not stop all spam. Add a Cloudflare rate-limiting rule for the custom domain's `/api/registrations` path, starting with a conservative threshold such as 30 requests per IP per 10 seconds and a 10-second block. Cloudflare's Free plan provides one rate-limiting rule; review its availability in the domain's security settings and monitor false positives, especially for participants sharing a network. A rule on the custom domain does not protect the separate `pages.dev` hostname.

Registrations include government ID numbers and blood groups: restrict organizer access, define retention and handling policies, and confirm that collection is appropriate for your use case. Monitor Cloudflare and Supabase usage, plan secure backups, and note that retries after an unknown submission status can create duplicate registrations.

Every participant aged 18 or older must provide their EPIC number; participants under 18 must provide a parent's EPIC number. Minors also provide Aadhaar except for street play, where a college ID is required for every participant.

Constituency is selected once at the start and applies to all participants, except street-play roster members, who provide their own. Cricket's Team Leader / Captain is the primary participant and counts toward the team size.

Rangoli registrations allow one or two participants and do not require a team name. The event categories are Traditional - Sanskar Bharti and Creative (Portrait).

## Verification diagnostics

The registration page reports Turnstile successes, failures (including the error code), and setup failures to `/api/verification-analytics`. On failures it also sends the primary participant's name and phone number (if entered), screen dimensions, browser language, time zone and effective connection type when available. The Pages Function writes these fields, the outcome, code, browser family and major version, and OS family and major version to Cloudflare Analytics Engine. Failure events also include the request's user-agent string (up to 1,024 characters), which may include a device model; browser privacy restrictions may reduce its detail. The function does not write email, ID numbers, IP addresses, Turnstile tokens or a persistent device identifier. Contact details are collected before submission, even if the participant later abandons the form or succeeds. Review applicable privacy requirements and restrict access to analytics and query results.

1. In Cloudflare, open **Workers & Pages > this Pages project > Settings > Bindings > Add > Analytics engine**. Set the variable name to `VERIFICATION_ANALYTICS` and the dataset to `verification_events`; add it for the intended environment and redeploy. The dataset is created on the first write.
2. Analytics failures do not block verification or registration. Without the binding, the endpoint responds with 503 and logs an error; events are not collected. Configure a separate dataset for preview if needed.
3. Use the [Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) to query the dataset. Create a token with **Account Analytics: Read** and keep it secret. For example, submit this query to the API:

   ```sql
   SELECT blob1 AS outcome, blob2 AS error_code,
          blob3 AS browser, blob4 AS browser_major,
          blob5 AS os, blob6 AS os_major,
          SUM(_sample_interval) AS events
   FROM verification_events
   WHERE timestamp > NOW() - INTERVAL '7' DAY
   GROUP BY outcome, error_code, browser, browser_major, os, os_major
   ORDER BY events DESC
   ```

To view recent failure contacts, use the same Analytics Engine SQL API:

   ```sql
   SELECT timestamp, blob1 AS outcome, blob2 AS error_code,
          blob3 AS browser, blob4 AS browser_major,
          blob5 AS os, blob6 AS os_major,
          blob7 AS participant_name, blob8 AS phone,
          blob9 AS user_agent, blob10 AS screen,
          blob11 AS language, blob12 AS timezone, blob13 AS connection,
          _sample_interval
   FROM verification_events
   WHERE timestamp > NOW() - INTERVAL '7' DAY
     AND blob1 IN ('failure', 'setup_failure')
   ORDER BY timestamp DESC
   ```

The screen dimensions are in CSS pixels. Connection is the browser's estimated effective network type (such as `4g`), not necessarily Wi-Fi or cellular, and is unavailable in some browsers. Empty fields mean the information was not available. The seven-day query filter does **not** delete data: Analytics Engine retains it for three months under Cloudflare's current limits. Sampling can omit individual records, and earlier events may not include contact or device details.

The browser and OS are inferred from the request's user-agent header, which may be unavailable or inaccurate. A widget can fail and later succeed, and manual retries create new widgets; failures are deduplicated by error code only within one widget. These are event counts, not unique visitors or a false-positive rate. Delivery is best-effort, and the public endpoint can receive spoofed events. Avoid contacting someone solely because a report exists without checking whether they subsequently registered. Monitor usage and configure rate limiting appropriate to available Cloudflare rules without blocking legitimate registrations. Analytics requests consume the shared Workers quota.

## Export registrations to Google Sheets

The local sync script reads a CSV export of the complete `cm_trophy_registrations` table. It does not connect to Supabase. It replaces the values in `Master`, `Summary`, `Constituency Counts` and one tab named by the event identifier per configured event, leaving other tabs alone. The master keeps the exported table columns and full registration JSON, but displays `created_at` in IST to the minute rather than its original CSV format. Event tabs contain one row per participant, grouped by each participant's constituency and ordered by the full registration timestamp (oldest first); displayed times are in IST to the minute. Event tabs show constituency and readable participant details first, followed by registration metadata and participant JSON. They omit the event column and show team names only for team events. The summary shows registration and participant counts overall and per event, the latest registration time, and when the sync started in IST (not the CSV export time). Constituency Counts shows overall registration and participant counts, registration counts per event, and the latest registration time for each constituency, including zeros. An entry is counted once in every constituency represented by its participants, so constituency entry counts can sum to more than the overall registration count. All cells are written as text, including IDs and values beginning with `=`. Each sync also sets header formatting, column widths and frozen rows on managed tabs.

If upgrading from the previous script, rename existing managed tabs before syncing: remove `CM - ` from each tab name (for example, `CM - Master` becomes `Master` and `CM - cricket` becomes `cricket`). The script otherwise creates new tabs and leaves the old ones untouched.

1. Use Node.js 18 or newer and run `npm ci` in this project.
2. Enable the Google Sheets API in a Google Cloud project, create a service account and download its JSON key. Share the target spreadsheet with the service account's email address as an editor.
3. Export the entire registration table from Supabase as CSV, including column headers. Keep both the export and the key **outside the repository**, with access restricted. Do not commit or share the key.
4. Back up the spreadsheet if needed: changes made in managed tabs are overwritten on every run. Run:

   ```sh
   node scripts/sync-registrations.mjs /path/to/registrations.csv SPREADSHEET_ID /path/to/service-account.json
   ```

   The spreadsheet ID is the part of its URL between `/d/` and `/edit`. The script creates missing managed tabs and updates them in one batch. An empty or invalid export is rejected before any changes. If an update cannot be confirmed, check the sheet before retrying.

The spreadsheet and CSV contain sensitive participant data. Restrict spreadsheet sharing to authorized accounts and securely remove local exports when no longer needed. Refresh by exporting the whole table again and rerunning the script; it does not run automatically.

## Run locally

Serve the `public` directory with any static HTTP server to view the pages. For example:

```sh
python3 -m http.server 8000 --directory public
```

Open <http://localhost:8000>.

For a production-style build, run `node scripts/build.mjs` and serve `dist`. Local builds display `Version: development`.

The static server does not run the event-status or registration endpoints. For local end-to-end testing, use `npx wrangler pages dev public` with a separate test Supabase project and a separate Turnstile widget configured for the local hostname. Configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, and `TURNSTILE_SECRET_KEY` in a local `.dev.vars` file. Do not use real participant data for testing. Turnstile's dummy keys cannot be used for an end-to-end success test here: their Siteverify response does not return the actual hostname or action, both of which this endpoint checks.

## Deploy to Cloudflare Pages

Connect this project to Cloudflare Pages. For a Git-connected deployment, use these build settings:

- Framework preset: **None**
- Build command: `node scripts/build.mjs`
- Build output directory: `dist`

The build displays the first eight characters of Cloudflare's `CF_PAGES_COMMIT_SHA` on each page and versions the page's CSS and JavaScript URLs. Static responses ask browsers to revalidate cached files on subsequent visits. For a Cloudflare-proxied custom domain, set **Caching > Configuration > Browser Cache TTL** to **Respect Existing Headers**; a longer zone setting or cache rule can override these headers. Existing files cached under previous settings can remain stale until their original cache lifetime expires or the visitor clears their browser cache.

The Pages build must include the root `functions` directory, and the registration environment variables described above must be configured for submissions. Uploading only the static output through the dashboard's Direct Upload does not deploy Pages Functions, so registration will not work that way.
