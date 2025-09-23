// functions/auth/v1/[...path].js
export async function onRequest(context) {
  const { request, env, params } = context;
  const path = params.path || '';
  const url = new URL(request.url);
  const method = request.method;

  // CORS 头
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // 处理 OPTIONS 预检请求
  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 获取请求体
    let body = null;
    if (['POST', 'PATCH'].includes(method)) {
      try {
        body = await request.json();
      } catch (e) {
        // 忽略无法解析的JSON
      }
    }

    // 构建 Supabase Auth API URL
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    const authApiUrl = `${supabaseUrl}/auth/v1`;

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

      const data = await authResponse.json();
      
      if (!authResponse.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Authentication failed' }), {
          status: authResponse.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
      return new Response(JSON.stringify(data), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 注册处理
    if (path === 'signup' && method === 'POST') {
      const authResponse = await fetch(`${authApiUrl}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(body)
      });

      const data = await authResponse.json();
      
      if (!authResponse.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Signup failed' }), {
          status: authResponse.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
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

      const data = await userResponse.json();
      
      if (!userResponse.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Failed to get user' }), {
          status: userResponse.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
      return new Response(JSON.stringify(data), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 退出登录
    if (path === 'logout' && method === 'POST') {
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
      
      const logoutResponse = await fetch(`${authApiUrl}/logout`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });
      
      if (!logoutResponse.ok) {
        const data = await logoutResponse.json();
        return new Response(JSON.stringify({ error: data.message || 'Failed to logout' }), {
          status: logoutResponse.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
      return new Response(JSON.stringify({ message: 'Successfully signed out' }), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 重置密码
    if (path === 'reset-password' && method === 'POST') {
      const resetResponse = await fetch(`${authApiUrl}/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        },
        body: JSON.stringify({ email: body.email })
      });

      if (!resetResponse.ok) {
        const data = await resetResponse.json();
        return new Response(JSON.stringify({ error: data.message || 'Failed to reset password' }), {
          status: resetResponse.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
      return new Response(JSON.stringify({ message: 'Password reset email sent' }), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 默认返回
    return new Response(JSON.stringify({ error: 'Auth endpoint not found: ' + path }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });

  } catch (error) {
    console.error('Auth Function error:', error);
    
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
