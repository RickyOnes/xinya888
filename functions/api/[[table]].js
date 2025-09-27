// functions/api/[[table]].js
export async function onRequest(context) {
  const { request, env, params } = context;
  
  // 处理 table 参数
  let table = params.table;
  if (Array.isArray(table)) {
    table = table.join('/');
  }
  table = table || '';

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
    // 检查环境变量
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
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

    // 如果 table 为空，返回可用端点信息
    if (!table) {
      return new Response(JSON.stringify({
        message: 'Data API endpoints',
        available_tables: ['sales_records', 'longqiao_records'],
        usage: 'GET /api/sales_records?select=*'
      }), {
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

    // 处理 GET 请求
    if (method === 'GET') {
      let queryUrl = `${restApiUrl}/${table}`;
      
      if (url.search) {
        queryUrl += url.search;
      }
      
      const headers = {
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Authorization': authHeader ? authHeader : `Bearer ${supabaseKey}`
      };
      
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch data',
          message: `API returned ${response.status}`
        }), {
          status: response.status,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }

      const data = await response.json();
      
      // 创建响应并设置 Cookie
      const resultResponse = new Response(JSON.stringify(data), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
      
      // 设置 Cookie
      resultResponse.headers.append('Set-Cookie', `Wj_S...=your-cookie-value; Path=/; HttpOnly; Secure; SameSite=Strict`);
      
      return resultResponse;
    }

    return new Response(JSON.stringify({ 
      error: 'Method not implemented',
      message: `${method} method not yet implemented` 
    }), {
      status: 501,
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