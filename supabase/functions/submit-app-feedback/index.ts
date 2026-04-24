import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const MAX_MESSAGE_LENGTH = 8000;
const DEFAULT_FEEDBACK_TO = 'alexanderphilippopoulos@gmail.com';
/** Resend test sender; replace with a verified domain address in production. */
const DEFAULT_FEEDBACK_FROM = 'GoalKeeper <onboarding@resend.dev>';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const jwt = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const messageRaw =
    body && typeof body === 'object' && 'message' in body
      ? (body as { message: unknown }).message
      : undefined;
  const message =
    typeof messageRaw === 'string' ? messageRaw.trim().slice(0, MAX_MESSAGE_LENGTH) : '';

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'Email is not configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const to = Deno.env.get('FEEDBACK_TO_EMAIL')?.trim() || DEFAULT_FEEDBACK_TO;
  const from = Deno.env.get('FEEDBACK_FROM_EMAIL')?.trim() || DEFAULT_FEEDBACK_FROM;
  const userLabel = user.email ?? user.id;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `GoalKeeper app feedback from ${userLabel}`,
      text: `From: ${userLabel}\nUser ID: ${user.id}\n\n${message}`,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('Resend error', resendRes.status, errText);
    return new Response(JSON.stringify({ error: 'Could not send feedback' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
