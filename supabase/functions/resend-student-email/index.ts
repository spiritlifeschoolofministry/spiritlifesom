import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getEmailTemplate(emailType: string, studentName: string, portalUrl: string) {
  switch (emailType) {
    case "admission_approved":
      return {
        subject: "Admission Approved - Spirit Life School of Ministry",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Congratulations, ${studentName}!</h2>
            <p>Your application to <strong>Spirit Life School of Ministry</strong> has been <strong>approved</strong>.</p>
            <p>You can now access your student portal and begin your studies.</p>
            <p><strong>Portal Access:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
            <p>For questions about fees, course dates, or next steps, please contact the school office.</p>
            <br/>
            <p>God bless you,<br/><strong>Spirit Life School of Ministry</strong></p>
          </div>
        `,
      };
    case "admission_rejected":
      return {
        subject: "Application Status - Spirit Life School of Ministry",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Dear ${studentName},</h2>
            <p>Thank you for your application to <strong>Spirit Life School of Ministry</strong>.</p>
            <p>After careful review, we regret to inform you that your application was not approved at this time.</p>
            <p>We encourage you to reapply in the future. If you have questions, please contact the school office.</p>
            <br/>
            <p>God bless you,<br/><strong>Spirit Life School of Ministry</strong></p>
          </div>
        `,
      };
    case "credentials":
      return {
        subject: "Portal Access Credentials - Spirit Life School of Ministry",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome, ${studentName}!</h2>
            <p>Your account at <strong>Spirit Life School of Ministry</strong> is ready.</p>
            <p><strong>Portal Access:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
            <p>Use your email and the password you created during registration to log in.</p>
            <p>If you have any issues accessing your account, please contact the school office.</p>
            <br/>
            <p>God bless you,<br/><strong>Spirit Life School of Ministry</strong></p>
          </div>
        `,
      };
    default:
      return {
        subject: "Message from Spirit Life School of Ministry",
        html: `<p>Hello ${studentName},</p><p>This is a notification from Spirit Life School of Ministry.</p>`,
      };
  }
}

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
      return new Response(JSON.stringify({ error: "Unauthorized: only teachers and admins can resend emails" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { student_id, email_type, idempotency_key } = await req.json();
    if (!student_id || !email_type) {
      return new Response(JSON.stringify({ error: "Missing student_id or email_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check idempotency — if this key exists and succeeded recently, return cached result
    if (idempotency_key) {
      const { data: recent } = await supabase
        .from("email_send_history")
        .select("recipient_email, status, attempts, created_at")
        .eq("email_type", email_type)
        .eq("student_id", student_id)
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(1);

      if (recent && recent.length > 0) {
        const lastSent = new Date(recent[0].created_at).getTime();
        const now = Date.now();
        if (now - lastSent < 30000) {
          // Sent within last 30 seconds
          return new Response(
            JSON.stringify({ sent_to: recent[0].recipient_email, attempts: recent[0].attempts || 1 }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Get student info
    const { data: student } = await supabase
      .from("students")
      .select("id, profile_id, profiles(first_name, last_name, email)")
      .eq("id", student_id)
      .single();

    if (!student || !student.profiles) {
      return new Response(JSON.stringify({ error: "Student not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const studentEmail = student.profiles.email;
    const studentName = `${student.profiles.first_name} ${student.profiles.last_name}`.trim();
    const portalUrl = Deno.env.get("APP_URL") || "https://spiritlifesom.org";

    // Get email template
    const template = getEmailTemplate(email_type, studentName, portalUrl);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Send email
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Spirit Life SOM <onboarding@resend.dev>",
        to: studentEmail,
        subject: template.subject,
        html: template.html,
      }),
    });

    const data = await res.json();

    if (res.ok && data.id) {
      // Log success
      await supabase.from("email_send_history").insert({
        recipient_email: studentEmail,
        email_type,
        trigger_source: "manual",
        triggered_by: user.id,
        student_id,
        status: "sent",
        resend_message_id: data.id,
        attempts: 1,
        metadata: { sent_by_role: profile.role },
      });

      return new Response(
        JSON.stringify({ sent_to: studentEmail, attempts: 1 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      // Log failure
      const errorMsg = data.message || "Unknown error";
      await supabase.from("email_send_history").insert({
        recipient_email: studentEmail,
        email_type,
        trigger_source: "manual",
        triggered_by: user.id,
        student_id,
        status: "failed",
        error_message: errorMsg,
        attempts: 1,
      });

      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error("resend-student-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
