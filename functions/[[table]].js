// functions/[[table]].js
export async function onRequest(context) {
  const { request, env, params } = context;
  const table = params.table || '';
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
    // 检查环境变量是否存在
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing environment variables:', {
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseKey: !!supabaseKey
      });
      
      return new Response(JSON.stringify({ 
        error: 'Server configuration error',
        message: 'Missing required environment variables'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 检查是否是认证路由
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
    const restApiUrl = `${supabaseUrl}/rest/v1`;

    // 处理 GET 请求（查询数据）
    if (method === 'GET') {
      // 构建查询URL
      let queryUrl = `${restApiUrl}/${table}`;
      
      // 直接使用原始查询字符串
      if (url.search) {
        queryUrl += url.search;
      }
      
      const headers = {
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Authorization': authHeader ? authHeader : `Bearer ${supabaseKey}`
      };
      
      console.log('Fetching from:', queryUrl);
      
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: headers
      });

      // 检查响应状态
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Supabase API error:', response.status, errorText);
        
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch data',
          message: `API returned ${response.status}: ${errorText}`
        }), {
          status: response.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }

      const data = await response.json();
      
      return new Response(JSON.stringify(data), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // 其他方法（POST、PATCH、DELETE）暂时简化处理
    return new Response(JSON.stringify({ 
      error: 'Method not implemented',
      message: `${method} method for table ${table} is not yet implemented` 
    }), {
      status: 501,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });

  } catch (error) {
    console.error('Table Function error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
