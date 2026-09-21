// War & Pizza — eBay Browse API proxy
//
// Why this exists: the Browse API needs an OAuth token generated from your
// eBay App ID + Cert ID (the "Cert ID" is a secret -- it must never live in
// front-end code where anyone can view-source it). This function runs on
// Netlify's servers, keeps the secret in environment variables, and hands
// the browser back only the safe, public bits: a title, a price, a photo,
// and a link.
//
// Setup (once your eBay Developer account is approved):
//   1. In your eBay Developer account, create a keyset -> copy the
//      Production "App ID (Client ID)" and "Cert ID (Client Secret)".
//   2. In Netlify: Site settings -> Environment variables -> add:
//        EBAY_APP_ID   = <your App ID>
//        EBAY_CERT_ID  = <your Cert ID>
//        EBAY_CAMPAIGN_ID = 5339165058   (your existing EPN campaign ID)
//   3. Redeploy the site. That's it -- no code changes needed.
//
// Until those env vars are set, this function returns an empty result and
// the site keeps showing its placeholder art, so nothing breaks in the
// meantime.

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

// Simple in-memory token cache -- persists across warm function invocations
// on the same instance, saving a round trip on most requests.
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAppToken(appId, certId) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60000) {
    return cachedToken;
  }
  const basicAuth = Buffer.from(`${appId}:${certId}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token request failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + data.expires_in * 1000;
  return cachedToken;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=1800", // 30 min -- keeps API calls low
  };

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const campaignId = process.env.EBAY_CAMPAIGN_ID;

  if (!appId || !certId) {
    // Not configured yet -- fail quietly so the frontend falls back to
    // placeholder art instead of showing an error.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ items: [], configured: false }),
    };
  }

  const q = (event.queryStringParameters && event.queryStringParameters.q) || "";
  const limit = Math.min(
    parseInt((event.queryStringParameters && event.queryStringParameters.limit) || "4", 10) || 4,
    12
  );

  if (!q) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "missing q" }) };
  }

  try {
    const token = await getAppToken(appId, certId);

    const searchParams = new URLSearchParams({
      q,
      limit: String(limit),
    });

    const enduserctxParts = ["affiliateCampaignId=" + (campaignId || "")];
    const requestHeaders = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    };
    if (campaignId) {
      requestHeaders["X-EBAY-C-ENDUSERCTX"] = enduserctxParts.join(",");
    }

    const res = await fetch(`${BROWSE_URL}?${searchParams.toString()}`, {
      headers: requestHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ items: [], configured: true, error: `browse_api_${res.status}`, detail: text.slice(0, 300) }),
      };
    }

    const data = await res.json();
    const items = (data.itemSummaries || []).map((it) => ({
      title: it.title,
      price: it.price ? `${it.price.value} ${it.price.currency}` : null,
      image: it.image && it.image.imageUrl,
      // itemAffiliateWebUrl only appears when the campaign ID was accepted;
      // fall back to the plain item URL if it's missing so the link still works.
      url: it.itemAffiliateWebUrl || it.itemWebUrl,
      condition: it.condition || null,
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ items, configured: true }) };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ items: [], configured: true, error: String(err) }),
    };
  }
};
