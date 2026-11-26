# Backend access foundation

The site is hosted on GitHub Pages, so it cannot enforce login or role checks by itself. The Supabase migration in `supabase/migrations/202611250001_fade_backend_access.sql` creates the protected data model and row-level security policies for the Admin, Sales Manager, and Sales roles.

## Current state

- The Supabase project is healthy on the Free plan.
- The migration has been applied to the Supabase project. The six `fade_*` tables are present, RLS is enabled on each, and the role-scoped policies are listed in Supabase.
- Seven confirmed Supabase Auth users now map to profiles: Admin Rina, Manager Aru, and Sales Niko, Nurdin, Roland, Akim, and Aldy. Sales IDs are assigned in `fade_profiles`.
- Usernames map to non-deliverable `@fade.invalid` aliases inside Supabase Auth. Email-based password recovery is unavailable.
- Local login code now authenticates against Supabase, loads the role from `fade_profiles`, and rejects dashboard URLs without an authenticated profile. The Supabase publishable key is intended for browser use; no service-role key is present.
- Local dashboard code now requests every page of rows from the RLS-protected tables. The Admin workbook upload maps invoice Sales names to canonical account IDs, syncs invoices, rewards, and monthly targets, and waits for backend writes before showing success.
- The approved FADE master workbook has been imported to Supabase: 8 sales, 160 stores, 395 invoices, 54 targets, and 311 rewards.
- The production site has not yet been deployed with the Supabase-backed changes. The prior public `synthetic-seed.js` asset is being removed from the current Pages artifact.
- Password recovery cannot send email because the accounts use `@fade.invalid` aliases. The Admin will need to reset passwords manually in Supabase Auth until the client provides real login contacts or another recovery method.

## Migration model

- `fade_profiles` binds an Auth user ID to one application role and, for Sales, one `sales_id`.
- `fade_invoices` stores indexed access fields plus the normalized invoice object in `data` JSONB.
- Sales sees only its own invoices, targets, sales profile, and related stores/rewards.
- Sales Manager can read all sales data but cannot write it.
- Admin can read and write operational data. Profile role assignments remain SQL-editor-only; no browser role can elevate itself.
- Anonymous table access is revoked for these six tables. Schema usage remains enabled so the migration does not disable unrelated public-schema objects. The browser must use an authenticated Supabase session.

## Import and deploy in a controlled way

1. Review the SQL migration before running it in Supabase SQL Editor.
2. Keep the existing profile mappings aligned with the Auth UUIDs and each Sales `sales_id`. Role assignments must remain server-side only.
3. The approved workbook has already been imported with `python3 tools/import_fade_master.py`. For a future approved refresh, the script signs in as Admin using a password prompt, checks the profile role, and upserts sales, stores, targets, invoices, and rewards through the authenticated Data API. It does not use a service-role key or write a data export file.
4. Keep source Excel exports and generated migration data outside the GitHub Pages artifact. The application must not ship the prior public `synthetic-seed.js` asset.
5. Deploy the authenticated app and verify each role with separate accounts: Admin read/write, Manager read-only across sales, and Sales read-only within its assigned `sales_id`. Verify direct API requests, not only the visible UI.

Removing the asset from the current deployment does not erase copies from prior public Git history or caches. If the repository or earlier Pages deployments were public, treat the old file as previously exposed; history cleanup is a separate repository rewrite and should be coordinated before handover.

## Important

Do not share the live app with the client or claim production access is secured until the data import, public seed removal, deployment, and role checks are complete. A public Supabase URL and publishable key may be used by a browser client only with RLS enabled. A service-role or secret key must stay server-side and must never be committed.
