import { getVercelOidcToken } from '@vercel/oidc';

const ALLOWED_ORIGINS = new Set([
  'https://pekasdam.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

const ABSOLUTE_ALL_IN = 45000;
const PREFERRED_ALL_IN = 40000;
const MIN_ARV = 80000;
const MODEL = process.env.UNDERWRITER_MODEL || 'openai/gpt-5.6-sol';
const GATEWAY = 'https://ai-gateway.vercel.sh/v1/responses';
const RATE = new Map();

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function text(v, max = 300) {
  return String(v ?? '').slice(0, max);
}

function rateLimited(req) {
  const ip = text(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown', 100).split(',')[0].trim();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const entry = RATE.get(ip);
  if (!entry || now - entry.start > windowMs) {
    RATE.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > 30;
}

function normalizePacket(body = {}) {
  const p = body.property || {};
  const a = body.auction || {};
  const e = body.estimates || {};
  const c = body.county || {};
  return {
    property: {
      parcel: text(p.parcel, 30),
      address: text(p.address, 180),
      city: text(p.city, 80),
      zip: text(p.zip, 12),
      type: text(p.type, 60),
      units: num(p.units),
      livingArea: num(p.livingArea),
      landUse: text(p.landUse, 160),
      owner: text(p.owner, 180)
    },
    auction: {
      status: text(a.status, 60),
      openingBid: num(a.openingBid),
      deposit: num(a.deposit),
      appraisedValue: num(a.appraisedValue),
      saleDate: text(a.saleDate, 30),
      addDate: text(a.addDate, 30),
      caseNumber: text(a.caseNumber, 40),
      myBid: num(a.myBid)
    },
    estimates: {
      monthlyRent: num(e.monthlyRent),
      arv: num(e.arv),
      rehab: num(e.rehab),
      otherCosts: num(e.otherCosts),
      compCount: num(e.compCount),
      compSource: text(e.compSource, 500),
      rentSource: text(e.rentSource, 300)
    },
    county: {
      lastSaleAmount: num(c.lastSaleAmount),
      lastSaleDate: text(c.lastSaleDate, 40),
      taxLandUseCode: text(c.taxLandUseCode, 30),
      taxLandUseDescription: text(c.taxLandUseDescription, 180),
      residentialBuildingCount: num(c.residentialBuildingCount)
    }
  };
}

function deterministic(packet) {
  const rent = packet.estimates.monthlyRent;
  const arv = packet.estimates.arv;
  const rehab = packet.estimates.rehab;
  const other = packet.estimates.otherCosts;
  const opening = packet.auction.openingBid;
  const type = `${packet.property.type} ${packet.property.landUse}`.toLowerCase();
  const vacant = /vacant|land only|lot/.test(type);
  const rentCap = rent > 0 ? rent * 100 : 0;
  const arvCap = arv > 0 ? arv * 0.70 : 0;
  const refi75 = arv > 0 ? arv * 0.75 : 0;
  const availableCaps = [ABSOLUTE_ALL_IN];
  if (rentCap > 0) availableCaps.push(rentCap);
  if (arvCap > 0) availableCaps.push(arvCap);
  const maxAllIn = Math.min(...availableCaps);
  const preferredAllIn = Math.min(PREFERRED_ALL_IN, rentCap || Infinity, arvCap || Infinity);
  const maxBid = Math.max(0, Math.floor((maxAllIn - rehab - other) / 100) * 100);
  const preferredBid = Math.max(0, Math.floor((preferredAllIn - rehab - other) / 100) * 100);
  const failures = [];
  if (vacant) failures.push('Vacant land is outside the buy-and-rent strategy.');
  if (!rent) failures.push('Reliable monthly rent estimate is missing.');
  if (!arv) failures.push('Reliable ARV estimate is missing.');
  if (arv > 0 && arv < MIN_ARV) failures.push(`ARV is below the $${MIN_ARV.toLocaleString()} refinance threshold.`);
  if (maxBid <= 0) failures.push('Rehab and other costs leave no positive acquisition bid under the all-in cap.');
  if (opening > 0 && maxBid > 0 && opening > maxBid) failures.push('Opening bid is already above the deterministic maximum bid.');
  if (/canceled|cancelled|withdrawn|sold|postponed/i.test(packet.auction.status)) failures.push(`Auction status is ${packet.auction.status}.`);
  return {
    absoluteAllIn: ABSOLUTE_ALL_IN,
    preferredAllIn: PREFERRED_ALL_IN,
    minArv: MIN_ARV,
    rentCap,
    arvCap,
    maxAllIn,
    preferredAllInUsed: Number.isFinite(preferredAllIn) ? preferredAllIn : PREFERRED_ALL_IN,
    maxBid,
    preferredBid,
    refi75,
    openingBid: opening,
    biddingRoom: opening > 0 ? maxBid - opening : null,
    hardFail: failures.length > 0,
    failures
  };
}

function schema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      verdict: { type: 'string', enum: ['STRONG BUY', 'BUY', 'WATCH', 'PASS'] },
      recommendedBid: { type: 'number', minimum: 0 },
      preferredBid: { type: 'number', minimum: 0 },
      confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      summary: { type: 'string' },
      rationale: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      risks: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      verifyBeforeBid: { type: 'array', items: { type: 'string' }, maxItems: 7 },
      rentView: { type: 'string' },
      refiView: { type: 'string' }
    },
    required: ['verdict','recommendedBid','preferredBid','confidence','summary','rationale','risks','verifyBeforeBid','rentView','refiView']
  };
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

async function gatewayAuth() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;
  try { return await getVercelOidcToken(); } catch { return ''; }
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (rateLimited(req)) return res.status(429).json({ error: 'Too many underwriting requests. Try again later.' });

  try {
    const packet = normalizePacket(req.body || {});
    const rules = deterministic(packet);
    const auth = await gatewayAuth();
    if (!auth) return res.status(503).json({ error: 'AI service authentication is not available on the server.' });

    const instructions = `You are an acquisition underwriter for a conservative long-term rental investor buying distressed Cuyahoga County properties at sheriff/tax sale. The deterministic rules below are NON-NEGOTIABLE and you may never recommend a bid above the deterministic maxBid.\n\nHard rules:\n- Vacant land: PASS.\n- Minimum ARV: $80,000.\n- Absolute all-in cost cap: $45,000 including purchase, rehab, and other costs.\n- Preferred all-in target: $40,000.\n- Minimum rent rule: monthly stabilized rent must be at least 1% of all-in cost.\n- Acquisition safety ceiling: 70% of ARV.\n- The 75% ARV figure is only an illustrative refinance ceiling, not permission to bid higher.\n- If the opening bid is above deterministic maxBid: PASS.\n- Do not invent missing facts. Lower confidence when rent, ARV, comps, condition, title, liens, occupancy, HOA, taxes, insurance, or rehab scope are uncertain.\n- Preferred ZIPs 44105, 44120, 44128, 44112, and 44137 can be a positive factor but never override the economics.\n- Multifamily can be a positive factor only when the numbers support it.\n\nYour job is to provide a second-opinion decision using the supplied deal packet. Favor capital preservation, refinance optionality, and margin for error. If the deterministic rules hard-fail, verdict must be PASS and recommendedBid must be 0. Otherwise, recommendedBid must be at or below deterministic maxBid and should usually leave some cushion rather than simply echoing the maximum.`;

    const aiResponse = await fetch(GATEWAY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        reasoning: { effort: 'medium' },
        instructions,
        input: JSON.stringify({ deal: packet, deterministicRules: rules }),
        text: {
          format: {
            type: 'json_schema',
            name: 'property_underwriting',
            strict: true,
            schema: schema()
          }
        }
      })
    });

    const raw = await aiResponse.text();
    if (!aiResponse.ok) {
      let gatewayError = '';
      try { gatewayError = JSON.parse(raw)?.error?.message || ''; } catch {}
      console.error('AI gateway error', aiResponse.status, raw.slice(0, 1500));
      if (/credit card|verification|required|billing/i.test(gatewayError)) {
        return res.status(503).json({
          code: 'AI_GATEWAY_BILLING_REQUIRED',
          error: 'OpenAI underwriting is connected, but Vercel AI Gateway needs a payment method on file before it will run model requests.'
        });
      }
      return res.status(502).json({ error: 'AI underwriting service returned an error.' });
    }

    let payload;
    try { payload = JSON.parse(raw); } catch { return res.status(502).json({ error: 'AI gateway returned invalid JSON.' }); }
    const outputText = extractOutputText(payload);
    let ai;
    try { ai = JSON.parse(outputText); } catch { return res.status(502).json({ error: 'AI underwriting result could not be parsed.' }); }

    if (rules.hardFail) {
      ai.verdict = 'PASS';
      ai.recommendedBid = 0;
      ai.preferredBid = 0;
      ai.summary = `${rules.failures.join(' ')} ${ai.summary || ''}`.trim();
    } else {
      ai.recommendedBid = Math.max(0, Math.min(num(ai.recommendedBid), rules.maxBid));
      ai.preferredBid = Math.max(0, Math.min(num(ai.preferredBid), rules.preferredBid || rules.maxBid));
    }

    return res.status(200).json({
      model: MODEL,
      deal: packet,
      rules,
      ai
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Underwriting failed on the server.' });
  }
}
