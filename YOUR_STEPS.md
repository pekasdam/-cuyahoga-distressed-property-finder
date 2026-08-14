# Your remaining steps (iPhone-friendly)

I prepared everything that can be prepared without owning your GitHub account. Once you do Step 1, ChatGPT can handle the repository file upload through the connected GitHub app.

## 1. Create one empty GitHub repository
Name it exactly: `cuyahoga-distressed-property-finder`

- Public repository
- Do **not** add a README
- Do **not** add a .gitignore
- Do **not** add a license

## 2. Make sure ChatGPT's GitHub app can see the new repo
If your GitHub App installation is set to selected repositories, add `cuyahoga-distressed-property-finder` to the allowed list.

## 3. Come back to ChatGPT and say: `repo created`
ChatGPT can then upload the prepared project files and verify them.

## 4. Turn on the iPhone web app with GitHub Pages
After the files are uploaded: GitHub repo → Settings → Pages → deploy from the `main` branch and `/docs` folder.

When GitHub gives you the Pages address, open it in Safari → Share → Add to Home Screen.

## 5. GitHub Actions
The included workflow scans hourly. If GitHub asks for workflow permission, allow Actions to write repository contents so `data/leads.json` can update.

That's it. The app itself, scraper, scoring, tests, mobile dashboard, and hourly workflow are already in the package.
