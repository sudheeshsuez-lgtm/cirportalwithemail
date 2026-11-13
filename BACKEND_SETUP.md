# CIR Portal backend setup

This project uses **Supabase Auth + Postgres/RLS**, TanStack Start server functions, a Google Sheets connector, and the Lovable AI Gateway.

## 1. Environment variables

Copy `.env.example` to `.env` for local development and fill in real values. Configure the same values in your hosting provider's server environment. Never commit `.env`, expose `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, or `GOOGLE_SHEETS_API_KEY` in browser code, or prefix secrets with `VITE_`.

Required for core authentication/database operations:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Required for Google Sheets sync:

- `LOVABLE_API_KEY`
- `GOOGLE_SHEETS_API_KEY`

The service-role key is only needed by server-only administrative code; the current user-scoped portal functions use the publishable key and RLS.

## 2. Apply database migrations

Apply all SQL files in `drizzle/migrations` in numeric order to the Supabase project's SQL editor or through your migration workflow:

1. `0000_migration.sql`
2. `0001_migration.sql`
3. `0002_secure_teacher_bootstrap.sql`
4. `0003_email_notification_log.sql`

The third migration is a security hardening migration. Teacher accounts are no longer auto-approved just because they are the first teacher signup. This prevents an arbitrary visitor from claiming administrator-like teacher privileges.

## 3. Bootstrap the first teacher securely

1. Create the intended teacher account through the normal signup page.
2. In Supabase SQL Editor, verify the account email and user ID in `auth.users`.
3. Promote only that verified account by running the following statement with its exact UUID:

```sql
insert into public.user_roles (user_id, role)
values ('REPLACE_WITH_VERIFIED_AUTH_USER_UUID', 'teacher')
on conflict (user_id, role) do nothing;

update public.teacher_requests
set status = 'approved', reviewed_at = now()
where user_id = 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID';
```

Do not expose the SQL editor or service-role credentials to end users. Thereafter, approved teachers can review new teacher access requests inside the portal.

## 4. Configure Google Form and response Sheet

1. Create a Google Form for the expression of interest.
2. Link its responses to a Google Sheet.
3. Ensure the connected Google account/integration can read and update that Sheet.
4. Sign in as an approved teacher, open **Teacher dashboard → Google Form & Sheet**, and save the Form URL and Sheet URL.
5. The response sheet should have a header row. The portal maps common headings for name, email, roll/register number, department, college, city/place, mobile, date of birth, and timestamp. It creates `Approval Status`, `Reviewed By`, and `Reviewed On` columns when a teacher first reviews a response.
6. Students must sign in using the same email address submitted in the Form. Email matching is case-insensitive.

The integration reads up to 5,000 rows and selects the most recent matching response for a student.


## 5. Automatic Gmail decision notifications

When an approved teacher changes a student's response from Pending to **Approved** or **Rejected**, the server sends a decision email to the Gmail address in that student's Google Form response. Moving a response back to Pending does not send an email. Repeating the same decision does not send a duplicate notification. The teacher dashboard reports whether the email was sent; a mail failure does not undo the decision already saved to Google Sheets.

### Google configuration (one-time)

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable **Gmail API**.
2. Configure the OAuth consent screen for the college account and add the scope `https://www.googleapis.com/auth/gmail.send`.
3. Create an OAuth Client ID (Web application or Desktop application). Keep its client ID and client secret private.
4. Obtain an offline OAuth refresh token for the official college Gmail account with the Gmail send scope. The Google OAuth Playground can be used with **Use your own OAuth credentials** enabled; authorize the college account, exchange the code, and retain the refresh token. Do not share the refresh token.
5. Set these server-side environment variables in local `.env` and your deployment host (never use a `VITE_` prefix):
   - `GMAIL_SENDER_EMAIL` — the same official Gmail account that authorized OAuth.
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
   - `SUPABASE_SERVICE_ROLE_KEY` — required to securely track sent notifications and prevent duplicates.
6. Redeploy/restart the server after setting environment variables.

The Gmail API sends from the authorized account; no password or Gmail app password is stored. Ensure the Google Form response sheet has a valid student email column (a header containing Email or Gmail). Test with a student address you control before using it for real applications.

## 6. AI and voice features

The CIR Guide chat route uses the Lovable AI Gateway. Voice transcription and speech generation use the same gateway. Ensure the deployment has valid AI gateway access/credits. A gateway billing/credit error is surfaced to the user as a retry-later message.

## 7. Local development and verification

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
```

## 8. Functional smoke-test checklist

- Register a student; verify they receive the `student` role and can only access their own threads/messages.
- Register a teacher-request account; verify it remains pending until an approved teacher accepts it.
- Bootstrap the initial teacher using the administrator-only SQL step above.
- As a teacher, request the response list, approve/reject a response, confirm the Sheet columns update, and verify the student receives one Gmail notification.
- As the matching student, verify the latest response status and next-step guidance appear.
- Save valid Form/Sheet URLs; verify invalid URLs are rejected.
- Start a CIR Guide thread, send multiple messages, reload it, and verify history is retained.
- Test microphone transcription and text-to-speech with browser microphone permission enabled.

## Important integration limitation

Google Sheets access depends on the connected Google account/connector permissions and the deployment platform's connector credentials. The source code cannot create those external credentials or grant access to a private Sheet automatically. A successful frontend build does not prove that external Supabase, Google, or AI credentials are configured; complete the smoke tests against your deployed services.
