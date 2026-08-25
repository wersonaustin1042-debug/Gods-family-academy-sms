# Barima Dua Memorial School — Management System

This is a real, working web app: database, login, enrollment. Attendance and Fees
modules are being added next — this gets you the foundation live first.

## What you need (both free to start)
1. A Supabase account — https://supabase.com (this is your database)
2. A Vercel account — https://vercel.com (this is what makes it a live website)
3. A GitHub account — https://github.com (holds the code so Vercel can deploy it)

## Step 1 — Create the database
1. Go to supabase.com, sign up, click "New Project"
2. Name it "barima-dua-sms", set a database password (save it somewhere), choose a region close to Ghana (e.g. eu-west or similar), click Create
3. Once it's ready, go to the **SQL Editor** tab (left sidebar)
4. Open `supabase/schema.sql` from this project, copy everything, paste it into the SQL editor, click **Run**
5. Go to **Project Settings -> API** — you'll see a "Project URL" and an "anon public" key. Keep this tab open, you'll need both in Step 3.

## Step 2 — Create your admin login
1. In Supabase, go to **Authentication -> Users -> Add user**
2. Enter your email and a password — this is how you'll log into the system
3. Go to **Table Editor -> profiles -> Insert row**
   - `id`: copy the user's ID from the Authentication page
   - `full_name`: your name
   - `role`: type `admin`

## Step 3 — Put the code on GitHub
1. Create a new (empty) repository on github.com, e.g. "barima-dua-sms"
2. Upload all the files from this project into it (GitHub's website lets you drag-and-drop files directly — look for "uploading an existing file" on the empty repo page)

## Step 4 — Make it live with Vercel
1. Go to vercel.com, sign up using your GitHub account
2. Click "Add New -> Project", select your "barima-dua-sms" repository, click Import
3. Before clicking Deploy, expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from Step 1
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key from Step 1
4. Click **Deploy**. In about a minute you'll get a live link like `barima-dua-sms.vercel.app`

## Step 5 — Log in
Go to your live link, sign in with the email/password you created in Step 2.
You should see the Dashboard, then Enrollment — try adding a student.

## Adding the school logo
Once you have the logo file, place it at `/public/logo.png` in the project
(same folder as this README) before uploading to GitHub — it'll appear
automatically on the login page.

---

Next up: Attendance and Fees modules, wired to this same database.
