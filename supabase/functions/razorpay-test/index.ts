import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigin = "https://halderrupam844-gif.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function razorpayRequest(path: string, keyId: string, keySecret: string, init?: RequestInit) {
  const auth = btoa(`${keyId}:${keySecret}`);
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Razorpay test API request failed");
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" || req.headers.get("origin") !== allowedOrigin) {
    return reply({ error: "Request not allowed" }, 403);
  }

  const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  if (!keyId.startsWith("rzp_test_") || !keySecret) {
    return reply({ error: "Test credentials are not configured on the server." }, 503);
  }

  try {
    const body = await req.json();
    if (body.action === "create-order") {
      const amount = Number(body.amount);
      if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 500000) {
        return reply({ error: "Choose an amount between ₹10 and ₹5,000." }, 400);
      }
      const order = await razorpayRequest("/orders", keyId, keySecret, {
        method: "POST",
        body: JSON.stringify({
          amount,
          currency: "INR",
          receipt: `test_donation_${crypto.randomUUID().slice(0, 18)}`,
          notes: { purpose: "test-mode donation demo; no real funds" },
        }),
      });
      return reply({ keyId, order: { id: order.id, amount: order.amount, currency: order.currency } });
    }

    if (body.action === "verify-payment") {
      const orderId = String(body.razorpay_order_id ?? "");
      const paymentId = String(body.razorpay_payment_id ?? "");
      const signature = String(body.razorpay_signature ?? "");
      if (!/^order_[A-Za-z0-9]+$/.test(orderId) ||
          !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
          !/^[a-f0-9]{64}$/i.test(signature)) {
        return reply({ error: "Invalid payment verification data." }, 400);
      }

      const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
      if (!constantTimeEqual(expected, signature.toLowerCase())) {
        return reply({ error: "Payment signature did not match." }, 400);
      }

      const [order, payment] = await Promise.all([
        razorpayRequest(`/orders/${encodeURIComponent(orderId)}`, keyId, keySecret),
        razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, keyId, keySecret),
      ]);
      if (
        payment.order_id !== order.id ||
        payment.currency !== "INR" ||
        payment.amount !== order.amount ||
        payment.status !== "captured" ||
        order.status !== "paid"
      ) {
        return reply({ verified: false, error: "The test payment is not captured." }, 409);
      }
      return reply({
        verified: true,
        currency: "INR",
        amount: payment.amount,
        message: "Test payment verified. No real money was moved.",
      });
    }

    return reply({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("Razorpay test function error:", error);
    return reply({ error: "Could not complete the test payment request." }, 502);
  }
});
