
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
    const {
      startDate,
      endDate,
      warehouseType,
      selectedWarehouses = [],
      selectedBrands = [],
      selectedProducts = [],
      selectedCustomers = [],
      // 新增：只返回必要字段
      fields = '*',
      // 新增：聚合选项
      aggregate = false
    } = await request.json();

    const table = warehouseType === 'longqiao' ? 'longqiao_records' : 'sales_records';
    
    // 1. 使用更高效的查询构建方式
    let query = supabaseClient
      .from(table)
      .select(fields)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate);

    // 2. 批量添加筛选条件（减少查询复杂度）
    if (selectedWarehouses.length > 0) {
      const warehouseField = warehouseType === 'longqiao' ? 'sales' : 'warehouse';
      query = query.in(warehouseField, selectedWarehouses);
    }

    if (selectedBrands.length > 0) {
      query = query.in('brand', selectedBrands);
    }

    if (selectedProducts.length > 0) {
      query = query.in('product_id', selectedProducts);
    }

    if (warehouseType === 'longqiao' && selectedCustomers.length > 0) {
      query = query.in('customer', selectedCustomers);
    }

    // 3. 使用更高效的排序和限制
    query = query.order('sale_date', { ascending: false })
                .limit(50000); // 适当限制结果集大小

    const { data, error } = await query;

    if (error) throw error;

    // 4. 在服务端进行初步数据处理
    const processedData = processDataOnServer(data, warehouseType);

    return new Response(JSON.stringify({
      success: true,
      data: processedData,
      summary: aggregate ? generateSummary(processedData, warehouseType) : null,
      totalCount: processedData.length,
      queryTime: new Date().toISOString()
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

// 服务端数据处理函数
function processDataOnServer(data, warehouseType) {
  // 移除不必要的字段，减少传输量
  return data.map(item => {
    const baseItem = {
      sale_date: item.sale_date,
      product_id: item.product_id,
      product_name: item.product_name,
      brand: item.brand,
      quantity: item.quantity || 0
    };

    if (warehouseType === 'longqiao') {
      return {
        ...baseItem,
        sales: item.sales,
        customer: item.customer,
        amount: item.amount || 0,
        cost: item.cost || 0
      };
    } else {
      return {
        ...baseItem,
        warehouse: item.warehouse,
        unit_price: item.unit_price || 0,
        pieces: item.pieces || 0,
        returns: item.returns || 0,
        inbounds: item.inbounds || 0,
        difference: item.difference || 0
      };
    }
  });
}
