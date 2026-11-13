<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Google Form responses live in a Google Sheet read through the Google Sheets connector (`src/lib/sheets.server.ts`); teacher decisions are written back into "Approval Status / Reviewed By / Reviewed On" columns so the sheet stays the single source of student data.
- Pure progress rules (column detection, status parsing, student stage and next-step documents) live in `src/lib/progress.ts` and are covered by `src/test/progress.test.ts`; keep UI copy decisions there, not in components.
- Roles are in `public.user_roles`; teacher access goes through `public.teacher_requests` (the first teacher is auto-approved, later ones need an existing teacher) — never derive roles from user metadata.
- Assistant chat streams from the `/api/chat` server route (bearer-verified, RLS as the user) and persists threads/messages in `chat_threads` / `chat_messages`; voice uses server functions in `src/lib/voice.functions.ts` (transcription + text-to-speech).
