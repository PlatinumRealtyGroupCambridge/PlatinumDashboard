# Platinum Realty Group Corporate Dashboard

This is the real, live version of the Meeting Management prototype you already
approved — a Next.js app backed by a real Postgres database (Supabase), ready
to deploy on Vercel. It's already fully built; the two steps below are the
only manual work left, and they're both point-and-click in your browser.

## What you're deploying

- Home page with your snapshot, dashboard links, and upcoming meetings
- Meeting Management: calendar + list views, live meeting agendas (check off
  items, take notes, create one-or-more tasks per item, table items to the
  next occurrence), to-dos and goals with employee filters and "add to
  meeting"
- The 7 other dashboards (CEO, Financial, Trust Accounting, Marketing,
  Leasing, Operations, Sales) as "coming soon" placeholders, ready to wire up
  to QuickBooks, Rentvine, and Aptly later
- Your logo in the header and as the favicon
- A shared site password gate for now (every team member uses the same
  password to sign in) — this gets upgraded to individual "Sign in with
  Google" logins in a later step, alongside the Google Chat bot

## Step 1 — Upload this folder to a new GitHub repository

1. Go to [github.com/new](https://github.com/new) and create a new repository
   (for example, `prg-corporate-dashboard`). Keep it **Private**. Don't add a
   README, .gitignore, or license — leave it empty.
2. On the new repo's page, click **uploading an existing file**.
3. Drag this entire folder's contents into the browser upload area (drag the
   files/folders themselves, not the parent folder) and commit.

## Step 2 — Import the repo in Vercel and set the environment variables

1. In Vercel, click **Add New… → Project**, and import the GitHub repo you
   just created.
2. Before clicking Deploy, open **Environment Variables** and add these:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | From Supabase: **Connect → ORMs → Prisma**, the line labeled "Transaction pooler" / `DATABASE_URL`. Copy it exactly. |
   | `DIRECT_URL` | Same Supabase screen, the "Direct connection" / `DIRECT_URL` line. Copy it exactly. |
   | `SITE_PASSWORD` | Pick any password your team will use to sign in. You can change this later in Vercel's settings any time. |
   | `SESSION_SECRET` | `5baa231ad02c86a4c2c5213056ff4238ff439ed932b9d73770540cfaa57a13d6` (already generated for you — just paste this in) |

3. Click **Deploy**. The build automatically creates the database tables and
   seeds your team roster and the 6 meeting series (the same ones from the
   prototype) — there's nothing else to run.
4. Once it says "Ready," open the URL Vercel gives you, enter the
   `SITE_PASSWORD` you chose, and you're in. Use the "Viewing as" switcher in
   the top right to check what each team member sees.

## If a deploy ever fails

Open the failed deployment in Vercel and click **View Build Logs**. The two
most likely causes are a typo in `DATABASE_URL`/`DIRECT_URL` (copy them fresh
from Supabase's Connect panel) or a missing environment variable. Send me the
error text and I'll fix it.

## What's next

- Wiring up QuickBooks Online, Rentvine, and Aptly for the other 7 dashboards
- Google Cloud project setup for real "Sign in with Google" (replacing the
  shared password) and the Google Chat bot for adding agenda items/to-dos/
  goals by chat message
- Per-role viewing permissions (e.g. the property manager not seeing
  financials)
