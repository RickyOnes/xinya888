// functions/_redirects.js - 处理根路径重定向到前端
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // 如果是API路径，不处理
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return await context.next();
  }
  
  // 对于根路径和其他前端路由，返回前端页面
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/index.html'
    }
  });
}
