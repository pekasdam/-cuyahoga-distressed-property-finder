from scraper import (
    Lead,
    Parcel,
    display_pin,
    extract_document_signals,
    normalize_pin,
    parse_foreclosure_table,
    parse_housing_docket,
    score_eviction_landlord,
    score_foreclosure,
    is_best_deal,
    owner_is_institutional,
    split_style,
)


def test_split_style():
    p, d = split_style("TREASURER OF CUYAHOGA COUNTY, OHIO vs Jane Doe, et al.")
    assert p.startswith("TREASURER")
    assert d.startswith("Jane Doe")


def test_pin_helpers():
    assert normalize_pin("138-03-122") == "13803122"
    assert display_pin("13803122") == "138-03-122"


def test_foreclosure_table_parser():
    html = """
    <table>
      <tr><th>Submission ID</th><th>Submission Title</th><th>Submission Date</th><th>Submission Category</th><th>Submission Status</th><th>Download</th></tr>
      <tr><td>3925594</td><td>TREASURER OF CUYAHOGA COUNTY, OHIO vs Jane Doe</td><td>7/27/2026</td><td>FORECLOSURES</td><td>Filed</td><td><a href='3925594_Documents.zip'>zip</a></td></tr>
    </table>
    """
    rows = parse_foreclosure_table(html, "https://example.com/path/")
    assert len(rows) == 1
    assert rows[0]["submission_id"] == "3925594"
    assert rows[0]["document_url"] == "https://example.com/path/3925594_Documents.zip"


def test_housing_parser():
    html = """
    <table><tr><th>Case #</th><th>Style</th><th>Date</th><th>Time</th><th>Hearing Type</th></tr>
    <tr><td>2026-CVG-1</td><td>ABC Rentals LLC vs Tenant Name</td><td>Aug 1</td><td>9:00 AM</td><td>Housing Eviction</td></tr>
    </table>
    """
    rows = parse_housing_docket(html)
    assert len(rows) == 1
    assert rows[0]["plaintiff"] == "ABC Rentals LLC"


def test_scoring():
    p = Parcel(
        parcel_pin="125-19-001",
        property_address="12519 TEST AVE",
        mailing_address="PO BOX 123",
        land_use="TWO FAMILY",
        certified_tax_total=65000,
        residential_buildings=1,
    )
    fc_score, _ = score_foreclosure(p, True, True)
    ev_score, _ = score_eviction_landlord(p, 3, 4)
    assert fc_score >= 80
    assert ev_score >= 70


def test_best_deal_quality_filter():
    parcel = Parcel(
        parcel_pin="125-19-001",
        owner="Jane Doe",
        property_address="12519 TEST AVE",
        mailing_address="PO BOX 123",
        land_use="TWO FAMILY",
        certified_tax_total=65000,
        residential_buildings=1,
    )
    lead = Lead(lead_id="x", lead_type="foreclosure", score=82, status="Hot", title="Test", parcel=parcel)
    assert is_best_deal(lead)

    parcel.owner = "CHN HOUSING PARTNERS LIHTC"
    assert owner_is_institutional(parcel.owner)
    assert not is_best_deal(lead)


def test_zero_address_not_best_deal():
    parcel = Parcel(
        parcel_pin="125-19-002", owner="Jane Doe", property_address="0 TEST AVE",
        land_use="SINGLE FAMILY", residential_buildings=1, certified_tax_total=50000,
    )
    lead = Lead(lead_id="y", lead_type="foreclosure", score=90, status="Hot", title="Test", parcel=parcel)
    assert not is_best_deal(lead)
