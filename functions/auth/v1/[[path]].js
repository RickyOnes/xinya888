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
            data.expires_at = Math.floor(Date.now() / 1000) + 604800; // 设置过期时间为1周
            return new Response(JSON.stringify(data), {
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
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

            return new Response(JSON.stringify({
                message: 'Successfully signed out'
            }), {
                headers: {
                    'Content-Type': 'application/json',
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
