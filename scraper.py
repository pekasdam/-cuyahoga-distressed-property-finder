from __future__ import annotations

import argparse
import base64
import io
import json
import logging
import math
import os
import re
import time
import zipfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote, urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

LOGGER = logging.getLogger("cuyahoga_distressed")

FORECLOSURE_URL = "https://cpdocket.cp.cuyahogacounty.gov/SubmittedEfilingComplaints.aspx?isprint=Y"
HOUSING_DOCKET_URL = "https://www.clevelandhousingcourt.org/accessible-civil-docket"
GIS_QUERY_URLS = [
    "https://gis.cuyahogacounty.gov/server/rest/services/Open_Data_Parcels/MapServer/0/query",  # Cleveland
    "https://gis.cuyahogacounty.gov/server/rest/services/Open_Data_Parcels/MapServer/1/query",  # Rest of Cuyahoga County
]
MYPLACE_ROOT = "https://myplace.cuyahogacounty.gov"
USER_AGENT = (
    "Mozilla/5.0 (compatible; CuyahogaDistressedPropertyFinder/1.0; "
    "+https://github.com/pekasdam)"
)

PIN_RE = re.compile(r"\b(\d{3})[-\s]?(\d{2})[-\s]?(\d{3})\b")
OHIO_ADDRESS_RE = re.compile(
    r"\b(\d{1,5}\s+(?:N\s+|S\s+|E\s+|W\s+)?[A-Z0-9][A-Z0-9 .'-]{2,45}?"
    r"(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|BLVD|BOULEVARD|LN|LANE|CT|COURT|PL|PLACE|WAY|PKWY|PARKWAY))\b",
    re.I,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_owner(value: str) -> str:
    value = clean_text(value).upper()
    value = re.sub(r"\bET\s+AL\.?\b", "", value)
    value = re.sub(r"[^A-Z0-9& ]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def split_style(style: str) -> tuple[str, str]:
    parts = re.split(r"\s+vs\.?\s+", clean_text(style), maxsplit=1, flags=re.I)
    if len(parts) == 2:
        return parts[0].strip(" ,."), parts[1].strip(" ,.")
    return clean_text(style), ""


def normalize_pin(pin: str | None) -> str:
    if not pin:
        return ""
    digits = re.sub(r"\D", "", pin)
    return digits[:9] if len(digits) >= 9 else digits


def display_pin(pin: str | None) -> str:
    pin = normalize_pin(pin)
    if len(pin) == 8:
        return f"{pin[:3]}-{pin[3:5]}-{pin[5:]}"
    if len(pin) == 9:
        return f"{pin[:3]}-{pin[3:5]}-{pin[5:]}"
    return pin


def myplace_url(pin: str | None) -> str:
    pin = normalize_pin(pin)
    if not pin:
        return MYPLACE_ROOT
    token = base64.b64encode(pin.encode()).decode()
    return f"{MYPLACE_ROOT}/{quote(token, safe='')}?city=OTk%3D&searchBy=UGFyY2Vs"


def safe_float(value: Any) -> float | None:
    try:
        if value in (None, "", "None"):
            return None
        f = float(value)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


@dataclass
class Parcel:
    parcel_pin: str = ""
    owner: str = ""
    property_address: str = ""
    city: str = ""
    zip_code: str = ""
    mailing_address: str = ""
    mailing_city: str = ""
    mailing_state: str = ""
    mailing_zip: str = ""
    land_use: str = ""
    certified_tax_total: float | None = None
    residential_buildings: float | None = None
    living_area_sqft: float | None = None
    last_sale_amount: float | None = None
    transfer_date: str = ""
    myplace_url: str = ""

    @property
    def absentee(self) -> bool:
        if not self.property_address or not self.mailing_address:
            return False
        prop = normalize_owner(self.property_address)
        mail = normalize_owner(self.mailing_address)
        return prop not in mail and mail not in prop


@dataclass
class Lead:
    lead_id: str
    lead_type: str
    score: int
    status: str
    title: str
    owner_or_defendant: str = ""
    plaintiff: str = ""
    case_number: str = ""
    submission_id: str = ""
    filed_or_hearing_date: str = ""
    hearing_type: str = ""
    tax_foreclosure: bool = False
    repeat_eviction_count: int = 0
    portfolio_count: int = 0
    parcel: Parcel | None = None
    source_url: str = ""
    source_document_url: str = ""
    notes: list[str] = field(default_factory=list)
    generated_at: str = field(default_factory=now_iso)


def request(session: requests.Session, url: str, *, params: dict[str, Any] | None = None, timeout: int = 30) -> requests.Response:
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            resp = session.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Request failed for {url}: {last_exc}")


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})
    return s


def extract_pdf_text(pdf_bytes: bytes, max_pages: int = 15) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        chunks: list[str] = []
        for page in reader.pages[:max_pages]:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001
                continue
        return "\n".join(chunks)
    except Exception:  # noqa: BLE001
        return ""


def extract_document_signals(zip_bytes: bytes) -> tuple[list[str], list[str]]:
    pins: list[str] = []
    addresses: list[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = [n for n in zf.namelist() if n.lower().endswith(".pdf")][:8]
            for name in names:
                text = extract_pdf_text(zf.read(name))
                for m in PIN_RE.finditer(text):
                    pin = normalize_pin("".join(m.groups()))
                    if pin and pin not in pins:
                        pins.append(pin)
                for m in OHIO_ADDRESS_RE.finditer(text.upper()):
                    addr = clean_text(m.group(1))
                    if addr and addr not in addresses:
                        addresses.append(addr)
    except Exception:  # noqa: BLE001
        pass
    return pins[:5], addresses[:5]


def parse_foreclosure_table(html: str, base_url: str = FORECLOSURE_URL) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    records: list[dict[str, str]] = []
    for tr in soup.find_all("tr"):
        tds = tr.find_all(["td", "th"])
        if len(tds) < 5:
            continue
        vals = [clean_text(td.get_text(" ", strip=True)) for td in tds]
        if vals[0].lower().startswith("submission"):
            continue
        category = vals[3] if len(vals) > 3 else ""
        if "FORECLOS" not in category.upper():
            continue
        link = tr.find("a", href=True)
        document_url = urljoin(base_url, link["href"]) if link else ""
        records.append(
            {
                "submission_id": vals[0],
                "title": vals[1],
                "submission_date": vals[2],
                "category": category,
                "status": vals[4],
                "document_url": document_url,
            }
        )
    return records


def scrape_foreclosures(
    session: requests.Session,
    inspect_documents: bool = True,
    max_documents: int = 30,
    max_records: int = 30,
) -> list[dict[str, Any]]:
    resp = request(session, FORECLOSURE_URL)
    all_rows = parse_foreclosure_table(resp.text)
    LOGGER.info("Found %s foreclosure submissions", len(all_rows))

    # The Clerk page is chronological oldest-to-newest. For an hourly acquisition
    # scanner we only need the newest filings; limiting the records also prevents
    # hundreds of unnecessary GIS owner lookups on every run.
    if max_records > 0:
        rows = list(reversed(all_rows[-max_records:]))
    else:
        rows = list(reversed(all_rows))
    LOGGER.info("Processing %s newest foreclosure submissions", len(rows))

    if not inspect_documents:
        return rows

    for idx, row in enumerate(rows[:max_documents]):
        url = row.get("document_url")
        if not url:
            continue
        try:
            doc = request(session, url, timeout=45)
            pins, addresses = extract_document_signals(doc.content)
            row["parcel_candidates"] = pins
            row["address_candidates"] = addresses
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Could not inspect foreclosure documents %s: %s", row.get("submission_id"), exc)
            row["parcel_candidates"] = []
            row["address_candidates"] = []
    return rows


def parse_housing_docket(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    records: list[dict[str, str]] = []
    for table in soup.find_all("table"):
        headers = [clean_text(th.get_text(" ", strip=True)).lower() for th in table.find_all("th")]
        if not headers or not any("case" in h for h in headers):
            continue
        for tr in table.find_all("tr"):
            cells = tr.find_all(["th", "td"])
            if len(cells) < 5:
                continue
            vals = [clean_text(cell.get_text(" ", strip=True)) for cell in cells]
            if vals[0].lower().startswith("case"):
                continue
            hearing_type = vals[4]
            if "EVICTION" not in hearing_type.upper() and "DEFAULT" not in hearing_type.upper():
                continue
            plaintiff, defendant = split_style(vals[1])
            records.append(
                {
                    "case_number": vals[0],
                    "style": vals[1],
                    "plaintiff": plaintiff,
                    "defendant": defendant,
                    "hearing_date": vals[2],
                    "hearing_time": vals[3],
                    "hearing_type": hearing_type,
                }
            )
    return records


def scrape_evictions(session: requests.Session) -> list[dict[str, str]]:
    resp = request(session, HOUSING_DOCKET_URL)
    rows = parse_housing_docket(resp.text)
    LOGGER.info("Found %s eviction/default docket rows", len(rows))
    return rows


def arcgis_query(session: requests.Session, where: str, out_fields: Iterable[str], result_limit: int = 2000) -> list[dict[str, Any]]:
    """Query both official Cuyahoga parcel layers and de-duplicate by parcel PIN."""
    params = {
        "where": where,
        "outFields": ",".join(out_fields),
        "returnGeometry": "false",
        "resultRecordCount": result_limit,
        "f": "json",
    }
    rows: list[dict[str, Any]] = []
    errors: list[str] = []
    for url in GIS_QUERY_URLS:
        try:
            resp = request(session, url, params=params)
            payload = resp.json()
            if "error" in payload:
                raise RuntimeError(payload["error"])
            rows.extend(f.get("attributes", {}) for f in payload.get("features", []))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{url}: {exc}")
    if not rows and errors:
        raise RuntimeError("; ".join(errors))
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for row in rows:
        key = normalize_pin(clean_text(row.get("parcelpin"))) or json.dumps(row, sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique[:result_limit]


PARCEL_FIELDS = [
    "parcelpin",
    "deeded_owner",
    "par_addr_all",
    "par_city",
    "par_zip",
    "mail_addr_street",
    "mail_unit",
    "mail_city",
    "mail_state",
    "mail_zip",
    "tax_luc_description",
    "certified_tax_total",
    "res_bldg_count",
    "total_res_liv_area",
    "sales_amount",
    "transfer_date",
]


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def parcel_from_attrs(attrs: dict[str, Any]) -> Parcel:
    pin = normalize_pin(clean_text(attrs.get("parcelpin")))
    mail = " ".join(
        p for p in [clean_text(attrs.get("mail_addr_street")), clean_text(attrs.get("mail_unit"))] if p
    )
    transfer = attrs.get("transfer_date")
    transfer_date = ""
    if isinstance(transfer, (int, float)) and transfer:
        try:
            transfer_date = datetime.fromtimestamp(transfer / 1000, tz=timezone.utc).date().isoformat()
        except Exception:  # noqa: BLE001
            pass
    return Parcel(
        parcel_pin=display_pin(pin),
        owner=clean_text(attrs.get("deeded_owner")),
        property_address=clean_text(attrs.get("par_addr_all")),
        city=clean_text(attrs.get("par_city")),
        zip_code=clean_text(attrs.get("par_zip")).replace(".0", ""),
        mailing_address=mail,
        mailing_city=clean_text(attrs.get("mail_city")),
        mailing_state=clean_text(attrs.get("mail_state")),
        mailing_zip=clean_text(attrs.get("mail_zip")),
        land_use=clean_text(attrs.get("tax_luc_description")),
        certified_tax_total=safe_float(attrs.get("certified_tax_total")),
        residential_buildings=safe_float(attrs.get("res_bldg_count")),
        living_area_sqft=safe_float(attrs.get("total_res_liv_area")),
        last_sale_amount=safe_float(attrs.get("sales_amount")),
        transfer_date=transfer_date,
        myplace_url=myplace_url(pin),
    )


def query_parcel_by_pin(session: requests.Session, pin: str) -> list[Parcel]:
    pin = normalize_pin(pin)
    if not pin:
        return []
    rows = arcgis_query(session, f"parcelpin='{sql_escape(pin)}'", PARCEL_FIELDS, result_limit=10)
    return [parcel_from_attrs(r) for r in rows]


def owner_tokens(owner: str) -> list[str]:
    stop = {
        "LLC", "INC", "LTD", "LP", "CO", "COMPANY", "CORP", "CORPORATION", "THE",
        "OF", "OHIO", "AND", "ET", "AL", "TRUST", "LIMITED", "LIABILITY"
    }
    toks = [t for t in normalize_owner(owner).split() if len(t) >= 3 and t not in stop]
    return toks[:4]


def query_parcels_by_owner(session: requests.Session, owner: str, limit: int = 100) -> list[Parcel]:
    toks = owner_tokens(owner)
    if not toks:
        return []
    clauses = [f"UPPER(deeded_owner) LIKE '%{sql_escape(t)}%'" for t in toks]
    where = " AND ".join(clauses)
    rows = arcgis_query(session, where, PARCEL_FIELDS, result_limit=limit)
    parcels = [parcel_from_attrs(r) for r in rows]
    # Keep only reasonably close matches after the broad ArcGIS query.
    nowner = normalize_owner(owner)
    important = set(owner_tokens(nowner))
    out: list[Parcel] = []
    for p in parcels:
        ptoks = set(owner_tokens(p.owner))
        if important and len(important & ptoks) >= min(2, len(important)):
            out.append(p)
        elif len(important) == 1 and important & ptoks:
            out.append(p)
    return out


def is_residential(parcel: Parcel) -> bool:
    lu = parcel.land_use.upper()
    keywords = ("SINGLE", "TWO", "THREE", "FAMILY", "RESIDENT", "APART", "DWELL", "CONDO")
    return bool(parcel.residential_buildings and parcel.residential_buildings > 0) or any(k in lu for k in keywords)


def is_multifamily(parcel: Parcel) -> bool:
    lu = parcel.land_use.upper()
    return any(k in lu for k in ("TWO", "THREE", "MULTI", "APART", "DUPLEX"))


INSTITUTIONAL_OWNER_MARKERS = (
    "CHN HOUSING",
    "CLEVELAND HOUSING NETWORK",
    "CUYAHOGA METROPOLITAN HOUSING AUTHORITY",
    "CMHA",
    "CITY OF CLEVELAND",
    "CUYAHOGA COUNTY LAND REUTILIZATION",
    "LAND REUTILIZATION",
    "LAND BANK",
    "LIHTC",
)


def owner_is_institutional(owner: str) -> bool:
    n = normalize_owner(owner)
    return any(marker in n for marker in INSTITUTIONAL_OWNER_MARKERS)


def lead_quality_flags(lead: Lead) -> list[str]:
    flags: list[str] = []
    parcel = lead.parcel
    if parcel is None:
        return ["missing_parcel"]
    owner = parcel.owner or lead.owner_or_defendant
    address = clean_text(parcel.property_address)
    if owner_is_institutional(owner):
        flags.append("institutional_owner")
    if not address:
        flags.append("missing_address")
    elif re.match(r"^0+\b", address):
        flags.append("zero_address")
    if not is_residential(parcel):
        flags.append("nonresidential")
    if parcel.residential_buildings is not None and parcel.residential_buildings <= 0:
        flags.append("no_residential_building")
    return flags


def is_best_deal(lead: Lead) -> bool:
    hard_excludes = {
        "missing_parcel", "institutional_owner", "missing_address",
        "zero_address", "nonresidential", "no_residential_building",
    }
    return lead.score >= 70 and not (hard_excludes & set(lead_quality_flags(lead)))


def score_foreclosure(parcel: Parcel | None, tax_foreclosure: bool, document_match: bool) -> tuple[int, list[str]]:
    score = 38
    notes = ["New foreclosure filing"]
    if tax_foreclosure:
        score += 14
        notes.append("County Treasurer tax foreclosure")
    if document_match:
        score += 10
        notes.append("Parcel number extracted from filed complaint")
    if parcel:
        if parcel.absentee:
            score += 8
            notes.append("Mailing address differs from property")
        if is_residential(parcel):
            score += 8
            notes.append("Residential parcel")
        if is_multifamily(parcel):
            score += 8
            notes.append("Possible multi-family use")
        if parcel.certified_tax_total is not None:
            if parcel.certified_tax_total <= 100_000:
                score += 8
                notes.append("Certified tax value at or below $100k")
            elif parcel.certified_tax_total <= 150_000:
                score += 4
                notes.append("Certified tax value at or below $150k")
    return min(100, score), notes


def score_eviction_landlord(parcel: Parcel, repeat_count: int, portfolio_count: int) -> tuple[int, list[str]]:
    score = 25
    notes = ["Landlord appears on Cleveland Housing Court eviction/default docket"]
    if repeat_count >= 2:
        score += min(20, repeat_count * 4)
        notes.append(f"{repeat_count} eviction/default docket appearances")
    if portfolio_count >= 2:
        score += min(15, portfolio_count * 2)
        notes.append(f"Matched to {portfolio_count} Cleveland parcels")
    if parcel.absentee:
        score += 8
        notes.append("Absentee-owner mailing pattern")
    if is_residential(parcel):
        score += 8
        notes.append("Residential parcel")
    if is_multifamily(parcel):
        score += 8
        notes.append("Possible multi-family use")
    if parcel.certified_tax_total is not None and parcel.certified_tax_total <= 100_000:
        score += 8
        notes.append("Certified tax value at or below $100k")
    return min(100, score), notes


def build_foreclosure_leads(session: requests.Session, rows: list[dict[str, Any]]) -> list[Lead]:
    leads: list[Lead] = []
    seen: set[str] = set()
    for row in rows:
        title = clean_text(row.get("title"))
        plaintiff, defendant = split_style(title)
        is_tax = "TREASURER OF CUYAHOGA COUNTY" in plaintiff.upper()
        pins = row.get("parcel_candidates") or []
        parcels: list[Parcel] = []
        for pin in pins[:3]:
            try:
                parcels.extend(query_parcel_by_pin(session, pin))
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Parcel lookup failed for %s: %s", pin, exc)

        if not parcels and defendant:
            # Fallback: current owner name from complaint title can often locate the parcel.
            try:
                parcels = query_parcels_by_owner(session, defendant, limit=25)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Owner fallback lookup failed for %s: %s", defendant, exc)

        if not parcels:
            key = f"fc:{row.get('submission_id')}"
            score, notes = score_foreclosure(None, is_tax, False)
            leads.append(
                Lead(
                    lead_id=key,
                    lead_type="foreclosure",
                    score=score,
                    status="Needs parcel match",
                    title=title,
                    owner_or_defendant=defendant,
                    plaintiff=plaintiff,
                    submission_id=clean_text(row.get("submission_id")),
                    filed_or_hearing_date=clean_text(row.get("submission_date")),
                    tax_foreclosure=is_tax,
                    source_url=FORECLOSURE_URL,
                    source_document_url=clean_text(row.get("document_url")),
                    notes=notes + (["Complaint document did not yield a parcel match"] if row.get("document_url") else []),
                )
            )
            continue

        for parcel in parcels[:10]:
            key = f"fc:{row.get('submission_id')}:{normalize_pin(parcel.parcel_pin)}"
            if key in seen:
                continue
            seen.add(key)
            doc_match = normalize_pin(parcel.parcel_pin) in {normalize_pin(p) for p in pins}
            score, notes = score_foreclosure(parcel, is_tax, doc_match)
            leads.append(
                Lead(
                    lead_id=key,
                    lead_type="foreclosure",
                    score=score,
                    status="Hot" if score >= 75 else "Review",
                    title=title,
                    owner_or_defendant=defendant,
                    plaintiff=plaintiff,
                    submission_id=clean_text(row.get("submission_id")),
                    filed_or_hearing_date=clean_text(row.get("submission_date")),
                    tax_foreclosure=is_tax,
                    parcel=parcel,
                    source_url=FORECLOSURE_URL,
                    source_document_url=clean_text(row.get("document_url")),
                    notes=notes,
                )
            )
    return leads


def build_eviction_leads(session: requests.Session, rows: list[dict[str, str]], max_owners: int = 30) -> list[Lead]:
    counts: dict[str, int] = {}
    display_names: dict[str, str] = {}
    latest_case: dict[str, dict[str, str]] = {}
    for row in rows:
        plaintiff = clean_text(row.get("plaintiff"))
        key = normalize_owner(plaintiff)
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        display_names[key] = plaintiff
        latest_case[key] = row

    leads: list[Lead] = []
    for owner_key, repeat_count in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:max_owners]:
        owner = display_names[owner_key]
        # Prioritize likely owners/investors; skip institutional housing authorities.
        if "CUYAHOGA METROPOLITAN HOUSING AUTHORITY" in owner_key or owner_key == "CMHA":
            continue
        try:
            parcels = query_parcels_by_owner(session, owner, limit=150)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("GIS owner lookup failed for %s: %s", owner, exc)
            continue
        if not parcels:
            continue
        portfolio_count = len(parcels)
        case = latest_case[owner_key]
        for parcel in parcels[:50]:
            if not is_residential(parcel):
                continue
            score, notes = score_eviction_landlord(parcel, repeat_count, portfolio_count)
            leads.append(
                Lead(
                    lead_id=f"ev:{owner_key[:30]}:{normalize_pin(parcel.parcel_pin)}",
                    lead_type="tired_landlord",
                    score=score,
                    status="Hot" if score >= 70 else "Review",
                    title=f"{owner} — possible tired-landlord acquisition",
                    owner_or_defendant=owner,
                    plaintiff=owner,
                    case_number=clean_text(case.get("case_number")),
                    filed_or_hearing_date=clean_text(case.get("hearing_date")),
                    hearing_type=clean_text(case.get("hearing_type")),
                    repeat_eviction_count=repeat_count,
                    portfolio_count=portfolio_count,
                    parcel=parcel,
                    source_url=HOUSING_DOCKET_URL,
                    notes=notes + ["Eviction docket identifies the landlord; parcel is matched from the owner's Cleveland portfolio and may not be the exact eviction address."],
                )
            )
    return leads


def lead_to_dict(lead: Lead) -> dict[str, Any]:
    out = asdict(lead)
    if lead.parcel:
        out["parcel"]["absentee"] = lead.parcel.absentee
        out["parcel"]["is_residential"] = is_residential(lead.parcel)
        out["parcel"]["is_multifamily"] = is_multifamily(lead.parcel)
    out["quality_flags"] = lead_quality_flags(lead)
    out["best_deal"] = is_best_deal(lead)
    return out



def load_previous(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"generated_at": "", "stats": {}, "leads": []}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("unexpected JSON root")
        payload.setdefault("stats", {})
        payload.setdefault("leads", [])
        return payload
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("Could not read previous lead file %s: %s", path, exc)
        return {"generated_at": "", "stats": {}, "leads": []}


def previous_leads_of_type(payload: dict[str, Any], lead_type: str) -> list[Lead]:
    """Rehydrate previous JSON leads only when a live source temporarily fails."""
    out: list[Lead] = []
    for raw in payload.get("leads", []):
        if raw.get("lead_type") != lead_type:
            continue
        parcel_raw = raw.get("parcel") or None
        parcel = None
        if parcel_raw:
            allowed = {f.name for f in Parcel.__dataclass_fields__.values()}
            parcel = Parcel(**{k: v for k, v in parcel_raw.items() if k in allowed})
        fields = {f.name for f in Lead.__dataclass_fields__.values()}
        vals = {k: v for k, v in raw.items() if k in fields and k != "parcel"}
        vals["parcel"] = parcel
        try:
            out.append(Lead(**vals))
        except TypeError:
            continue
    return out

def comparable_lead(raw: dict[str, Any]) -> str:
    ignored = {"generated_at", "scan_status", "best_deal", "quality_flags"}
    stable = {k: v for k, v in raw.items() if k not in ignored}
    return json.dumps(stable, sort_keys=True, ensure_ascii=False, default=str)


def save_json(path: Path, leads: list[Lead], stats: dict[str, Any], previous: dict[str, Any] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = previous or {"leads": []}
    prev_by_id = {clean_text(x.get("lead_id")): x for x in previous.get("leads", []) if x.get("lead_id")}
    rows: list[dict[str, Any]] = []
    new_count = 0
    updated_count = 0
    best_count = 0
    for lead in sorted(leads, key=lambda x: x.score, reverse=True):
        raw = lead_to_dict(lead)
        prior = prev_by_id.get(lead.lead_id)
        if prior is None:
            raw["scan_status"] = "new"
            new_count += 1
        elif comparable_lead(raw) != comparable_lead(prior):
            raw["scan_status"] = "updated"
            updated_count += 1
        else:
            raw["scan_status"] = "seen"
        if raw.get("best_deal"):
            best_count += 1
        rows.append(raw)
    stats["new_leads"] = new_count
    stats["updated_leads"] = updated_count
    stats["best_deal_leads"] = best_count
    payload = {
        "generated_at": now_iso(),
        "stats": stats,
        "leads": rows,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Cuyahoga distressed-property public-record scraper")
    parser.add_argument("--output", default="data/leads.json")
    parser.add_argument("--no-documents", action="store_true", help="Skip foreclosure complaint ZIP inspection")
    parser.add_argument("--max-documents", type=int, default=int(os.getenv("MAX_FORECLOSURE_DOCUMENTS", "12")))
    parser.add_argument("--max-foreclosures", type=int, default=int(os.getenv("MAX_FORECLOSURE_RECORDS", "30")))
    parser.add_argument("--max-eviction-owners", type=int, default=int(os.getenv("MAX_EVICTION_OWNERS", "30")))
    parser.add_argument("--skip-evictions", action="store_true")
    parser.add_argument("--skip-foreclosures", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    session = make_session()
    output_path = Path(args.output)
    previous = load_previous(output_path)
    leads: list[Lead] = []
    stats: dict[str, Any] = {"source_health": {}, "previous_generated_at": previous.get("generated_at", "")}

    if not args.skip_foreclosures:
        try:
            foreclosures = scrape_foreclosures(
                session,
                inspect_documents=not args.no_documents,
                max_documents=max(0, args.max_documents),
                max_records=max(0, args.max_foreclosures),
            )
            stats["foreclosure_submissions"] = len(foreclosures)
            fc_leads = build_foreclosure_leads(session, foreclosures)
            stats["foreclosure_leads"] = len(fc_leads)
            stats["source_health"]["foreclosures"] = "live"
            leads.extend(fc_leads)
        except Exception as exc:  # noqa: BLE001
            LOGGER.exception("Foreclosure scrape failed: %s", exc)
            stats["foreclosure_error"] = str(exc)
            fallback = previous_leads_of_type(previous, "foreclosure")
            stats["source_health"]["foreclosures"] = "stale" if fallback else "error"
            stats["foreclosure_leads"] = len(fallback)
            leads.extend(fallback)

    if not args.skip_evictions:
        try:
            evictions = scrape_evictions(session)
            stats["eviction_docket_rows"] = len(evictions)
            ev_leads = build_eviction_leads(session, evictions, max_owners=max(1, args.max_eviction_owners))
            stats["tired_landlord_parcel_leads"] = len(ev_leads)
            stats["source_health"]["housing_court"] = "live"
            leads.extend(ev_leads)
        except Exception as exc:  # noqa: BLE001
            LOGGER.exception("Eviction scrape failed: %s", exc)
            stats["eviction_error"] = str(exc)
            fallback = previous_leads_of_type(previous, "tired_landlord")
            stats["source_health"]["housing_court"] = "stale" if fallback else "error"
            stats["tired_landlord_parcel_leads"] = len(fallback)
            leads.extend(fallback)

    stats["total_leads"] = len(leads)
    stats["hot_leads"] = sum(1 for l in leads if l.score >= 70)
    save_json(output_path, leads, stats, previous)
    LOGGER.info("Saved %s leads to %s", len(leads), args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
