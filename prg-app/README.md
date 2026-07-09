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
- Individual logins for each team member (email + password, set up from the
  Admin > Users page once you're signed in), with per-person control over
  which of the 7 KPI dashboards they can see. Meeting Management always
  shows a person only their own meetings and agendas — admins see
  everything.

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
   | `SESSION_SECRET` | `5baa231ad02c86a4c2c5213056ff4238ff439ed932b9d73770540cfaa57a13d6` (already generated for you — just paste this in) |

3. Click **Deploy**. The build automatically creates the database tables and
   seeds your team roster and the 6 meeting series (the same ones from the
   prototype) — there's nothing else to run.
4. Once it says "Ready," open the URL Vercel gives you and sign in as
   `tim@platinumrealtygroup.com` with the temporary password
   `Platinum-CEO-2026!`. Go to **Admin > Users** in the sidebar right away to
   change your own password and set one for everyone else on the team — no
   one else can log in until you do.

## If a deploy ever fails

Open the failed deployment in Vercel and click **View Build Logs**. The two
most likely causes are a typo in `DATABASE_URL`/`DIRECT_URL` (copy them fresh
from Supabase's Connect panel) or a missing environment variable. Send me the
error text and I'll fix it.

## Google Chat bot setup

The bot understands plain English — team members can message it things like
"add to the team meeting agenda: discuss the Q3 budget" or "add a task for
Jamie: draft the sign-on packet, due next Friday." It only lets people add
agenda items to meetings they actually attend, but tasks and goals can be
assigned to anyone on the team.

This requires two accounts beyond what you've already set up: a Google Cloud
project (free) and an Anthropic API key (usage-based, but a few cents to a
couple dollars a month for a team this size).

### A. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up
   or sign in (this is separate from claude.ai)
2. Go to **Settings → API Keys**, create a new key, and copy it somewhere safe
   — you'll paste it into Vercel in step D

### B. Create the Google Cloud project and enable Chat

1. Go to [console.cloud.google.com](https://console.cloud.google.com), signed
   in as `tim@platinumrealtyboston.com`
2. Create a new project (top bar → **New Project**) — name it something like
   "PRG Corporate Dashboard"
3. On the project's dashboard, copy the **Project number** (not the Project
   ID) — you'll need this in step D
4. Go to **APIs & Services → Library**, search for **Google Chat API**, and
   click **Enable**

### C. Configure the Chat app

1. Still on the Google Chat API page, click the **Configuration** tab
2. Fill in:
   - **App name**: Platinum Realty Assistant
   - **Avatar URL**: your live site's logo, e.g.
     `https://<your-vercel-domain>/logo-icon.png`
   - **Description**: Add agenda items, tasks, and goals by chatting
3. Under **Interactive features**, check both **Receive 1:1 messages** and
   **Join spaces and group conversations**
4. Under **Connection settings**, choose **HTTP endpoint URL** and enter:
   `https://<your-vercel-domain>/api/google-chat`
5. Set **Authentication Audience** to **App's Google Cloud project**
6. Under **Visibility**, choose **Make this Chat app available to specific
   people and groups in platinumrealtygroup.com** and add all 5 team emails
   (or make it available to the whole domain if you'd rather not list people
   individually)
7. Click **Save**

### D. Add the two new environment variables and redeploy

Same as before — Vercel → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | The key you copied in step A |
| `GOOGLE_CHAT_PROJECT_NUMBER` | The Project number you copied in step B |

Then redeploy (Deployments → **⋯** → Redeploy, or push a new commit).

### E. Try it

In Google Chat, search for "Platinum Realty Assistant" and start a DM, or add
it to a Space. If it doesn't recognize you as a team member, it's most often
because Google Chat isn't sharing your email address with the app — that's a
Workspace sharing setting we may need to adjust together; send me what the
bot says and I'll help track it down.

## What's next

- Wiring up QuickBooks Online, Rentvine, and Aptly for the other 7 dashboards
