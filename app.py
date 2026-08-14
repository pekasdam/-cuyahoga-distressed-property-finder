from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st

DATA_PATH = Path("data/leads.json")

st.set_page_config(page_title="Cuyahoga Distressed Property Finder", page_icon="🏚️", layout="wide")

st.markdown(
    """
    <style>
      .block-container {padding-top: 1.2rem; padding-bottom: 3rem;}
      div[data-testid="stMetric"] {border: 1px solid rgba(120,120,120,.22); padding: 12px; border-radius: 12px;}
      .hot {font-weight:700;}
    </style>
    """,
    unsafe_allow_html=True,
)


def load_data() -> dict:
    if not DATA_PATH.exists():
        return {"generated_at": "Never", "stats": {}, "leads": []}
    try:
        return json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"generated_at": "Unreadable data file", "stats": {}, "leads": []}


def money(v):
    if v in (None, ""):
        return "—"
    try:
        return f"${float(v):,.0f}"
    except Exception:
        return str(v)


def lead_row(lead: dict) -> dict:
    p = lead.get("parcel") or {}
    return {
        "Score": lead.get("score", 0),
        "Type": "Foreclosure" if lead.get("lead_type") == "foreclosure" else "Tired landlord",
        "Address": p.get("property_address") or "Needs parcel match",
        "ZIP": p.get("zip_code") or "",
        "Owner / Defendant": p.get("owner") or lead.get("owner_or_defendant") or "",
        "Parcel": p.get("parcel_pin") or "",
        "Land Use": p.get("land_use") or "",
        "Certified Tax Value": p.get("certified_tax_total"),
        "Absentee": p.get("absentee", False),
        "Multi-family": p.get("is_multifamily", False),
        "Eviction Hits": lead.get("repeat_eviction_count", 0),
        "Portfolio": lead.get("portfolio_count", 0),
        "Filed / Hearing": lead.get("filed_or_hearing_date") or "",
        "Lead ID": lead.get("lead_id", ""),
    }


def render_details(lead: dict):
    p = lead.get("parcel") or {}
    st.subheader(lead.get("title") or "Lead")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Deal score", f"{lead.get('score', 0)}/100")
    c2.metric("Certified tax value", money(p.get("certified_tax_total")))
    c3.metric("Eviction hits", lead.get("repeat_eviction_count", 0))
    c4.metric("Portfolio parcels", lead.get("portfolio_count", 0))

    st.write(f"**Property:** {p.get('property_address') or 'Not matched yet'}")
    st.write(f"**Owner:** {p.get('owner') or lead.get('owner_or_defendant') or 'Unknown'}")
    st.write(f"**Parcel:** {p.get('parcel_pin') or 'Unknown'}")
    st.write(f"**Land use:** {p.get('land_use') or 'Unknown'}")
    if p.get("mailing_address"):
        st.write(
            "**Tax mailing address:** "
            f"{p.get('mailing_address', '')}, {p.get('mailing_city', '')}, "
            f"{p.get('mailing_state', '')} {p.get('mailing_zip', '')}"
        )
    if lead.get("submission_id"):
        st.write(f"**E-filing submission:** {lead['submission_id']}")
    if lead.get("case_number"):
        st.write(f"**Housing case:** {lead['case_number']} — {lead.get('hearing_type', '')}")

    if lead.get("notes"):
        st.markdown("**Why it scored this way**")
        for n in lead["notes"]:
            st.write(f"• {n}")

    cols = st.columns(3)
    if p.get("myplace_url"):
        cols[0].link_button("Open MyPlace", p["myplace_url"], use_container_width=True)
    if lead.get("source_url"):
        cols[1].link_button("Open court source", lead["source_url"], use_container_width=True)
    if lead.get("source_document_url"):
        cols[2].link_button("Filed documents", lead["source_document_url"], use_container_width=True)

    if lead.get("lead_type") == "tired_landlord":
        st.info(
            "The eviction docket identifies the landlord. The parcel shown is matched from that owner's Cleveland portfolio; "
            "it may not be the exact property involved in the eviction. Verify before contacting anyone."
        )


data = load_data()
leads = data.get("leads", [])
st.title("🏚️ Cuyahoga Distressed Property Finder")
st.caption("Foreclosure filings + Cleveland eviction/tired-landlord signals + Cuyahoga parcel data")

stats = data.get("stats", {})
m1, m2, m3, m4 = st.columns(4)
m1.metric("All leads", stats.get("total_leads", len(leads)))
m2.metric("Hot leads", stats.get("hot_leads", sum(1 for x in leads if x.get("score", 0) >= 70)))
m3.metric("Foreclosure leads", stats.get("foreclosure_leads", sum(1 for x in leads if x.get("lead_type") == "foreclosure")))
m4.metric("Tired-landlord parcels", stats.get("tired_landlord_parcel_leads", sum(1 for x in leads if x.get("lead_type") == "tired_landlord")))
st.caption(f"Last scan: {data.get('generated_at', 'Never')}")
health = stats.get("source_health", {})
if health:
    fc_health = health.get("foreclosures", "unknown")
    ev_health = health.get("housing_court", "unknown")
    if "error" in (fc_health, ev_health) or "stale" in (fc_health, ev_health):
        st.warning(f"Source health — Foreclosures: {fc_health.upper()} | Housing Court: {ev_health.upper()}. Stale means the app kept the last good leads instead of erasing them.")
    else:
        st.success(f"Source health — Foreclosures: {fc_health.upper()} | Housing Court: {ev_health.upper()}")

if not leads:
    st.warning("No lead data yet. Run `python scraper.py` or the GitHub Actions workflow to populate data/leads.json.")
    st.stop()

with st.sidebar:
    st.header("Filters")
    min_score = st.slider("Minimum score", 0, 100, 55, 5)
    lead_types = st.multiselect("Lead type", ["Foreclosure", "Tired landlord"], default=["Foreclosure", "Tired landlord"])
    max_value = st.number_input("Max certified tax value", min_value=0, value=125000, step=5000)
    residential_only = st.checkbox("Residential only", value=True)
    multifamily_only = st.checkbox("Multi-family only", value=False)
    absentee_only = st.checkbox("Absentee owners only", value=False)
    tax_fc_only = st.checkbox("Tax foreclosures only", value=False)

rows = [lead_row(x) for x in leads]
df = pd.DataFrame(rows)
filtered = df[df["Score"] >= min_score].copy()
if lead_types:
    filtered = filtered[filtered["Type"].isin(lead_types)]
if max_value:
    filtered = filtered[(filtered["Certified Tax Value"].isna()) | (filtered["Certified Tax Value"] <= max_value)]
if residential_only:
    # Land Use may be blank for unmatched foreclosure leads, so retain unmatched rows.
    filtered = filtered[(filtered["Address"] == "Needs parcel match") | filtered["Land Use"].str.contains("SINGLE|TWO|THREE|FAMILY|RESIDENT|APART|DWELL|CONDO", case=False, regex=True, na=False)]
if multifamily_only:
    filtered = filtered[filtered["Multi-family"] == True]  # noqa: E712
if absentee_only:
    filtered = filtered[filtered["Absentee"] == True]  # noqa: E712
if tax_fc_only:
    ids = {x.get("lead_id") for x in leads if x.get("tax_foreclosure")}
    filtered = filtered[filtered["Lead ID"].isin(ids)]

filtered = filtered.sort_values(["Score", "Certified Tax Value"], ascending=[False, True], na_position="last")

hot_tab, fc_tab, landlord_tab, about_tab = st.tabs(["🔥 Hot Leads", "🏚️ Foreclosures", "🔑 Tired Landlords", "ℹ️ About"])

with hot_tab:
    st.subheader(f"{len(filtered)} matching leads")
    display_cols = ["Score", "Type", "Address", "ZIP", "Owner / Defendant", "Parcel", "Land Use", "Certified Tax Value", "Absentee", "Multi-family", "Eviction Hits", "Portfolio", "Filed / Hearing"]
    st.dataframe(
        filtered[display_cols],
        use_container_width=True,
        hide_index=True,
        column_config={
            "Certified Tax Value": st.column_config.NumberColumn(format="$%d"),
            "Score": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d"),
        },
    )
    if len(filtered):
        selected = st.selectbox("Open lead details", filtered["Lead ID"].tolist(), format_func=lambda lid: f"{int(filtered.loc[filtered['Lead ID'] == lid, 'Score'].iloc[0])} — {filtered.loc[filtered['Lead ID'] == lid, 'Address'].iloc[0]}")
        lead = next((x for x in leads if x.get("lead_id") == selected), None)
        if lead:
            render_details(lead)

with fc_tab:
    fc = [x for x in leads if x.get("lead_type") == "foreclosure"]
    st.write(f"**{len(fc)} foreclosure leads** from newly submitted Cuyahoga Clerk foreclosure complaints.")
    if fc:
        fdf = pd.DataFrame([lead_row(x) for x in fc]).sort_values("Score", ascending=False)
        st.dataframe(fdf[["Score", "Address", "Owner / Defendant", "Parcel", "Certified Tax Value", "Filed / Hearing"]], use_container_width=True, hide_index=True)

with landlord_tab:
    ev = [x for x in leads if x.get("lead_type") == "tired_landlord"]
    st.write(f"**{len(ev)} parcel opportunities** tied to landlords appearing on the Cleveland Housing Court docket.")
    if ev:
        edf = pd.DataFrame([lead_row(x) for x in ev]).sort_values(["Eviction Hits", "Score"], ascending=False)
        st.dataframe(edf[["Score", "Address", "Owner / Defendant", "Parcel", "Certified Tax Value", "Eviction Hits", "Portfolio", "Absentee"]], use_container_width=True, hide_index=True)

with about_tab:
    st.markdown(
        """
        ### What this app does
        - Watches newly submitted **Cuyahoga County foreclosure complaints**.
        - Reads complaint ZIP/PDF documents when available to find parcel numbers.
        - Enriches matched parcels with the county's **official ArcGIS property layer**.
        - Watches the **Cleveland Housing Court civil docket** for eviction/default signals.
        - Finds Cleveland parcels owned by those landlords and scores possible tired-landlord acquisitions.

        ### Important
        Certified tax value is **not an ARV or market-value estimate**. Court and GIS data should be verified against official records before making an offer or acquisition decision. The app does not contact tenants and does not infer protected personal characteristics.
        """
    )
