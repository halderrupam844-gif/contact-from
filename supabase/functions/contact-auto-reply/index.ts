import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" || origin !== allowedOrigin) {
    return reply({ error: "Request not allowed" }, 403);
  }
  if (Number(req.headers.get("content-length") || "0") > 12000) {
    return reply({ error: "Request is too large." }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromAddress = Deno.env.get("AUTO_REPLY_FROM") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !fromAddress) {
    console.error("Contact auto-reply secrets are not fully configured.");
    return reply({ error: "The contact service is not configured." }, 503);
  }

  try {
    const body = await req.json();
    // The honeypot is checked server-side too.
    if (clean(body.website, 200)) return reply({ submitted: true, autoReplySent: false });

    const contact = {
      name: clean(body.name, 100),
      email: clean(body.email, 254).toLowerCase(),
      phone: clean(body.phone, 30) || null,
      subject: clean(body.subject, 200),
      message: clean(body.message, 5000),
    };
    if (
      !contact.name || !contact.subject || !contact.message ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
    ) {
      return reply({ error: "Please provide valid contact details." }, 400);
    }

    const clientIp = req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const ipHash = await sha256(clientIp);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: allowed, error: limitError } = await supabase.rpc(
      "consume_contact_submission",
      { p_ip_hash: ipHash },
    );
    if (limitError) {
      console.error("Contact rate-limit check failed:", limitError.message);
      return reply({ error: "The contact service is temporarily unavailable." }, 503);
    }
    if (allowed !== true) {
      return reply({ error: "Too many submissions. Please try again later." }, 429);
    }

    const { error: insertError } = await supabase.from("contacts").insert([contact]);
    if (insertError) {
      console.error("Contact insert failed:", insertError.message);
      return reply({ error: "Could not save the message." }, 502);
    }

    let autoReplySent = false;
    try {
      const safeName = escapeHtml(contact.name);
      const safeSubject = escapeHtml(contact.subject);
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [contact.email],
          subject: "We received your message",
          text: `Hi ${contact.name},\n\nThanks for contacting us. We received your message about "${contact.subject}" and will get back to you as soon as we can.\n\nThis is an automatic confirmation; please do not reply to this email.\n\nThank you.`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124"><h2>Thanks for reaching out, ${safeName}!</h2><p>We've received your message about <strong>${safeSubject}</strong>.</p><p>Our team will get back to you as soon as we can.</p><p style="color:#666;font-size:13px">This is an automatic confirmation. Please do not reply to this email.</p></div>`,
        }),
      });
      autoReplySent = emailResponse.ok;
      if (!emailResponse.ok) {
        const errorBody = await emailResponse.text();
        console.error("Auto-reply provider rejected the email:", emailResponse.status, errorBody.slice(0, 300));
      }
    } catch (emailError) {
      console.error("Auto-reply delivery failed:", emailError);
    }

    return reply({ submitted: true, autoReplySent });
  } catch (error) {
    console.error("Contact auto-reply function error:", error);
    return reply({ error: "Could not complete the contact request." }, 500);
  }
});
