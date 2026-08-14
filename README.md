# Cuyahoga Distressed Property Finder

A public-record lead finder for acquiring distressed residential property in Cleveland / Cuyahoga County.

## What it scans

1. **Cuyahoga County Clerk of Courts — Submitted E-Filing Complaints**  
   Filters newly submitted cases to `FORECLOSURES`. When a filing exposes a complaint-document ZIP, the scraper can inspect PDFs for parcel numbers and street-address candidates.

2. **Cleveland Housing Court — Accessible Civil Docket**  
   Finds eviction/default docket appearances, groups them by landlord/plaintiff, and looks for repeat filings.

3. **Cuyahoga County GIS — Open Data Parcels**  
   Enriches leads with parcel number, deeded owner, property address, tax mailing address, land use, certified tax value, residential building count, living area, and latest recorded sale fields.

## Lead types

- **Foreclosure** — newest foreclosure complaints, with tax foreclosures boosted in the deal score.
- **Tired landlord** — landlords with eviction/default docket activity, matched to their Cleveland parcel portfolio.

> The Housing Court docket identifies the landlord, but not necessarily the exact eviction address on the accessible docket. The app therefore treats matched owner parcels as **portfolio acquisition leads**, not as proven eviction-property matches.

## Deal score

Scores are triage signals, not appraisals. They reward factors such as:

- new foreclosure filing
- County Treasurer tax foreclosure
- parcel number extracted from the complaint
- residential use
- possible multi-family use
- absentee-owner mailing pattern
- certified tax value at/below configurable acquisition ranges
- repeat eviction/default appearances
- multi-property landlord portfolio

**Certified tax value is not ARV or market value.** Always verify title, liens, occupancy, property condition, court status, and current ownership before making an offer.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python scraper.py
streamlit run app.py
```

The scraper writes `data/leads.json`.

### Faster test run

Skip complaint-document inspection:

```bash
python scraper.py --no-documents
```

## Automatic scans

`.github/workflows/scan.yml` runs every hour and can also be started manually from **Actions → Scan Cuyahoga Distressed Leads → Run workflow**. It runs the tests first, scans the public sources, preserves last-good data if a source is temporarily unavailable, and commits updated lead data back to the repository.

The parcel enrichment now queries both official Open Data Parcels layers: Cleveland and the rest of Cuyahoga County.

## iPhone-friendly web app (recommended)

The `docs/` folder contains a mobile PWA that reads the same lead data. Enable **GitHub Pages** from the `main` branch `/docs` folder, open the Pages URL in Safari, then use **Share → Add to Home Screen**. No separate app hosting service is required.

## Optional Streamlit dashboard

If you want the richer desktop dashboard too, deploy `app.py` on Streamlit Community Cloud.

## Public sources

- Cuyahoga Clerk submitted e-filings: `https://cpdocket.cp.cuyahogacounty.gov/SubmittedEfilingComplaints.aspx?isprint=Y`
- Cleveland Housing Court accessible civil docket: `https://www.clevelandhousingcourt.org/accessible-civil-docket`
- Cuyahoga GIS Open Data Parcels layer: `https://gis.cuyahogacounty.gov/server/rest/services/Open_Data_Parcels/MapServer/0`

## Privacy / compliance design

This project is intentionally limited to public court/property records and property-acquisition signals. It does not scrape private accounts, bypass access controls, contact tenants, or score people using protected personal characteristics.
