// functions/debug.js
export async function onRequest(context) {
  const { env } = context;
  
  return new Response(JSON.stringify({
    supabaseUrl: env.SUPABASE_URL ? 'Set' : 'Not set',
    supabaseKey: env.SUPABASE_KEY ? 'Set' : 'Not set',
    note: 'This is for debugging environment variables'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
