// eBay Marketplace Account Deletion / Closure Notification endpoint.
//
// eBay requires every Production keyset to have one of these configured,
// even for apps (like this one) that only ever call the Browse API with an
// application-level token and never touch any eBay user's personal data.
// There's nothing to actually delete here -- this just satisfies eBay's
// verification handshake and acknowledges any real notifications it sends.
//
// How eBay's handshake works:
//   1. When you click "Save" on the endpoint in your eBay Developer account,
//      eBay sends a GET request here with a `challenge_code` query param.
//   2. This function must respond with JSON:
//        { "challengeResponse": sha256(challengeCode + verificationToken + endpointUrl) }
//      as a hex digest, or eBay rejects the endpoint.
//   3. After that, eBay may POST real deletion notifications here over time;
//      this just logs and acknowledges them with a 200.
//
// Setup:
//   1. In Netlify: Site settings -> Environment variables -> add:
//        EBAY_VERIFY_TOKEN = <a random string, 32-80 chars>
//        EBAY_ENDPOINT_URL = https://<your-site>.netlify.app/.netlify/functions/ebay-deletion-notification
//      (EBAY_ENDPOINT_URL must match EXACTLY what you type into eBay's
//      "Marketplace account deletion notification endpoint" field --
//      same casing, no trailing slash difference.)
//   2. Redeploy so the env vars take effect.
//   3. In eBay's Developer account -> Alerts & Notifications, paste the
//      same values into "Marketplace account deletion notification
//      endpoint" and "Verification token", then click Save. eBay will hit
//      this function immediately to verify it.

const crypto = require("crypto");

exports.handler = async (event) => {
  const verificationToken = process.env.EBAY_VERIFY_TOKEN;
  const endpointUrl = process.env.EBAY_ENDPOINT_URL;

  if (event.httpMethod === "GET") {
    const challengeCode = event.queryStringParameters && event.queryStringParameters.challenge_code;

    if (!challengeCode || !verificationToken || !endpointUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "missing challenge_code, EBAY_VERIFY_TOKEN, or EBAY_ENDPOINT_URL" }),
      };
    }

    const hash = crypto.createHash("sha256");
    hash.update(challengeCode);
    hash.update(verificationToken);
    hash.update(endpointUrl);
    const challengeResponse = hash.digest("hex");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeResponse }),
    };
  }

  if (event.httpMethod === "POST") {
    // A real deletion notification. This site never stores any eBay user's
    // personal data (no user sign-in, no saved orders/accounts -- only
    // public listing search via an application token), so there's nothing
    // to delete. Just acknowledge receipt as eBay's spec requires.
    console.log("eBay account deletion notification received:", event.body);
    return { statusCode: 200, body: "OK" };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
