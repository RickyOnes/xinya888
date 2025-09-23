// functions/[...path].js
export async function onRequest(context) {
  const { request, env, params } = context;
  const table = params.path || '';
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
    // 检查是否是认证路由（应该已经被上面的函数处理）
    if (table.startsWith('auth/')) {
      return new Response(JSON.stringify({ error: 'Auth routes should be accessed via /auth/v1/' }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 获取认证头
    const authHeader = request.headers.get('Authorization');
    
    // 构建 Supabase REST API URL
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    const restApiUrl = `${supabaseUrl}/rest/v1`;

    // 处理 GET 请求（查询数据）
    if (method === 'GET') {
      // 构建查询URL - 直接传递所有查询参数
      let queryUrl = `${restApiUrl}/${table}`;
      
      // 直接使用原始查询字符串，避免复杂的参数解析
      if (url.search) {
        queryUrl += url.search;
      }
      
      const headers = {
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      };
      
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: headers
      });

      const data = await response.json();
      
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Failed to fetch data' }), {
          status: response.status,
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

    // 处理 POST 请求（插入数据）
    if (method === 'POST') {
      let body = null;
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

      const headers = {
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      };
      
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      
      const response = await fetch(`${restApiUrl}/${table}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Failed to insert data' }), {
          status: response.status,
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

    // 处理 PATCH 请求（更新数据）
    if (method === 'PATCH') {
      let body = null;
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

      // 需要有一个过滤条件来更新数据
      const headers = {
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      };
      
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      
      // 构建查询URL
      let queryUrl = `${restApiUrl}/${table}`;
      
      // 添加查询参数作为过滤条件
      const queryParams = [];
      for (const [key, value] of url.searchParams) {
        if (key !== 'select') {
          queryParams.push(`${key}=eq.${value}`);
        }
      }
      
      if (queryParams.length > 0) {
        queryUrl += `?${queryParams.join('&')}`;
      } else {
        return new Response(JSON.stringify({ error: 'Update requires at least one filter condition' }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
      const response = await fetch(queryUrl, {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Failed to update data' }), {
          status: response.status,
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

    // 处理 DELETE 请求（删除数据）
    if (method === 'DELETE') {
      // 需要有一个过滤条件来删除数据
      const headers = {
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      };
      
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      
      // 构建查询URL
      let queryUrl = `${restApiUrl}/${table}`;
      
      // 添加查询参数作为过滤条件
      const queryParams = [];
      for (const [key, value] of url.searchParams) {
        if (key !== 'select') {
          queryParams.push(`${key}=eq.${value}`);
        }
      }
      
      if (queryParams.length > 0) {
        queryUrl += `?${queryParams.join('&')}`;
      } else {
        return new Response(JSON.stringify({ error: 'Delete requires at least one filter condition' }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
      
      const response = await fetch(queryUrl, {
        method: 'DELETE',
        headers: headers
      });

      const data = await response.json();
      
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Failed to delete data' }), {
          status: response.status,
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

    // 默认返回
    return new Response(JSON.stringify({ error: `Method ${method} not supported for table ${table}` }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });

  } catch (error) {
    console.error('Table Function error:', error);
    
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
