# 🌿 Herb Web Dashboard — READY FOR DEPLOYMENT

## What's Been Built

Your Herb web dashboard is complete and ready to deploy. Here's what you have:

### Frontend (React + Next.js 14)
```
web/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Root (redirects to login/dashboard)
│   │   ├── login/page.tsx        # Microsoft SSO login
│   │   ├── dashboard/page.tsx    # Main dashboard (search list)
│   │   ├── new-search/page.tsx   # Mandate submission form
│   │   ├── results/[id]/page.tsx # Results viewer + feedback form
│   │   ├── globals.css           # Tailwind styles
│   │   └── layout.tsx            # Root layout
│   └── lib/
│       ├── supabase.ts           # Supabase client + types
│       └── api.ts                # API client functions
├── next.config.js
└── tsconfig.json
```

**Pages:**
- **Login** - Microsoft SSO (icoscapital.com)
- **Dashboard** - List of all searches, status, quick actions
- **New Search** - Form to submit mandate (theme, keywords, geography, stage, mode)
- **Results** - View longlist, Icos Fit scores, download Excel, submit feedback

### Backend (Vercel Functions)
```
api/functions/
├── mandate-submit.ts    # POST /api/mandate/submit
├── runs-list.ts        # GET /api/runs
├── results-get.ts      # GET /api/results/[id]
├── feedback-submit.ts  # POST /api/feedback/[id]
└── download-longlist.ts # GET /api/download/[id]
```

**API Endpoints:**
- `POST /api/mandate/submit` - Create new search
- `GET /api/runs?limit=20&offset=0` - List user's searches
- `GET /api/results/[id]` - Get longlist + scores
- `POST /api/feedback/[id]` - Submit feedback/reply
- `GET /api/download/[id]` - Download Excel longlist

### Database (Supabase)
- `user_profiles` - User account info
- `herb_runs` - Search requests (status, progress)
- `herb_results` - Longlists (Excel files)
- `icos_fit_scores` - Company evaluations (scores + verdict)
- `herb_feedback` - User replies
- `herb_pipedrive_deals` - Created deals (audit trail)

All tables have Row Level Security (RLS) so users only see their own data.

---

## Quick Start (4 Steps)

### Step 1: Create Supabase Schema
1. Go to https://supabase.com → `icos-fundraise` project
2. SQL Editor → New Query
3. Copy entire contents of `schema.sql` from this repo
4. Run it

### Step 2: Setup Microsoft SSO
1. Supabase → Authentication → Providers → Enable **Azure**
2. Azure Portal (portal.azure.com):
   - App Registration → New app: "Herb Web"
   - Copy: Client ID, Tenant ID
   - Create Client Secret (copy immediately)
   - Redirect URI: `https://[SUPABASE_PROJECT_ID].supabase.co/auth/v1/callback?provider=azure`
3. Paste into Supabase Azure settings

### Step 3: Deploy to Vercel
1. https://vercel.com/dashboard → Add New Project
2. Select `Icoscapital/herb`
3. Framework: Next.js
4. Root Directory: `./`
5. Add Environment Variables (see below)
6. Deploy

**Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
GRAPH_TENANT_ID=4a638930-1aec-4273-af14-6115c2022bdb
GRAPH_CLIENT_ID=ec685636-cd5a-44b1-9a4f-889a64be7f93
GRAPH_CLIENT_SECRET=pks8Q~~lhGaXQx94Lafn9rWrC7shCEJfsZVi2drV
PIPEDRIVE_TOKEN=4390e394dc7974a3c32766c7cc7b8bac2b47a424
PIPEDRIVE_DOMAIN=icoscapital
USER_PIPEDRIVE_ID=5523
USER_INVESTMENT_MANAGER_OPTION_ID=423
DEFAULT_PIPELINE_ID=9
DEFAULT_STAGE_ID=141
```

### Step 4: Point Domain
1. Vercel → Domains → Add `herb.icoscapital.com`
2. Follow DNS setup instructions
3. Wait 10-30 minutes for DNS propagation

**Done!** Visit `https://herb.icoscapital.com` → Login → Create search mandate

---

## How It Works

### User Workflow:
1. **Login**: Click "Sign in with Microsoft" → icoscapital.com account
2. **Submit**: Fill form (theme, keywords, geography, stage, mode)
3. **Track**: Dashboard shows `SEARCHING` → `READY` → `FEEDBACK_PENDING` → `COMPLETE`
4. **View**: Click search → see longlist, Icos Fit scores
5. **Download**: Export Excel with company data
6. **Feedback**: Submit reply ("iterate", "score", or "finalize")
7. **Email**: Get notification when next results are ready

### Backend Workflow:
1. API receives mandate → stores in Supabase `herb_runs` table
2. Triggers Herb search (via GitHub Actions or background job)
3. Herb searches companies, builds longlist.xlsx, evaluates with Icos Fit
4. Stores results in `herb_results` + `icos_fit_scores` tables
5. Updates run status to `READY`
6. Sends email notification: "Results ready → visit dashboard"
7. User provides feedback via form
8. Loop continues until `FINALIZE`

---

## What's NOT Yet Wired:

1. **Herb Search Execution** - API accepts mandates but doesn't run Herb yet
   - Need: GitHub Actions workflow to spawn `herb_web_run.py`
   - Or: Background job queue (Bull/Redis)

2. **Email Notifications** - Results page works, but emails not sent yet
   - Need: Graph API email sending when search completes
   - Template: T4 "Results ready"

3. **Pipedrive Integration** - Database structure ready, not wired yet
   - Need: When user approves, auto-create deal in Pipedrive

---

## Next Phases

**Phase A** (Done):
- ✅ Frontend dashboard
- ✅ Backend API
- ✅ Supabase schema
- ✅ Microsoft SSO
- ✅ Vercel deployment ready

**Phase B** (Ready to implement):
- Herb search execution (trigger from API)
- Email notifications (T4 templates)
- Pipedrive deal creation (Phase 6)

**Phase C** (Polish):
- Analytics dashboard
- Admin panel
- Feedback metrics
- Team performance reports

---

## Files Reference

| File | Purpose |
|------|---------|
| `schema.sql` | Supabase schema (copy to SQL Editor) |
| `HERB_WEB_SETUP.md` | Detailed setup guide |
| `vercel.json` | Monorepo config for Vercel |
| `package.json` (root) | Workspace config |
| `web/src/app/*.tsx` | Frontend pages |
| `api/functions/*.ts` | Backend handlers |

---

## Troubleshooting

**"Sign in failed"**
→ Check Microsoft SSO in Supabase, verify redirect URI

**"Run not found"**
→ Check Supabase credentials in Vercel, ensure RLS policies exist

**"Database error"**
→ Run `schema.sql` again, verify service role key is correct

**Vercel build fails**
→ Check Node version, run `npm run build:all` locally first

---

## Team Access

Once deployed:
- Share link: `https://herb.icoscapital.com`
- Team members login with icoscapital.com email
- Each person only sees their own searches (RLS)
- All longlists/scores downloadable as Excel

---

## Support

Questions? Review:
- `HERB_WEB_SETUP.md` — Full step-by-step guide
- `schema.sql` — Database design
- `web/src/lib/api.ts` — Frontend API client
- `api/functions/*` — Backend implementations

You're ready to go! 🚀
