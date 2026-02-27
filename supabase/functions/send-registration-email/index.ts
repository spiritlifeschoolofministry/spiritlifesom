import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { student_id, profile_id, approval_token } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', profile_id)
      .single()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404 })
    }

    const approvalLink = `${Deno.env.get('APP_URL')}/admin/approve?token=${approval_token}`
    const portalLink = Deno.env.get('APP_URL')

    // Email to STUDENT
    await supabase.auth.admin.sendRawEmail({
      to: profile.email,
      subject: 'Application Received - Spirit Life School of Ministry',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Dear ${profile.first_name},</h2>
          <p>Thank you for applying to <strong>Spirit Life School of Ministry</strong>.</p>
          <p>Your application has been received and is currently under review. You will receive another email once your admission has been approved.</p>
          <p><strong>Your Login Details:</strong><br/>
          Email: ${profile.email}<br/>
          Password: The one you created during registration</p>
          <p><strong>Portal Access:</strong> <a href="${portalLink}">${portalLink}</a></p>
          <p>For questions about fees and course dates, please contact the school office.</p>
          <br/>
          <p>God bless you,<br/><strong>Spirit Life School of Ministry</strong></p>
        </div>
      `
    })

    // Email to ADMIN
    await supabase.auth.admin.sendRawEmail({
      to: Deno.env.get('ADMIN_EMAIL')!,
      subject: `New Student Application - ${profile.first_name} ${profile.last_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Student Application</h2>
          <p><strong>Name:</strong> ${profile.first_name} ${profile.last_name}</p>
          <p><strong>Email:</strong> ${profile.email}</p>
          <p>Click the button below to approve this student:</p>
          <a href="${approvalLink}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">
            Approve Student
          </a>
          <p style="font-size: 12px; color: #666;">Or copy this link: ${approvalLink}</p>
        </div>
      `
    })

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 })
  }
})