import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const { student_id, profile_id, approval_token } = await req.json()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Spirit Life SOM <onboarding@resend.dev>',
        to: 'seraphmedia2019@gmail.com', // Sent to you for testing
        subject: 'New Student Registration - Approval Required',
        html: `
          <h1>New Registration</h1>
          <p>A new student has registered and is waiting for approval.</p>
          <p><strong>Student ID:</strong> ${student_id}</p>
          <p><strong>Token:</strong> ${approval_token}</p>
          <a href="https://spiritlifesom.vercel.app/admin/approve?token=${approval_token}">Click here to Approve</a>
        `,
      }),
    })

    const data = await res.json()
    return new Response(JSON.stringify(data), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})