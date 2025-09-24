// functions/auth/v1/[[path]].js
export async function onRequest(context) {
  const { request, env, params } = context;
  
  // 处理 path 参数
  let path = params.path;
  if (Array.isArray(path)) {
    path = path.join('/');
  }
  path = path || '';

  const url = new URL(request.url);
  const method = request.method;

  // CORS 头
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ 
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    const authApiUrl = `${supabaseUrl}/auth/v1`;

    let body = null;
    if (['POST', 'PATCH'].includes(method)) {
      try {
        body = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
    }

    // 登录处理
    if (path === 'login' && method === 'POST') {
      const authResponse = await fetch(`${authApiUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(body)
      });

      if (!authResponse.ok) {
        const errorData = await authResponse.json();
        return new Response(JSON.stringify({ 
          error: 'Authentication failed', 
          message: errorData.error_description || 'Invalid credentials'
        }), {
          status: authResponse.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }

      const data = await authResponse.json();
      return new Response(JSON.stringify(data), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 获取用户信息
    if (path === 'user' && method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
      const userResponse = await fetch(`${authApiUrl}/user`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': authHeader
        }
      });

      if (!userResponse.ok) {
        const errorData = await userResponse.json();
        return new Response(JSON.stringify({ 
          error: 'Failed to get user',
          message: errorData.message || 'Invalid token'
        }), {
          status: userResponse.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }

      const data = await userResponse.json();
      return new Response(JSON.stringify(data), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Auth endpoint not found',
      message: `Endpoint ${path} not found` 
    }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
