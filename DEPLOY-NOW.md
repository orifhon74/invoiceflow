# Deploy InvoiceFlow live in ~10 minutes

Everything is configured for a one-shot deploy. You'll create a GitHub repo, push this code, and let Render read the included `render.yaml` blueprint. No prior DevOps knowledge needed.

> The project already includes `render.yaml`, which tells Render exactly how to build, run, attach a persistent database disk, and auto-generate your security secret. You mostly just click "Apply".

---

## Step 1 — Create an empty GitHub repo (2 min)

1. Go to <https://github.com/new> (sign in / create a free account if needed).
2. **Repository name:** `invoiceflow`
3. Leave it **Public** or **Private** — either works.
4. **Do NOT** check "Add a README", ".gitignore", or "license" (keep it empty).
5. Click **Create repository**. Leave that page open — you'll copy the URL.

---

## Step 2 — Push the code (3 min)

Open the **Terminal** app on your Mac and paste these commands one block at a time.

```bash
cd ~/Documents/InvoiceFlow

# fresh, clean git repo (removes any half-initialized one)
rm -rf .git
git init
git add -A
git commit -m "InvoiceFlow initial deploy"
git branch -M main
```

Now connect it to your new GitHub repo. Replace `YOUR-USERNAME` with your GitHub username:

```bash
git remote add origin https://github.com/YOUR-USERNAME/invoiceflow.git
git push -u origin main
```

When prompted to authenticate, a browser window opens — sign in to GitHub and approve. (If it asks for a password on the command line, use a **Personal Access Token** instead of your password: GitHub → Settings → Developer settings → Personal access tokens → Generate. Give it the "repo" scope.)

Refresh your GitHub repo page — you should see all the files.

---

## Step 3 — Deploy on Render (4 min)

1. Go to <https://dashboard.render.com> and sign in (free; you can sign in with GitHub).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub account if asked, then select the **invoiceflow** repo.
4. Render detects `render.yaml` automatically. Click **Apply** / **Create Services**.
5. Wait for the build to finish (first deploy ~2–4 min). You'll get a URL like
   `https://invoiceflow-xxxx.onrender.com`.

That URL is your live app. Open it and create an account.

---

## Step 4 — Final settings (1 min)

In the Render dashboard, open your service → **Environment**:

- Set **`APP_URL`** to your actual Render URL (e.g. `https://invoiceflow-xxxx.onrender.com`).
  This makes the email/share links and Stripe redirects use the right domain.
- `JWT_SECRET` was **auto-generated** by the blueprint — nothing to do.

Click **Save Changes** (it redeploys automatically).

### Optional — turn on real email (Resend)
1. Get a free API key at <https://resend.com> → **API Keys**.
2. In Render → Environment, set `RESEND_API_KEY` to that key. Save.
3. (Later) Verify your own domain in Resend and set `EMAIL_FROM` to an address on it.
   Until then it sends from the Resend test sender, which is fine for trying it out.

### Optional — turn on real payments (Stripe)
Follow `GO-LIVE.md` → Phase 2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and
`STRIPE_WEBHOOK_SECRET` in Render. Until then the upgrade button runs in demo mode.

---

## Notes
- **Free tier sleeps:** Render's free web services spin down after inactivity, so the
  first request after idle takes ~30s to wake. Upgrade to a paid instance ($7/mo) to keep
  it always-on once you have customers.
- **Your data is safe across restarts:** the blueprint mounts a 1 GB persistent disk at
  `/data` and points the SQLite database there (`DB_PATH=/data/invoiceflow.db`).
- **Backups:** periodically download `/data/invoiceflow.db` (Render shell) or move to a
  managed Postgres as you grow.
