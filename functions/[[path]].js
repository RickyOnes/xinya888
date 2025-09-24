// functions/[[path]].js - 处理根路径和未知路径
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // 如果是根路径，重定向到前端页面或返回信息
  if (url.pathname === '/') {
    return new Response(JSON.stringify({
      message: 'Sales Data System API',
      endpoints: {
        authentication: '/auth/v1/',
        data: '/sales_records, /longqiao_records',
        debug: '/debug'
      },
      frontend: 'Visit the root path for the web application'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // 对于其他未知路径，返回404
  return new Response(JSON.stringify({
    error: 'Endpoint not found',
    message: `The path ${url.pathname} does not exist`,
    available_endpoints: [
      '/auth/v1/login',
      '/auth/v1/user', 
      '/sales_records',
      '/longqiao_records',
      '/debug'
    ]
  }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
