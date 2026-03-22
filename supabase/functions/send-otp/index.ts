/// <reference path="../_shared/deno-globals.d.ts" />
/// <reference path="../_shared/supabase-imports.d.ts" />
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOTP(): string {
  const digits = "0123456789";
  let otp = "";

  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }

  return otp;
}

const getEmailCopy = (code: string) => {
  return {
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #333; margin-bottom: 16px;">Verify Your New Account</h2>
        <p style="color: #666; margin-bottom: 24px;">
          Enter this code to finish creating your BAG-INVENT account:
        </p>
        <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
        </div>
        <p style="color: #999; font-size: 13px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `,
    subject: "Your BAG-INVENT Account Verification Code",
  };
};

const getResendMessage = async (response: Response) => {
  const bodyText = await response.text();

  try {
    const body = JSON.parse(bodyText) as {
      error?: { message?: string };
      message?: string;
    };

    return body.error?.message ?? body.message ?? bodyText;
  } catch {
    return bodyText;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, purpose, userId } = await req.json();

    if (!email || !userId) {
      return new Response(JSON.stringify({ error: "Email and userId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (purpose && purpose !== "signup") {
      return new Response(
        JSON.stringify({ error: "OTP is only available for signup verification" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabaseAdmin.from("otp_codes").delete().eq("user_id", userId);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin.from("otp_codes").insert({
      user_id: userId,
      email,
      code,
      expires_at: expiresAt,
      used: false,
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create OTP" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({
          error: "RESEND_API_KEY is not configured in Supabase Edge Function secrets",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const emailCopy = getEmailCopy(code);
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ??
      "BAG-INVENT <onboarding@resend.dev>";

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [email],
        subject: emailCopy.subject,
        html: emailCopy.html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await getResendMessage(emailRes);
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: errText || "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
