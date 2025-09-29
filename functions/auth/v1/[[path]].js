// functions/auth/v1/[[path]].js
export async function onRequest(context) {
    const { request, env, params } = context;

    // 处理 path 参数
    let path = params.path;
    if (Array.isArray(path)) {
        path = path.join('/');
    }
    path = path || '';

    const method = request.method;

    // CORS 头
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",                  // 允许所有域名跨域访问
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", // 允许的 HTTP 方法
        "Access-Control-Allow-Headers": "Content-Type, Authorization"     // 允许的自定义头
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
            if (!body || !body.email || !body.password) {
                return new Response(JSON.stringify({
                    error: 'Missing credentials',
                    message: 'Email and password are required'
                }), {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            const authResponse = await fetch(`${authApiUrl}/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({
                    email: body.email,
                    password: body.password
                })
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
            // 计算 expires_at（以秒为单位），如果 supabase 返回 expires_in，则使用之
            if (data.expires_in) {
                data.expires_at = Math.floor(Date.now() / 1000) + Number(data.expires_in);
            } else {
                data.expires_at = Math.floor(Date.now() / 1000) + 604800; // 兜底1周
            }

            // 将 refresh_token 写入 HttpOnly, Secure cookie（前端无法读取），供后续刷新使用
            const refreshToken = data.refresh_token || '';
            // 设置 cookie 属性：HttpOnly, Secure, Path=/, SameSite=Lax, Max-Age 30天（可根据需要调整）
            const maxAge = 60 * 60 * 24 * 30; // 30 天
            const cookieStr = `refresh_token=${encodeURIComponent(refreshToken)}; HttpOnly; Secure; Path=/; Max-Age=${maxAge}; SameSite=Lax`;

            // 不将 refresh_token 返回给前端 body（前端通过 cookie 自动处理刷新），但保留 access_token/expires_in
            const respBody = {
                access_token: data.access_token,
                expires_in: data.expires_in,
                token_type: data.token_type
            };

            return new Response(JSON.stringify(respBody), {
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': cookieStr,
                    ...corsHeaders
                }
            });
        }

        // token 刷新或密码授权（代理 token 端点）
        if (path === 'token' && method === 'POST') {
            // 支持通过 query 参数指定 grant_type（如 ?grant_type=refresh_token）
            const urlObj = new URL(request.url);
            const grantType = urlObj.searchParams.get('grant_type') || '';

            // 如果是 refresh_token，则 body 至少包含 refresh_token
            if (grantType === 'refresh_token') {
                // 支持从 HttpOnly cookie 或请求 body 中读取 refresh_token
                let refresh_token = null;
                if (body && body.refresh_token) refresh_token = body.refresh_token;
                // 从 Cookie 读取
                if (!refresh_token) {
                    const cookieHeader = request.headers.get('cookie') || '';
                    const match = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith('refresh_token='));
                    if (match) {
                        refresh_token = decodeURIComponent(match.split('=')[1]);
                    }
                }

                if (!refresh_token) {
                    return new Response(JSON.stringify({ error: 'Missing refresh_token' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                const tokenResponse = await fetch(`${authApiUrl}/token?grant_type=refresh_token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify({ refresh_token })
                });

                if (!tokenResponse.ok) {
                    let errData = {};
                    try { errData = await tokenResponse.json(); } catch (e) {}
                    return new Response(JSON.stringify({ error: 'Token refresh failed', message: errData.error_description || errData.message || 'Failed to refresh token' }), {
                        status: tokenResponse.status,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                const data = await tokenResponse.json();
                // 计算 expires_at（以秒为单位）
                if (data.expires_in) {
                    data.expires_at = Math.floor(Date.now() / 1000) + Number(data.expires_in);
                }

                // 在刷新成功后，Supabase 可能会返回新的 refresh_token（轮换），把它写回 HttpOnly cookie
                if (data.refresh_token) {
                    const maxAge = 60 * 60 * 24 * 30; // 30 天
                    const cookieStr = `refresh_token=${encodeURIComponent(data.refresh_token)}; HttpOnly; Secure; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
                    const respBody = {
                        access_token: data.access_token,
                        expires_in: data.expires_in,
                        token_type: data.token_type
                    };
                    return new Response(JSON.stringify(respBody), {
                        headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieStr, ...corsHeaders }
                    });
                }

                // 如果没有新的 refresh_token，仍返回 access_token 信息（不包含 refresh_token）
                const respBody = {
                    access_token: data.access_token,
                    expires_in: data.expires_in,
                    token_type: data.token_type
                };
                return new Response(JSON.stringify(respBody), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            // 其他 grant_type（如 password）可代理到 supabase（保留原有 login 实现）
            return new Response(JSON.stringify({ error: 'Unsupported grant_type' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // 注册处理
        if (path === 'signup' && method === 'POST') {
            if (!body || !body.email || !body.password) {
                return new Response(JSON.stringify({
                    error: 'Missing required fields',
                    message: 'Email and password are required'
                }), {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            // 构建注册请求体
            const signupBody = {
                email: body.email,
                password: body.password,
                data: {}
            };

            // 可选：添加手机号
            if (body.phone) {
                signupBody.phone = body.phone;
            }

            // 可选：添加其他用户元数据
            if (body.user_metadata) {
                signupBody.data = { ...signupBody.data, ...body.user_metadata };
            }

            const authResponse = await fetch(`${authApiUrl}/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                },
                body: JSON.stringify(signupBody)
            });

            if (!authResponse.ok) {
                const errorData = await authResponse.json();
                return new Response(JSON.stringify({
                    error: 'Registration failed',
                    message: errorData.message || 'Failed to create account'
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
                const errorData = await logoutResponse.json();
                return new Response(JSON.stringify({
                    error: 'Logout failed',
                    message: errorData.message || 'Failed to sign out'
                }), {
                    status: logoutResponse.status,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            // 清除 HttpOnly refresh_token cookie（通过设置过期）
            const clearCookie = `refresh_token=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax`;
            return new Response(JSON.stringify({
                message: 'Successfully signed out'
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': clearCookie,
                    ...corsHeaders
                }
            });
        }

        // 重置密码请求
        if (path === 'reset-password' && method === 'POST') {
            if (!body || !body.email) {
                return new Response(JSON.stringify({
                    error: 'Missing email',
                    message: 'Email is required for password reset'
                }), {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            const resetResponse = await fetch(`${authApiUrl}/recover`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey
                },
                body: JSON.stringify({
                    email: body.email,
                    redirectTo: body.redirectTo || `${new URL(request.url).origin}/reset-password`
                })
            });

            if (!resetResponse.ok) {
                const errorData = await resetResponse.json();
                return new Response(JSON.stringify({
                    error: 'Password reset failed',
                    message: errorData.message || 'Failed to send reset email'
                }), {
                    status: resetResponse.status,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            return new Response(JSON.stringify({
                message: 'Password reset email sent successfully'
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }

        // 默认返回
        return new Response(JSON.stringify({
            error: 'Auth endpoint not found',
            message: `Endpoint /auth/v1/${path} not found`,
            available_endpoints: [
                'POST /auth/v1/login',
                'POST /auth/v1/signup',
                'GET /auth/v1/user',
                'POST /auth/v1/logout',
                'POST /auth/v1/reset-password'
            ]
        }), {
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