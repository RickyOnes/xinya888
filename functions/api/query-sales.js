export async function onRequest(context) {
  const { request, env } = context;
  
  // CORS 头
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 解析前端查询参数
    const queryParams = await request.json();
    const {
      startDate,
      endDate,
      warehouseType,
      selectedWarehouses = [],
      selectedBrands = [],
      selectedProducts = [],
      selectedCustomers = []
    } = queryParams;

    // 根据仓库类型选择表
    const table = warehouseType === 'longqiao' ? 'longqiao_records' : 'sales_records';
    
    // 构建查询条件
    let queryConditions = [`sale_date=gte.${startDate}`, `sale_date=lte.${endDate}`];
    
    // 添加筛选条件
    if (selectedWarehouses.length > 0) {
      const warehouseField = warehouseType === 'longqiao' ? 'sales' : 'warehouse';
      queryConditions.push(`${warehouseField}=in.(${selectedWarehouses.join(',')})`);
    }
    
    if (selectedBrands.length > 0) {
      queryConditions.push(`brand=in.(${selectedBrands.join(',')})`);
    }
    
    if (selectedProducts.length > 0) {
      queryConditions.push(`product_id=in.(${selectedProducts.join(',')})`);
    }
    
    if (warehouseType === 'longqiao' && selectedCustomers.length > 0) {
      queryConditions.push(`customer=in.(${selectedCustomers.join(',')})`);
    }

    // 构建查询URL
    const queryString = queryConditions.join('&');
    const queryUrl = `${supabaseUrl}/rest/v1/${table}?select=*&${queryString}`;

    // 执行查询
    const response = await fetch(queryUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase query failed: ${response.status}`);
    }

    const data = await response.json();

    // 返回处理好的数据
    return new Response(JSON.stringify({
      success: true,
      data: data,
      totalCount: data.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
