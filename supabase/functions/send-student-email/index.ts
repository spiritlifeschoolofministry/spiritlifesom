import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "teacher"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Unauthorized: only teachers and admins can send student emails" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { recipients, subject, body } = await req.json();

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "Recipients must be a non-empty array" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!subject || !body) {
      return new Response(JSON.stringify({ error: "Subject and body are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let successCount = 0;
    let failCount = 0;

    for (const recipient of recipients) {
      if (!recipient.email) {
        failCount++;
        continue;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Spirit Life SOM <onboarding@resend.dev>",
            to: recipient.email,
            subject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <p>Dear ${recipient.name || "Student"},</p>
                <div style="margin: 20px 0; line-height: 1.6;">
                  ${body.replace(/\n/g, "<br/>")}
                </div>
                <p>God bless you,<br/><strong>Spirit Life School of Ministry</strong></p>
              </div>
            `,
          }),
        });

        const data = await res.json();

        if (res.ok && data.id) {
          successCount++;
          // Log success to email_send_history
          await supabase.from("email_send_history").insert({
            recipient_email: recipient.email,
            email_type: "custom",
            trigger_source: "manual",
            triggered_by: user.id,
            status: "sent",
            resend_message_id: data.id,
            metadata: { subject, sent_by_name: profile.first_name || "Admin" },
          });
        } else {
          failCount++;
          // Log failure
          await supabase.from("email_send_history").insert({
            recipient_email: recipient.email,
            email_type: "custom",
            trigger_source: "manual",
            triggered_by: user.id,
            status: "failed",
            error_message: data.message || "Unknown error",
            metadata: { subject },
          });
        }
      } catch (error) {
        failCount++;
        console.error(`Failed to send email to ${recipient.email}:`, error);
        await supabase.from("email_send_history").insert({
          recipient_email: recipient.email,
          email_type: "custom",
          trigger_source: "manual",
          triggered_by: user.id,
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          metadata: { subject },
        });
      }
    }

    return new Response(
      JSON.stringify({ successCount, failCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-student-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
