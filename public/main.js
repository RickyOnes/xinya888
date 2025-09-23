// ============== 1. 初始化部分 ==============
// Supabase客户端初始化
const WORKER_URL = ''; // 使用空字符串，指向同一个域名
let supabaseClient;

// 创建自定义的 Supabase 客户端
function createSupabaseClient() {
  return {
    from: (table) => {
      return {
        select: (query) => {
          // 将查询对象传递给 sendRequest，GET 请求的参数会自动转换为查询字符串
          return sendRequest('GET', table, query);
        },
        insert: (data) => sendRequest('POST', table, data),
        update: (data) => {
          // 更新操作需要指定条件，这里简化处理
          const params = {};
          if (data.id) {
            params.id = `eq.${data.id}`;
          }
          return sendRequest('PATCH', table, { ...params, ...data });
        },
        delete: () => {
          // 删除操作需要指定条件，这里简化处理
          return sendRequest('DELETE', table);
        },
      };
    },
    
    // 在auth对象中的各个方法中添加token处理
    auth: {
      // 获取当前用户
      getUser: async () => {
        try {
          const response = await sendRequest('GET', 'auth/user');
          return response;
        } catch (error) {
          console.error('Get user error:', error);
          // 清除无效的token
          if (error.message.includes('401') || error.message.includes('403')) {
            localStorage.removeItem('supabase.auth.token');
          }
          throw error;
        }
      },
      
      // 密码登录
      signInWithPassword: async (credentials) => {
        try {
          const response = await sendRequest('POST', 'auth/login', {
            email: credentials.email,
            password: credentials.password
          });
          
          // 存储token
          if (response.access_token) {
            localStorage.setItem('supabase.auth.token', JSON.stringify(response));
          }
          
          return response;
        } catch (error) {
          console.error('Sign in error:', error);
          throw error;
        }
      },
      
      // 注册
      signUp: async (credentials) => {
        try {
          const response = await sendRequest('POST', 'auth/signup', {
            email: credentials.email,
            password: credentials.password,
            phone: credentials.phone
          });
          
          // 存储token
          if (response.access_token) {
            localStorage.setItem('supabase.auth.token', JSON.stringify(response));
          }
          
          return response;
        } catch (error) {
          console.error('Sign up error:', error);
          throw error;
        }
      },
      
      // 退出登录
      signOut: async () => {
        try {
          const response = await sendRequest('POST', 'auth/logout');
          // 清除token
          localStorage.removeItem('supabase.auth.token');
          return response;
        } catch (error) {
          console.error('Sign out error:', error);
          throw error;
        }
      },
      
      // 重置密码
      resetPasswordForEmail: async (email, options) => {
        try {
          const response = await sendRequest('POST', 'auth/reset-password', {
            email,
            redirectTo: options.redirectTo
          });
          return response;
        } catch (error) {
          console.error('Reset password error:', error);
          throw error;
        }
      }
    }
  };
}

// 发送请求到 Worker
async function sendRequest(method, path, data = null) {
  // 处理认证端点的特殊路径
  let apiPath = path;
  if (path.startsWith('auth/')) {
    apiPath = `auth/v1/${path.replace('auth/', '')}`;
  }
  
  // 构建完整的 URL
  let url = `${WORKER_URL}/${apiPath}`;
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  // 添加认证token（如果存在）
  const token = localStorage.getItem('supabase.auth.token');
  if (token) {
    try {
      const parsedToken = JSON.parse(token);
      if (parsedToken.access_token) {
        options.headers['Authorization'] = `Bearer ${parsedToken.access_token}`;
      }
    } catch (e) {
      console.error('Failed to parse token', e);
    }
  }
  
  // 处理GET请求的查询参数
  if (method === 'GET' && data) {
    const queryParams = [];
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        // 处理范围查询（如日期范围）
        if (value.gte && value.lte) {
          queryParams.push(`${key}=gte.${value.gte}`);
          queryParams.push(`${key}=lte.${value.lte}`);
        } else if (key === 'select') {
          queryParams.push(`select=${value}`);
        } else if (key === 'offset' || key === 'limit') {
          queryParams.push(`${key}=${value}`);
        }
      } else {
        queryParams.push(`${key}=${value}`);
      }
    }
    if (queryParams.length > 0) {
      url = `${url}?${queryParams.join('&')}`;
    }
  } else if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }
  
  try {
    console.log('Making request to:', url, options);
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: `HTTP error! status: ${response.status}` };
      }
      throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    const responseData = await response.json();
    
    // 特殊处理 getUser 响应
    if (apiPath === 'auth/v1/user') {
      return { data: { user: responseData } };
    }
    
    // 特殊处理登录和注册响应
    if (apiPath === 'auth/v1/login' || apiPath === 'auth/v1/signup') {
      return responseData;
    }
    
    return responseData;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}

try {
  // 初始化 Supabase 客户端
  supabaseClient = createSupabaseClient();
} catch (error) {
  showRoundedAlert('系统初始化失败，请刷新页面或联系管理员', 'error'); // 替换alert
}

// ============== 2. DOM元素引用 ==============
const dateRangePicker = document.getElementById('dateRangePicker'); // 日期范围选择器
const queryBtn = document.getElementById('queryBtn');
const clearBtn = document.getElementById('clearBtn');
const summaryTable = document.getElementById('summaryTable').querySelector('tbody');
const detailTable = document.getElementById('detailTable').querySelector('tbody');
const loadingEl = document.getElementById('loading');
const totalQuantityEl = document.getElementById('totalQuantity');
const totalAmountEl = document.getElementById('totalAmount');
const totalProductsEl = document.getElementById('totalProducts');
const totalBrandsEl = document.getElementById('totalBrands');
const toggleDetails = document.getElementById('toggleDetails');
const detailSection = document.getElementById('detailSection');
const totalProfitEl = document.getElementById('totalProfit'); //毛利
const switchWarehouseBtn = document.getElementById('switchWarehouseBtn'); // 切换仓库按钮

// 多选下拉框元素
const warehouseSelector = document.getElementById('warehouseSelector');
const warehouseOptions = document.getElementById('warehouseOptions');
const brandSelector = document.getElementById('brandSelector');
const brandOptions = document.getElementById('brandOptions');
const productSelector = document.getElementById('productSelector');
const productOptions = document.getElementById('productOptions');
const customerSelector = document.getElementById('customerSelector');
const customerOptions = document.getElementById('customerOptions');

// 添加认证相关的DOM引用
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerPhone = document.getElementById('registerPhone');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const authTabs = document.querySelectorAll('.auth-tab');

// 添加用户状态相关的DOM引用
const userStatus = document.getElementById('userStatus');
const userInfo = document.getElementById('userInfo');
const userName = document.getElementById('userName');
const userMenu = document.getElementById('userMenu');
const logoutBtn = document.getElementById('logoutBtn');

const chartToggleBtn = document.getElementById('chartToggleBtn');
const returnsTableContainer = document.getElementById('returnsTableContainer');
const returnsTable = document.getElementById('returnsTable');
const exportDetailsBtn = document.getElementById('exportDetails');

// ============== 3. 全局状态 ==============
let allWarehouses = [];
let allBrands = [];
let allProductsData = [];
let brandMap = {};
let currentOpenDropdown = null;
let selectedProducts = []; 
let user = null; // 全局用户状态
let currentWarehouse = 'default'; // 'default' 或 'longqiao'
let allSalesPersons = []; // 销售人员列表
let allCustomers = []; // 新增：客户列表
let salesRecords = []; // 存储销售记录
let startDateStr = ''; // 全局开始日期字符串
let endDateStr = ''; // 全局结束日期字符串
let displayMode = 'chart'; // 'chart' 或 'returns'
let flatpickrInstance; // 全局Flatpickr实例
let warehouseMultiSelect, brandMultiSelect, productMultiSelect, customerMultiSelect;// 全局下拉框实例

// ============== 4. 工具函数 ==============
// 数字格式化
function formatNumber(num) {
  if (typeof num !== 'number') return '0';
  return num.toLocaleString('zh-CN', { 
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

// 设置默认日期范围
function setDefaultDates() {
  const endDate = new Date();
  const startDate = new Date();
  
  // 检查今天是否是每月1号
  if (endDate.getDate() === 1) {
    // 设置为上个月的1号到上个月最后一天
    startDate.setMonth(startDate.getMonth() - 1);
    startDate.setDate(1);
    
    endDate.setMonth(endDate.getMonth() - 1);
    endDate.setDate(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate());
  } else {
    // 默认设置为当月1号到昨天
    startDate.setDate(1);
    endDate.setDate(endDate.getDate() - 1);
  }
  
  // 设置Flatpickr的值
  flatpickrInstance.setDate([startDate, endDate]);
}

// **** 认证函数，用户状态显示****
// 修改initAuth函数以正确处理用户认证状态
async function initAuth() {
  if (!supabaseClient) {
    return false;
  }

  try {
    // 检查本地是否有存储的token
    const token = localStorage.getItem('supabase.auth.token');
    if (!token) {
      userStatus.style.display = 'none';
      authContainer.style.display = 'block';
      return false;
    }

    // 使用token获取用户信息
    const response = await supabaseClient.auth.getUser();
    
    // 修复：检查response是否存在以及response.data.user是否存在
    if (response && response.data && response.data.user) {
      user = response.data.user;
      // 显示用户状态 - 根据邮箱前缀映射到用户名
      const emailPrefix = user.email.split('@')[0];
      const usernameMap = {
        '162004332': '系统管理员',
        'rickyone': '数据管理员',
        '13762405681': '王英',
        'ksf2025': '康师傅',
        'pepsi_cola': '百事可乐',
        'coca_cola': '可口可乐',
        '15096086678': '娟子'
      };
      
      const displayName = usernameMap[emailPrefix] || emailPrefix;
      userName.textContent = displayName;

      userStatus.style.display = 'block';
      authContainer.style.display = 'none';
      appContainer.style.display = 'block';
      showRoundedAlert(`欢迎 ${displayName}！`, 'success');
      return true;
    } else {
      // 清除无效的token
      localStorage.removeItem('supabase.auth.token');
      userStatus.style.display = 'none';
      authContainer.style.display = 'block';
      return false;
    }
  } catch (error) {
    console.error('Auth init error:', error);
    // 清除无效的token
    localStorage.removeItem('supabase.auth.token');
    userStatus.style.display = 'none';
    authContainer.style.display = 'block';
    return false;
  }
}

// **** 弹窗提示函数 ****
function showRoundedAlert(message, type = 'error') {
  // 移除已有的提示容器
  const existingAlert = document.getElementById('custom-alert');
  if (existingAlert) existingAlert.remove();
  
  // 创建提示容器
  const alertContainer = document.createElement('div');
  alertContainer.id = 'custom-alert';
  alertContainer.className = `rounded-alert ${type}`;
  
  // 创建内容
  alertContainer.innerHTML = `
    <div class="alert-content">
      <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  
  // 添加到DOM
  document.body.appendChild(alertContainer);
  
  // 计算水平居中位置
  const containerWidth = alertContainer.offsetWidth;
  const leftPosition = (window.innerWidth - containerWidth) / 2;
  
  // 设置位置
  alertContainer.style.top = '20px';
  alertContainer.style.left = `${leftPosition}px`;
  
  // 自动消失
  setTimeout(() => {
    alertContainer.classList.add('fade-out');
    setTimeout(() => alertContainer.remove(), 300);
  }, 2000);
}

// **** 仓库切换功能 ****
function switchWarehouse() {
  // +++ 新增：收起详细记录区域 +++
  if (detailSection.classList.contains('visible')) {
    detailSection.classList.remove('visible');
    // 更新图标方向
    const icon = document.querySelector('#toggleDetails i');
    icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
  }
  
  // 切换仓库状态
  currentWarehouse = currentWarehouse === 'default' ? 'longqiao' : 'default';
  
  // 获取筛选行元素
  const filtersRow = document.querySelector('.filters-row');
  
  // 根据仓库类型添加/移除样式
  if (currentWarehouse === 'longqiao') {
    filtersRow.classList.add('longqiao');
  } else {
    filtersRow.classList.remove('longqiao');
  }
  
  // 立即更新UI布局
  updateUIForWarehouse();  
  //根据仓库类型隐藏切换按钮
  chartToggleBtn.style.display = currentWarehouse === 'default' ? 'flex' : 'none'; 
  
  clearPieChart(); // 清除饼图数据  
  setDefaultDates() // 设置默认日期

  // 饼图切换显示模式
  displayMode = 'returns';
  toggleDisplayMode();  

  // 重新加载筛选选项
  loadFilterOptions().then(() => {
    // 重置下拉框选择
    warehouseMultiSelect.reset();
    brandMultiSelect.reset();
    productMultiSelect.reset();
    if (customerMultiSelect) { // 重置客户选择
      customerMultiSelect.reset();
    }    
    updateDetailTableHeader(); // 更新表头
    loadData();// 重新加载数据
    handleResponsiveLayout(); // 添加响应式处理
  });
}

// ****更新UI****
function updateUIForWarehouse() {
  const header = document.querySelector('header h1');
  const profitCard = document.getElementById('profitCard');
  const totalProductsCard = document.getElementById('totalProducts').closest('.stat-card'); // 获取商品种类卡片
  
  if (currentWarehouse === 'longqiao') {
    header.innerHTML = `<img src="icon64.png" alt="应用图标" style="border-radius: 8px; filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.5));"> 隆桥仓库销售数据查询系统`;
    document.querySelector('.filter-group label:has(i.fas.fa-warehouse)').innerHTML = `<i class="fas fa-user"></i> 销售人员`;
    profitCard.style.display = 'block';
  } else {
    header.innerHTML = `<img src="icon64.png" alt="应用图标" style="border-radius: 8px; filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.5));"> 多多买菜销售数据查询系统`;
    document.querySelector('.filter-group label:has(i.fas.fa-user)').innerHTML = `<i class="fas fa-warehouse"></i> 仓库`;
    profitCard.style.display = 'none';
    // 显示商品种类卡片
    totalProductsCard.style.display = 'block';
  }
  
  // 客户筛选框显示控制
  const customerFilterGroup = document.getElementById('customerFilterGroup');
  if (customerFilterGroup) {
    customerFilterGroup.style.display = currentWarehouse === 'longqiao' ? 'block' : 'none';
  }  
}

// ***更新详细记录表头****
function updateDetailTableHeader() {
  const thead = document.querySelector('#detailTable thead');
  let headerHTML = `
    <tr>
      <th>日期</th>
      <th>${currentWarehouse === 'longqiao' ? '客户名称' : '商品ID'}</th> 
      <th>商品名称</th>
      <th>品牌</th>
      <th>${currentWarehouse === 'longqiao' ? '销售人员' : '仓库'}</th>
      <th>销量</th>
      <th>${currentWarehouse === 'longqiao' ? '成本' : '单价'}</th>
      <th>金额</th>
  `;
  
  if (currentWarehouse === 'longqiao') {
    headerHTML += `<th>毛利</th>`;
  }
  
  headerHTML += `</tr>`;
  
  thead.innerHTML = headerHTML;
}

// ============== 5. 下拉框管理 （类+全局事件） ==============
class MultiSelect {
  constructor(selector, optionsContainer, placeholder) {
    this.selector = selector;
    this.optionsContainer = optionsContainer;
    this.placeholder = placeholder;
    this.selectedValues = [];
    this.allOptions = [];
    this.clearBtn = selector.querySelector('.clear-btn');
    
    // 初始化事件
    this.initEvents();
  }

  initEvents() {
    // 点击选择框显示/隐藏选项
    this.selector.addEventListener('click', (e) => this.toggleDropdown(e));
    
    // 清除按钮事件
    this.clearBtn.addEventListener('click', (e) => this.clearSelection(e));
    
    // 选项容器事件委托
    this.optionsContainer.addEventListener('change', (e) => this.handleOptionChange(e));
    
    // 鼠标事件保持下拉框状态
    this.optionsContainer.addEventListener('mouseenter', () => // 鼠标移入时保持下拉框状态
      this.optionsContainer.classList.add('active'));
    this.optionsContainer.addEventListener('mouseleave', () =>  // 鼠标移出时取消下拉框状态
      this.optionsContainer.classList.remove('active'));
  }

  toggleDropdown(e) { // 切换下拉框状态
    // 新增：检查是否点击了标签移除按钮或标签本身
    if (
      e.target.classList.contains('tag-remove') || 
      e.target.classList.contains('tag') ||
      e.target.closest('.tag-remove') ||
      e.target.closest('.tag')
    ) {
      return; // 如果是标签相关元素，直接返回不处理
    }   

    e.stopPropagation();
    
    // 先关闭所有下拉框（包括当前打开的）
    closeAllDropdowns();
    
    // 然后判断是否需要打开当前下拉框
    const isOpening = !this.optionsContainer.classList.contains('visible');
    
    if (isOpening) {
      this.optionsContainer.classList.add('visible');
      currentOpenDropdown = this.optionsContainer;
      const arrow = this.selector.querySelector('.arrow');
      arrow.classList.replace('fa-chevron-down', 'fa-chevron-up');
      this.positionDropdown();
    }
  }

  positionDropdown() { // 定位下拉框
    const rect = this.selector.getBoundingClientRect();
    const parentRect = this.selector.parentElement.getBoundingClientRect();
    
    this.optionsContainer.style.width = `${rect.width}px`;
    this.optionsContainer.style.left = `${rect.left - parentRect.left}px`;
    this.optionsContainer.style.top = `${rect.bottom - parentRect.top}px`;
  }

  clearSelection(e) { // 清空选择
    e.stopPropagation(); // 阻止事件冒泡
    this.selectedValues = [];
    this.updateDisplay();
    
    // 取消所有复选框
    const checkboxes = this.optionsContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    
    // 特殊处理品牌和商品下拉
    if (this.selector.id === 'brandSelector') {
      selectedProducts = [];
      filterProductsByBrand();
    } else if (this.selector.id === 'productSelector') {
      selectedProducts = [];
      filterProductsByBrand();
    }
  }

  handleOptionChange(e) { // 添加一个方法来处理选项的更改
    if (!e.target.matches('input[type="checkbox"]')) return; // 确保点击的是复选框
    
    const checkbox = e.target;
    const value = checkbox.value;
    
    // 全选处理
    if (checkbox.id.startsWith('selectAll')) {
      const checkboxes = this.optionsContainer.querySelectorAll(
        `input[type="checkbox"]:not([id="${checkbox.id}"])`
      );
      
      if (checkbox.checked) {
        this.selectedValues = this.allOptions.map(opt => opt.value);
        checkboxes.forEach(cb => cb.checked = true);
      } else {
        this.selectedValues = [];
        checkboxes.forEach(cb => cb.checked = false);
      }
    } 
    // 单个选项处理
    else {
      if (checkbox.checked) {
        if (!this.selectedValues.includes(value)) {
          this.selectedValues.push(value);
        }
      } else {
        const index = this.selectedValues.indexOf(value);
        if (index > -1) this.selectedValues.splice(index, 1);
      }
      
      // 更新全选状态
      this.updateSelectAllState();
    }
    
    this.updateDisplay();
    
    // 品牌下拉特殊处理
    if (this.selector.id === 'brandSelector') {
      selectedProducts = [];
      filterProductsByBrand();
      if (currentWarehouse === 'longqiao') { // 隆桥仓库模式下根据品牌过滤客户
        filterCustomersByBrand();
      }      
    }

    // 新增：仓库选择变化时，重新加载品牌和商品选项
    if (this.selector.id === 'warehouseSelector') {
      reloadBrandAndProductOptions();
    }    
  }

  updateDisplay() { // 更新显示
    const placeholderEl = this.selector.querySelector('.placeholder');
    const displayEl = this.selector.querySelector('.selected-display');
    const arrow = this.selector.querySelector('.arrow');
    
    displayEl.innerHTML = '';
    
    if (this.selectedValues.length === 0) {
      placeholderEl.textContent = `全部${this.placeholder}`;
      placeholderEl.style.display = 'block';
      displayEl.style.display = 'none';
      arrow.style.display = 'block';
      arrow.classList.replace('fa-times', 'fa-chevron-down');
      this.clearBtn.style.display = 'none';
      return;
    }
    
    placeholderEl.style.display = 'none';
    displayEl.style.display = 'flex';
    
    // 显示前5个选中项
    const maxDisplay = 5;
    const displayValues = this.selectedValues.slice(0, maxDisplay);
    const remainingCount = this.selectedValues.length - maxDisplay;
    
    displayValues.forEach(value => {
      const option = this.allOptions.find(opt => opt.value === value);
      if (!option) return;

      // 使用insertAdjacentHTML方法能被父元素监听
      displayEl.insertAdjacentHTML('beforeend', `
        <div class='tag' data-value='${value}'>
          ${option.label}
          <span class='tag-remove'><i class="far fa-circle-xmark"></i></span> 
        </div>
      `);      
    });
    
    // 显示剩余项提示
    if (remainingCount > 0) {
      const moreTag = document.createElement('div');
      moreTag.className = 'tag more-tag';
      moreTag.textContent = `...等${this.selectedValues.length}项`;
      displayEl.appendChild(moreTag);
    }
    
    // 更新图标状态
    arrow.style.display = 'none';
    this.clearBtn.style.display = 'block';
  }

  // 新增：重置选择
  reset() {
    this.selectedValues = [];
    this.updateDisplay();
    
    // 取消所有复选框
    const checkboxes = this.optionsContainer.querySelectorAll(
      'input[type="checkbox"]'
    );
    checkboxes.forEach(checkbox => (checkbox.checked = false));
  }

  // 新增：更新全选状态
  updateSelectAllState() {
    const selectAll = this.optionsContainer.querySelector(
      `input[id^="selectAll"]`
    );
    if (selectAll) {
      const checkboxes = this.optionsContainer.querySelectorAll(
        `input[type="checkbox"]:not([id^="selectAll"])`
      );
      selectAll.checked = checkboxes.length > 0 && 
        Array.from(checkboxes).every(cb => cb.checked);
    }
  }

  setOptions(options) {
    this.allOptions = options;
    this.renderOptions();
    this.updateDisplay();
  }

  renderOptions() { // 添加全选选项
    this.optionsContainer.innerHTML = '';
    
    // 添加全选选项
    const selectAllOption = document.createElement('div');
    selectAllOption.className = 'option';
    selectAllOption.innerHTML = `
      <input type="checkbox" id="selectAll${this.selector.id}">
      <label for="selectAll${this.selector.id}">全选</label>
    `;
    this.optionsContainer.appendChild(selectAllOption);
    
    // 添加普通选项
    this.allOptions.forEach(option => {
      const optionEl = document.createElement('div');
      optionEl.className = 'option';
      optionEl.innerHTML = `
        <input type="checkbox" id="${this.selector.id}-${option.value}" 
              value="${option.value}" ${this.selectedValues.includes(option.value) ? 'checked' : ''}>
        <label for="${this.selector.id}-${option.value}">${option.label}</label>
      `;
      this.optionsContainer.appendChild(optionEl);
    });
  }
}
// 新增：关闭所有下拉框函数
function closeAllDropdowns() {
  document.querySelectorAll('.options-container').forEach(dropdown => {
    dropdown.classList.remove('visible');
    const prevArrow = dropdown.previousElementSibling.querySelector('.arrow');
    if (prevArrow) {
      prevArrow.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
  });
  currentOpenDropdown = null;
}

// ============== 6. 仓库/人员、品牌与商品过滤 ==============
// ****根据品牌过滤商品选项****
function filterProductsByBrand() {
  // 清空商品选项容器
  productOptions.innerHTML = '';

  // 添加全选选项
  const productSelectAllOption = document.createElement('div');
  productSelectAllOption.className = 'option';
  productSelectAllOption.id = 'productSelectAll';
  productSelectAllOption.innerHTML = `
    <input type="checkbox" id="selectAllProducts">
    <label for="selectAllProducts">全选</label>
  `;
  productOptions.appendChild(productSelectAllOption);

  let filteredProducts = [];
  let displayBrandCount = brandMultiSelect.selectedValues.length;

  // 根据品牌筛选商品
  if (displayBrandCount > 0) {
    filteredProducts = allProductsData.filter(p => 
      brandMap[p.product_id] && brandMultiSelect.selectedValues.includes(brandMap[p.product_id])
    );
  } else {
    filteredProducts = allProductsData;
    displayBrandCount = '全部';
  }

  // 重置商品选中状态
  productMultiSelect.selectedValues = [];
  
  // 添加商品选项
  filteredProducts.forEach(product => {
    const option = document.createElement('div');
    option.className = 'option';
    const isSelected = productMultiSelect.selectedValues.includes(product.product_id);
    
    option.innerHTML = `
      <input type="checkbox" id="product-${product.product_id}" 
             value="${product.product_id}" ${isSelected ? 'checked' : ''}>
      <label for="product-${product.product_id}">${product.product_name}</label>
    `;
    productOptions.appendChild(option);
  });

  // 更新商品下拉框文本
  const placeholderEl = productSelector.querySelector('.placeholder');
  placeholderEl.textContent = brandMultiSelect.selectedValues.length === 0 
    ? '全部商品' 
    : `已筛选${displayBrandCount}个品牌`;
  
  // 更新商品下拉框选项
  productMultiSelect.setOptions(
    filteredProducts.map(p => ({ 
      value: p.product_id, 
      label: p.product_name 
    })).sort((a, b) => a.label.localeCompare(b.label)) // 按A-Z排序
  );
}

// **** 根据品牌过滤客户函数 **** 
function filterCustomersByBrand() { 
  const selectedBrands = brandMultiSelect.selectedValues;
  const selectedSales = warehouseMultiSelect.selectedValues; // 获取选中的销售人员
  
  // 使用全局 salesRecords 作为基础
  let filteredCustomers = [];
  
  if (selectedBrands.length > 0 || selectedSales.length > 0) {
    filteredCustomers = allCustomers.filter(customer => {
      // 检查该客户是否有匹配的记录
      return salesRecords.some(record => 
        record.customer === customer && 
        // 同时匹配品牌和销售人员
        (selectedBrands.length === 0 || selectedBrands.includes(record.brand)) &&
        (selectedSales.length === 0 || selectedSales.includes(record.sales))
      );
    });
  } else {
    // 没有品牌选中时显示所有客户
    filteredCustomers = allCustomers;
  }
  
  // 更新客户下拉框选项
  customerMultiSelect.setOptions(
    filteredCustomers.map(c => ({ value: c, label: c }))
      .sort((a, b) => a.label.localeCompare(b.label))
  );
  
  // 重置客户选择状态
  if (customerMultiSelect) {
    customerMultiSelect.reset();
  }
}

// ****按仓库/人员，重新加载品牌和商品选项****
function reloadBrandAndProductOptions() {
  // 直接使用全局的 salesRecords 数据
  if (!salesRecords || salesRecords.length === 0) {
    return;
  }

  try {
    // === 新增：按仓库筛选数据 ===
    let filteredRecords = [...salesRecords];
    
    //  按仓库类型过滤
    if (currentWarehouse === 'longqiao') {
      // 隆桥仓库：按销售人员过滤
      if (warehouseMultiSelect.selectedValues.length > 0) {
        filteredRecords = filteredRecords.filter(record => 
          warehouseMultiSelect.selectedValues.includes(record.sales)
        );
      }
    } else {
      // 多多仓库：按仓库名称过滤
      if (warehouseMultiSelect.selectedValues.length > 0) {
        filteredRecords = filteredRecords.filter(record => 
          warehouseMultiSelect.selectedValues.includes(record.warehouse)
        );
      }
    }

    // === 处理商品和品牌数据 ===
    const uniqueProducts = new Map();
    brandMap = {}; // 重置品牌映射
    
    filteredRecords.forEach(record => {
      // 仅处理有商品ID的记录
      if (record.product_id) {
        // 存储商品信息
        if (!uniqueProducts.has(record.product_id)) {
          uniqueProducts.set(record.product_id, {
            product_id: record.product_id,
            product_name: record.product_name || '未知商品'
          });
        }
        
        // 存储品牌映射（包含默认值）
        brandMap[record.product_id] = record.brand || '无品牌';
      }
    });
    
    allProductsData = Array.from(uniqueProducts.values());
    allBrands = [...new Set(Object.values(brandMap))].sort();

    // 更新品牌下拉框选项
    brandMultiSelect.setOptions(
      allBrands.map(brand => ({ value: brand, label: brand }))
        .sort((a, b) => a.label.localeCompare(b.label)) // 按A-Z排序
    );
    
    // 更新商品下拉框选项（根据当前品牌选择过滤）
    filterProductsByBrand();
    
    // === 新增：隆桥仓库模式下更新客户选项 ===
    if (currentWarehouse === 'longqiao') {
      // 获取唯一客户列表
      const uniqueCustomers = [...new Set(filteredRecords
        .map(record => record.customer)
        .filter(c => c) // 过滤空值
      )].sort();
      
      // 更新客户下拉框
      customerMultiSelect.setOptions(
        uniqueCustomers.map(customer => ({ 
          value: customer, 
          label: customer 
        })).sort((a, b) => a.label.localeCompare(b.label)) // 按A-Z排序
      );
      if (customerMultiSelect) {   // 重置客户选择状态 
        customerMultiSelect.reset();
      } 
      if (brandMultiSelect) {   // 重置品牌选择状态 
        brandMultiSelect.reset();
      }            
    }
    
  } catch (error) {
    showRoundedAlert(`重新加载品牌和商品选项失败: ${error}`,'error');
  }
}

// 渲染销售退货对比表格
// 修改 renderReturnsTable 函数，在柱状图顶部显示数值
function renderReturnsTable() {
  if (!returnsTable) return;
  
  const tbody = returnsTable.querySelector('tbody');
  const container = returnsTable.closest('.returns-table-container');
  
  // 移除已存在的汇总展示区域（如果存在）
  const existingSummary = container.querySelector('.returns-summary');
  if (existingSummary) existingSummary.remove();
  
  if (!tbody) return;
  tbody.innerHTML = '';
  
  // 获取当前筛选后的销售数据
  const data = getFilteredData();
  
  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 30px; color: #6c757d;">
          <i class="fas fa-database" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
          未找到记录
        </td>
      </tr>
    `;
    return;
  }
  
  // 按产品ID分组数据
  const groupedData = {};
  data.forEach(record => {
    const productId = record.product_id;
    if (!groupedData[productId]) {
      groupedData[productId] = {
        product_id: productId,
        product_name: record.product_name,
        inbounds: 0,
        sales_quantity: 0,
        sorting_difference: 0,
        returns: 0
      };
    }
    
    // 累加数据
    groupedData[productId].inbounds += record.inbounds || 0;
    groupedData[productId].sales_quantity += record.quantity || 0;
    groupedData[productId].returns += record.returns || 0;
    groupedData[productId].sorting_difference += record.difference || 0;
  });

  // 转换为数组并计算差异
  const recordsWithDifference = Object.values(groupedData).map(item => {
    const difference =  item.sales_quantity - item.inbounds + item.returns + item.sorting_difference;
    return {
      ...item,
      difference: difference
    };
  }).filter(item => item.difference !== 0); // 只显示有差异的记录

  // 按差异值绝对值从大到小排序
  recordsWithDifference.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  
  // 计算退货数据和入库数据汇总
  const totalInbounds = Object.values(groupedData).reduce((sum, item) => sum + (item.inbounds || 0), 0);
  const totalReturns = Object.values(groupedData).reduce((sum, item) => sum + (item.returns || 0), 0);
  const totalSales = Object.values(groupedData).reduce((sum, item) => sum + (item.sales_quantity || 0), 0);
  const sorting_difference = Object.values(groupedData).reduce((sum, item) => sum + (item.sorting_difference || 0), 0);
  const totalDifference = totalSales -totalInbounds + totalReturns + sorting_difference;
  
  // 创建汇总展示区域
  const summaryContainer = document.createElement('div');
  summaryContainer.className = 'returns-summary';
  summaryContainer.innerHTML = `
    <div class="summary-chart-container">
      <canvas id="returnsSummaryChart"></canvas>
    </div>
  `;
  
  // 将汇总区域插入到表格上方
  container.insertBefore(summaryContainer, container.firstChild);
  
  // 渲染柱状图
  setTimeout(() => {
    renderReturnsSummaryChart(totalInbounds, totalSales, totalReturns,sorting_difference, totalDifference);
  }, 0);
  
  if (recordsWithDifference.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 30px; color: #6c757d;">
          <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; display: block; color: #28a745;"></i>
          所有记录入库-销售-退货=0，无差异记录
        </td>
      </tr>
    `;
    return;
  }
  
  // 渲染表格
  recordsWithDifference.forEach(item => {
    const row = document.createElement('tr');
    const differenceStyle = item.difference < 0 ? 'style="color: #e53e3e; font-weight: bold;"' : 'style="color: #26cd3c; font-weight: bold;"'
    
    row.innerHTML = `
      <td>${item.product_name || '--'}</td>
      <td>${formatNumber(item.inbounds)}</td>
      <td>${formatNumber(item.sales_quantity)}</td>
      <td>${formatNumber(item.returns+item.sorting_difference)}</td>
      <td ${differenceStyle}>${formatNumber(item.difference)}</td>
    `;
    tbody.appendChild(row);
  });
}

// 修改渲染汇总图表的函数，改进显示效果
function renderReturnsSummaryChart(inbounds, sales, returns, sorting_difference, difference) {
  const ctx = document.getElementById('returnsSummaryChart');
  if (!ctx) return;
  
  // 销毁已存在的图表实例
  if (ctx.chart) {
    ctx.chart.destroy();
  }
  
  // 创建柱状图
  ctx.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['总入库(份)', '总销售(份)', '总退货(份)','分拣差异(份)', '总差异(份)'],
      datasets: [{
        label: '数量',
        data: [inbounds, sales, returns, sorting_difference, Math.abs(difference)], // 使用绝对值
        backgroundColor: [
          'rgba(54, 162, 235, 0.7)',    // 蓝色 - 入库
          'rgba(75, 192, 192, 0.7)',    // 青色 - 销售
          'rgba(255, 99, 132, 0.7)',    // 红色 - 退货
          'rgba(255, 159, 64, 0.7)',    // 橙色 - 分拣差异
          difference < 0 ? 
            'rgba(255, 96, 64, 0.9)' :  // 红色 - 负差异（更亮）
            'rgba(153, 102, 255, 0.9)' ,  // 紫色 - 正差异（更亮）
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(255, 159, 64, 1)',
          difference < 0 ? 
            'rgba(255, 105, 64, 1)' : 
            'rgba(153, 102, 255, 1)',
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: true,
          text: '入库销售退货数据分析',
          color: '#222',
          font: {
            size: window.innerWidth <= 768 ? 16 : 18,
            weight: 'bold'
          },
          padding: {
            top: 10,
            bottom: 20
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              // 在提示框中显示原始值（包括负号）
              const rawValue = context.raw;
              const originalValue = context.dataIndex === 4 ? difference : rawValue;
              return `数量: ${formatNumber(originalValue)}`;
            }
          }
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          formatter: function(value, context) {
            // 对于总差异项，显示绝对值
            if (context.dataIndex === 4) {
              return formatNumber(Math.abs(difference));
            }
            return formatNumber(value);
          },
          font: {
            weight: 'bold',
            size: 14
          },
          color: function(context) {
            // 根据原始值的正负设置标签颜色
            const value = context.dataset.data[context.dataIndex];
            if (context.dataIndex === 4) { // 总差异项
              return difference < 0 ? '#e53e3e' : '#26cd3c'; // 负值红色，正值绿色
            }
            if (context.dataIndex === 3) { // 分拣差异项
              return difference > 0 ? '#e53e3e' : '#26cd3c'; // 负值红色，正值绿色
            }            
            return '#333';
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true, // 确保从 0 开始
          ticks: {
            callback: function(value) {
              return formatNumber(value);
            }
          },
          grid: {
            display: false // 移除Y轴网格线
          }
        },
        x: {
          grid: {
            display: false // 移除X轴网格线
          }
        }
      },
      minBarLength: 2 // 设置最小柱状长度    
    },
    plugins: [ChartDataLabels],
  });
}

// 新增：切换显示模式
async function toggleDisplayMode() {
  if (displayMode === 'chart') {
    // 切换到退货数据
    displayMode = 'returns';
    chartToggleBtn.innerHTML = '<i class="fas fa-chart-pie"></i>';
    
    // 隐藏图表，显示退货表格
    const chartCanvas = document.getElementById('chartContainer');
    if (chartCanvas) {
      chartCanvas.style.display = 'none';
    }
    
    returnsTableContainer.style.display = 'block';
    returnsTableContainer.classList.add('visible');
    
    // 直接使用已加载的数据渲染退货表格
    renderReturnsTable();
  } else {
    // 切换回图表
    displayMode = 'chart';
    chartToggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i>';
    
    // 显示图表，隐藏退货表格
    const chartCanvas = document.getElementById('chartContainer');
    if (chartCanvas) {
      chartCanvas.style.display = 'block';
    }
    
    returnsTableContainer.style.display = 'none';
    returnsTableContainer.classList.remove('visible');
  }
}
// ============== 7. 数据加载与处理 ==============
// ****通用数据获取函数（支持分页）*****
// 修改fetchRecords函数以使用正确的查询参数格式
async function fetchRecords(tableName, fields, conditions = {}) {
  try {
    const batchSize = 50000;
    let allData = [];
    let from = 0;
    let hasMore = true;

    // 构建基础查询
    let baseQuery = {
      select: fields.join(',')
    };

    // 应用查询条件
    Object.entries(conditions).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        baseQuery[key] = `in.(${value.join(',')})`;
      } else if (value !== undefined) {
        if (typeof value === 'object' && value.gte && value.lte) {
          // 范围查询 - 保持对象格式，让 sendRequest 处理
          baseQuery[key] = value;
        } else {
          baseQuery[key] = value;
        }
      }
    });

    // 分批次获取所有数据
    while (hasMore) {
      // 添加范围限制
      const queryWithRange = {
        ...baseQuery,
        offset: from,
        limit: batchSize
      };
      
      const response = await supabaseClient
        .from(tableName)
        .select(queryWithRange);
      
      // 检查响应格式
      if (response.error) throw response.error;
      
      // 确保data存在且为数组
      const data = Array.isArray(response) ? response : (response.data || []);
      
      // 添加当前批次的数据
      if (data.length > 0) {
        allData = [...allData, ...data];
      }
      
      // 检查是否还有更多数据
      hasMore = data.length === batchSize;
      from += batchSize;
    }
    return allData;
  } catch (error) {
    showRoundedAlert(`从 ${tableName} 获取数据失败:${error}`,'error');
    throw error;
  }
}

// 加载筛选选项函数，在加载完成后检查品牌数量并自动应用单品牌逻辑
async function loadFilterOptions() {
  try {
    // 显示悬浮加载动画
    loadingEl.style.display = 'block';
    showLoadingOverlay(); // 添加遮罩层
        
  // 获取当前日期范围
  const selectedDates = flatpickrInstance.selectedDates;
  const startDate = selectedDates[0];
  const endDate = selectedDates[1];
  
  // 格式化为本地日期YYYY-MM-DD，避免UTC时间误差
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // 使用格式化的日期
  startDateStr = formatDate(startDate);
  endDateStr = formatDate(endDate);
    
    // 根据当前仓库选择不同的查询表
    const table = currentWarehouse === 'longqiao' ? 'longqiao_records' : 'sales_records';
    // 设置查询字段（所有）
    const fields = currentWarehouse === 'longqiao'
      ? ['sale_date', 'product_id', 'product_name', 'sales', 'quantity', 'customer', 'amount', 'cost', 'brand']
      : ['sale_date', 'product_id', 'product_name', 'warehouse', 'quantity', 'unit_price', 'brand', 'pieces', 'returns', 'inbounds','difference'];

    // 构建查询条件（只查询当前日期范围内的记录）
    const conditions = {
      sale_date: { gte: startDateStr, lte: endDateStr }
    };
    console.time('加载销售记录时间');
    // 使用通用函数获取数据
    salesRecords = await fetchRecords(table, fields, conditions);
    console.timeEnd('加载销售记录时间');
    // 处理仓库数据
    if (salesRecords.length > 0) {
      const warehouseKey = currentWarehouse === 'longqiao' ? 'sales' : 'warehouse';
      allWarehouses = [...new Set(salesRecords.map(record => record[warehouseKey]))]
        .filter(wh => wh) // 过滤掉空值
        .sort();
    }
    
    // 处理品牌和商品数据
    brandMap = {};
    
    if (salesRecords.length > 0) {
      const uniqueProducts = new Map();
    
      salesRecords.forEach(record => {
        if (record.product_id && !uniqueProducts.has(record.product_id)) {
          uniqueProducts.set(record.product_id, {
            product_id: record.product_id,
            product_name: record.product_name
          });
        }
        
        if (record.product_id && record.brand) {
          brandMap[record.product_id] = record.brand;
        }
      });
      
      allProductsData = Array.from(uniqueProducts.values());
      allBrands = [...new Set(salesRecords.map(record => record.brand))]
        .filter(b => b) // 过滤掉空值
        .sort();
    }

    // 处理客户数据（仅隆桥仓库）
    if (currentWarehouse === 'longqiao' && salesRecords.length > 0) {
      allCustomers = [...new Set(salesRecords.map(record => record.customer))]
        .filter(c => c) // 过滤掉空值
        .sort();
    }
 
    // 初始化多选下拉框实例
    warehouseMultiSelect = new MultiSelect(warehouseSelector, warehouseOptions, 
      currentWarehouse === 'longqiao' ? '销售人员' : '仓库');
    brandMultiSelect = new MultiSelect(brandSelector, brandOptions, '品牌');
    productMultiSelect = new MultiSelect(productSelector, productOptions, '商品');
  
    // 客户下拉框初始化（无论是否有数据都初始化）
    customerMultiSelect = new MultiSelect(customerSelector, customerOptions, '客户');
    customerMultiSelect.setOptions(
      allCustomers.map(c => ({ value: c, label: c }))
        .sort((a, b) => a.label.localeCompare(b.label)) // 按A-Z排序      
    );

    // 设置下拉框选项
    warehouseMultiSelect.setOptions(
      allWarehouses.map(wh => ({ value: wh, label: wh }))
        .sort((a, b) => a.label.localeCompare(b.label)) // 按A-Z排序
    );
    
    brandMultiSelect.setOptions(
      allBrands.map(brand => ({ value: brand, label: brand }))
        .sort((a, b) => a.label.localeCompare(b.label)) // 按A-Z排序
    );
    
    // 初始商品选项
    productMultiSelect.setOptions(
      allProductsData.map(p => ({ value: p.product_id, label: p.product_name }))
        .sort((a, b) => a.label.localeCompare(b.label)) // 按A-Z排序
    );
    
    // 新增：检查是否只有一个品牌，如果是则自动应用单品牌逻辑
    if (currentWarehouse === 'longqiao' && allBrands.length === 1) {
      // 自动触发单品牌逻辑
      setTimeout(() => {
        loadData();
      }, 0);
    }
        
    return Promise.resolve();
  } catch (error) {
    showRoundedAlert(`筛选选项加载失败: ${ error.message}`, 'error');
    return Promise.reject(error);
  } finally {
    // 隐藏加载动画
    loadingEl.style.display = 'none';
    hideLoadingOverlay(); // 移除遮罩层
  } 
}

// 加载数据
function loadData() {
  // +++ 新增：收起详细记录区域 +++
  if (detailSection.classList.contains('visible')) {
    detailSection.classList.remove('visible');
    // 更新图标方向
    const icon = document.querySelector('#toggleDetails i');
    icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
  }

  // 清除表格和饼图内容
  summaryTable.innerHTML = '';
  detailTable.innerHTML = '';
  clearPieChart(); 

  try { 

    // 直接使用全局 salesRecords 数据
    let data = salesRecords; 
    // 仓库/销售人员过滤
    if (currentWarehouse === 'longqiao') {
      if (warehouseMultiSelect.selectedValues.length > 0) {
        data = data.filter(record => 
          warehouseMultiSelect.selectedValues.includes(record.sales)
        );
      }
    } else {
      if (warehouseMultiSelect.selectedValues.length > 0) {
        data = data.filter(record => 
          warehouseMultiSelect.selectedValues.includes(record.warehouse)
        );
      }
    }
    
    // 品牌过滤
    if (brandMultiSelect.selectedValues.length > 0) {
      data = data.filter(record => 
        brandMultiSelect.selectedValues.includes(record.brand)
      );
    }
    
    // 商品过滤
    if (productMultiSelect.selectedValues.length > 0) {
      data = data.filter(record => 
        productMultiSelect.selectedValues.includes(record.product_id)
      );
    }
    
    // 客户过滤（仅隆桥仓库）
    if (currentWarehouse === 'longqiao' && 
        customerMultiSelect && 
        customerMultiSelect.selectedValues.length > 0) {
      data = data.filter(record => 
        customerMultiSelect.selectedValues.includes(record.customer)
      );
    }

    calculateSummary(data);
    // 更新详细记录条数但不渲染表格
    renderDetailTable(data, false);    
    
    // 新增：如果当前显示的是退货对比表格，则更新表格内容
    if (displayMode === 'returns') {
      renderReturnsTable();
    }
  } catch (error) {
    console.error('查询错误详情:', error);
    loadingEl.innerHTML = `
      <div style="text-align: center; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="color: #e53e3e; font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">数据加载失败</p>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// 渲染详细表格
function renderDetailTable(data, shouldRender = false) {
  // 获取显示数据条数的元素
  const detailCountEl = document.getElementById('detailCount');
  
  // 始终更新数据条数显示，无论是否渲染表格
  if (!data || data.length === 0) {
    detailCountEl.textContent = '(0条数据)';
  } else {
    detailCountEl.textContent = `(${data.length}条)`;
  }
  
  // 如果不需要渲染，直接返回
  if (!shouldRender) {
    return;
  }
  
  // 使用 setTimeout 将渲染操作放到下一个事件循环中，确保加载动画能够显示
  setTimeout(() => {
    try {
      const tbody = detailTable;
      tbody.innerHTML = '';

      // 修改点：按时间从大到小排序
      if (data && data.length > 0) {
        data.sort((a, b) => {
          return new Date(b.sale_date) - new Date(a.sale_date);
        });
      }

      if (!data || data.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="${currentWarehouse === 'longqiao' ? 9 : 8}" style="text-align: center; padding: 30px; color: #6c757d;">
              <i class="fas fa-database" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
              未找到匹配的记录
            </td>
          </tr>
        `;
        return;
      }

      data.forEach(record => {
        const row = document.createElement('tr');
        let amount, warehouseField, cost;
        
        if (currentWarehouse === 'longqiao') {
          amount = record.amount || 0;
          warehouseField = record.sales || '--';
          cost = record.cost || 0;
        } else {
          amount = (record.quantity || 0) * (record.unit_price || 0);
          warehouseField = record.warehouse || '--';
          cost = record.unit_price || 0;
        }
        
        // 基础行
        row.innerHTML = `
          <td>${record.sale_date || '--'}</td>
          <td>${ //第二列显示商品ID或客户名称
            currentWarehouse === 'longqiao' 
              ? (record.customer || '--')  // 隆桥仓库显示客户名称
              : (record.product_id || '--') // 其他仓库显示商品ID
          }</td>
          <td>${record.product_name || '--'}</td>
          <td>${record.brand || '--'}</td>
          <td>${warehouseField}</td>
          <td>${formatNumber(record.quantity || 0)}</td>
          <td>${cost}</td>
          <td>¥${formatNumber(amount)}</td>
        `;
        
        // 隆桥仓库显示利润列
        if (currentWarehouse === 'longqiao') {
          const profit = (record.amount || 0) - (record.cost || 0);
          const profitStyle = profit < 0 ? 'style="color: #e53e3e; font-weight: bold;"' : '';
          row.innerHTML += `<td ${profitStyle}>¥${formatNumber(profit)}</td>`;
        }
        
        tbody.appendChild(row);
      });
    } catch (error) {
      console.error('渲染详细表格时出错:', error);
      detailTable.innerHTML = `
        <tr>
          <td colspan="${currentWarehouse === 'longqiao' ? 9 : 8}" style="text-align: center; padding: 30px; color: #e53e3e;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
            <p>渲染表格时发生错误</p>
          </td>
        </tr>
      `;
    }
  }, 0);
}

// 获取当前筛选后的数据
function getFilteredData() {
  // 重新获取当前筛选后的数据
  let data = salesRecords;
  
  // 应用相同的筛选逻辑
  if (currentWarehouse === 'longqiao') {
    if (warehouseMultiSelect.selectedValues.length > 0) {
      data = data.filter(record => 
        warehouseMultiSelect.selectedValues.includes(record.sales)
      );
    }
  } else {
    if (warehouseMultiSelect.selectedValues.length > 0) {
      data = data.filter(record => 
        warehouseMultiSelect.selectedValues.includes(record.warehouse)
      );
    }
  }
  
  if (brandMultiSelect.selectedValues.length > 0) {
    data = data.filter(record => 
      brandMultiSelect.selectedValues.includes(record.brand)
    );
  }
  
  if (productMultiSelect.selectedValues.length > 0) {
    data = data.filter(record => 
      productMultiSelect.selectedValues.includes(record.product_id)
    );
  }
  
  if (currentWarehouse === 'longqiao' && 
      customerMultiSelect && 
      customerMultiSelect.selectedValues.length > 0) {
    data = data.filter(record => 
      customerMultiSelect.selectedValues.includes(record.customer)
    );
  }
  
  return data;
}

// 显示详细记录表格
function showDetailTable() {
  // 显示悬浮加载动画
  if (loadingEl) {
    loadingEl.style.display = 'block';
    showLoadingOverlay(); // 添加遮罩层
  }

  // 只有当详细记录区域可见时才渲染表格
  if (detailSection.classList.contains('visible')) {
    // 获取筛选后的数据
    const data = getFilteredData();
    
    // 渲染表格
    renderDetailTable(data, true);
    
    // 在渲染完成后隐藏加载动画
    setTimeout(() => {
      if (loadingEl) {
        loadingEl.style.display = 'none';
        hideLoadingOverlay(); // 移除遮罩层
      }
    }, 300);
  } else {
    // 如果详细记录区域不显示，直接隐藏加载动画
    if (loadingEl) {
      loadingEl.style.display = 'none';
      hideLoadingOverlay(); // 移除遮罩层
    }
  }
}

// 修改 calculateSummary 函数中的汇总逻辑
function calculateSummary(data) {
  const summaryTableEl = document.getElementById('summaryTable');
  let thead = summaryTableEl.querySelector('thead');
  if (!thead) {
    thead = document.createElement('thead');
    summaryTableEl.insertBefore(thead, summaryTableEl.firstChild);
  }

  // 根据仓库类型设置表头
  let headerHTML = `<tr><th>品牌</th><th>总件数</th><th>总金额</th>`;
  if (currentWarehouse === 'longqiao') {
      headerHTML += `<th>总毛利</th><th>费用发放</th>`;
  }
  headerHTML += `</tr>`;
  thead.innerHTML = headerHTML;

  let tbody = summaryTableEl.querySelector('tbody');
  if (!tbody) {
      tbody = document.createElement('tbody');
      summaryTableEl.appendChild(tbody);
  }

  if (!data || data.length === 0) {
    totalQuantityEl.textContent = '0';
    totalAmountEl.textContent = '¥0.00';
    totalProductsEl.textContent = '0';
    totalBrandsEl.textContent = '0';
    
    // 隆桥仓库显示利润
    if (currentWarehouse === 'longqiao') {
      totalProfitEl.textContent = '¥0.00';
    }
    // 根据仓库类型决定列数
    const colCount = currentWarehouse === 'longqiao' ? 5 : 3;    
    tbody.innerHTML = `
      <tr>
          <td colspan="${colCount}" style="text-align: center; padding: 30px; color: #6c757d;">
          <i class="fas fa-chart-bar" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
          无汇总数据
        </td>
      </tr>
    `;
    return;
  }

  // 初始化统计变量
  let totalQuantity = 0; // 总销量
  let totalAmount = 0; // 总金额
  let totalProfit = 0; // 总利润
  let freeIssueAmount = 0;  // 费用发放
  const uniqueBrands = new Set(); //品牌统计
  const uniqueProducts = new Set(); //商品统计
  const summaryMap = new Map(); // 汇总数据

  // 单次遍历完成所有统计
  data.forEach(record => {
    // 统计商品和品牌
    if (record.product_id) uniqueProducts.add(record.product_id);
    if (record.brand) uniqueBrands.add(record.brand);

    // 计算金额和数量
    let amount, cost;
    if (currentWarehouse === 'longqiao') {
      amount = record.amount || 0;
      cost = record.cost || 0;
      
      // 费用发放记录（销售额为0）
      if (amount === 0) {
        freeIssueAmount += cost;
      } else { // 正常销售记录
        const quantity = record.quantity || 0;
        totalQuantity += quantity;
        totalAmount += amount;
        totalProfit += amount - cost;
      }
    } else { // 多多仓库
      const pieces = record.pieces || 0; // 使用pieces字段
      const quantity = record.quantity || 0;
      const unitPrice = record.unit_price || 0;
      amount = quantity * unitPrice;
      totalQuantity += pieces; // 累加pieces而非quantity
      totalAmount += amount;
      cost = unitPrice;
    }

    // 按品牌汇总（只处理正常销售记录）
    if (currentWarehouse !== 'longqiao' || amount !== 0) {
      const brand = record.brand || '未知品牌';
      
      if (!summaryMap.has(brand)) {
        summaryMap.set(brand, {
          brand: brand,
          total_quantity: 0,
          total_amount: 0,
          total_cost: 0,
          profit: 0,
          free_issue: 0  // 新增：记录该品牌的费用发放金额
        });
      }
      // 更新汇总数据
      const summary = summaryMap.get(brand); 
      if (currentWarehouse === 'longqiao') {
        summary.total_quantity += record.quantity || 0;
        summary.total_amount += amount;
        summary.total_cost += cost;
        summary.profit += amount - cost;
      } else {
        summary.total_quantity += record.pieces || 0; // 使用pieces字段
        summary.total_amount += amount;
      }
    }

    // 按品牌汇总费用发放记录（amount=0）
    if (currentWarehouse === 'longqiao' && amount === 0) {
      const brand = record.brand || '未知品牌';
      
      if (!summaryMap.has(brand)) {
        summaryMap.set(brand, {
          brand: brand,
          total_quantity: 0,
          total_amount: 0,
          total_cost: 0,
          profit: 0,
          free_issue: 0
        });
      }  
      const summary = summaryMap.get(brand);
      summary.free_issue += cost;  // 累加费用发放
    }
  });

  // 检查是否为隆桥仓库且只有一个品牌
  const isSingleBrandInLongqiao = currentWarehouse === 'longqiao' && 
    (uniqueBrands.size === 1 || allBrands.length === 1);
  const singleBrandName = uniqueBrands.size === 1 ? 
    Array.from(uniqueBrands)[0] : 
    (allBrands.length === 1 ? allBrands[0] : null);

  // 如果是隆桥仓库且只有一个品牌，则按销售人员汇总
  if (isSingleBrandInLongqiao && singleBrandName) {
    // 重新构建按销售人员的汇总数据
    const salesSummaryMap = new Map();
    
    // 初始化统计变量（用于卡片显示）
    let salesTotalQuantity = 0;
    let salesTotalAmount = 0;
    let salesTotalProfit = 0;
    let salesFreeIssueAmount = 0;
    const salesUniqueProducts = new Set(); // 按销售人员统计的商品种类
    
    data.forEach(record => {
      // 只处理与该品牌相关的记录
      if (record.brand === singleBrandName) {
        // 统计商品种类
        if (record.product_id) salesUniqueProducts.add(record.product_id);
        
        let amount, cost;
        if (currentWarehouse === 'longqiao') {
          amount = record.amount || 0;
          cost = record.cost || 0;
          
          const sales = record.sales || '未知销售人员';
          
          if (!salesSummaryMap.has(sales)) {
            salesSummaryMap.set(sales, {
              sales: sales,
              total_quantity: 0,
              total_amount: 0,
              total_cost: 0,
              profit: 0,
              free_issue: 0
            });
          }
          
          const summary = salesSummaryMap.get(sales);
          
          if (amount === 0) {
            // 费用发放记录
            summary.free_issue += cost;
            salesFreeIssueAmount += cost;
          } else {
            // 正常销售记录
            const quantity = record.quantity || 0;
            summary.total_quantity += quantity;
            summary.total_amount += amount;
            summary.profit += amount - cost;
            
            salesTotalQuantity += quantity;
            salesTotalAmount += amount;
            salesTotalProfit += amount - cost;
          }
        }
      }
    });
    
    // 更新统计卡片（按销售人员数据）
    totalQuantityEl.textContent = formatNumber(salesTotalQuantity);
    totalAmountEl.textContent = `¥${formatNumber(salesTotalAmount)}`;
    totalProfitEl.textContent = `¥${formatNumber(salesTotalProfit)}`;
    totalBrandsEl.textContent = `¥${formatNumber(salesFreeIssueAmount)}`;
    totalBrandsEl.style.color = '#e53e3e';
    totalProductsEl.textContent = formatNumber(salesUniqueProducts.size); // 更新商品种类数
    
    const statLabels = document.querySelectorAll('.stat-card .stat-label');
    statLabels[3].textContent = '费用发放';
    salesTotalProfit <= 0 ? totalProfitEl.style.color = '#e53e3e' : totalProfitEl.style.color = '#4361ee';
    
    // 更新表头为销售人员
    thead.innerHTML = `<tr><th>销售人员</th><th>总件数</th><th>总金额</th><th>总毛利</th><th>费用发放</th></tr>`;
    
    // 按销售额从大到小排序
    const sortedSummaries = Array.from(salesSummaryMap.values()).sort((a, b) => 
      b.total_amount - a.total_amount
    );
    
    // 渲染汇总表格
    tbody.innerHTML = ''; // 清空 tbody 而不是整个表格 
    
    sortedSummaries.forEach(summary => {
      const row = document.createElement('tr');
      const profitStyle = summary.profit < 0 
          ? 'style="color: #e53e3e; font-weight: bold;"' 
          : '';
      
      row.innerHTML = `
          <td>${summary.sales}</td>
          <td>${formatNumber(summary.total_quantity)}</td>
          <td>¥${formatNumber(summary.total_amount)}</td>
          <td ${profitStyle}>¥${formatNumber(summary.profit)}</td> 
          <td>¥${formatNumber(summary.free_issue)}</td> 
      `;
      tbody.appendChild(row);
    });
    
    // 渲染饼图（按销售人员）
    if (sortedSummaries.length > 0) {
      renderSalesPieChart(sortedSummaries);
    } else {
      clearPieChart();
    }
  } else {
    // 原有逻辑：按品牌汇总
    
    // 更新统计卡片
    totalQuantityEl.textContent = formatNumber(totalQuantity);
    totalAmountEl.textContent = `¥${formatNumber(totalAmount)}`;
    
    const statLabels = document.querySelectorAll('.stat-card .stat-label');
    if (currentWarehouse === 'longqiao') {
      totalBrandsEl.textContent = `¥${formatNumber(freeIssueAmount)}`;
      totalBrandsEl.style.color = '#e53e3e';
      statLabels[3].textContent = '费用发放';
      totalProfit <= 0 ? totalProfitEl.style.color = '#e53e3e' : '#4361ee';
      totalProfitEl.textContent = `¥${formatNumber(totalProfit)}`;
    } else {
      totalBrandsEl.textContent = formatNumber(uniqueBrands.size);
      totalBrandsEl.style.color = '';
      statLabels[3].textContent = '品牌数量';
    }
    
    totalProductsEl.textContent = formatNumber(uniqueProducts.size);
    
    // 按销售额从大到小排序
    const sortedSummaries = Array.from(summaryMap.values()).sort((a, b) => 
      b.total_amount - a.total_amount
    );
    
    // 渲染汇总表格
    tbody.innerHTML = ''; // 清空 tbody 而不是整个表格 
    
    sortedSummaries.forEach(summary => {
      const row = document.createElement('tr');
      let rowHTML = `
          <td>${summary.brand}</td>
          <td>${formatNumber(summary.total_quantity)}</td>
          <td>¥${formatNumber(summary.total_amount)}</td>
      `;
      
      if (currentWarehouse === 'longqiao') {
          const profitStyle = summary.profit < 0 
              ? 'style="color: #e53e3e; font-weight: bold;"' 
              : '';
          
          rowHTML += `
              <td ${profitStyle}>¥${formatNumber(summary.profit)}</td> 
              <td>¥${formatNumber(summary.free_issue)}</td> 
          `;
      }
      
      row.innerHTML = rowHTML;
      tbody.appendChild(row);
    });
    
    // 渲染饼图
    if (data && data.length > 0) {
      renderBrandPieChart(sortedSummaries);
    } else {
      clearPieChart(); // 新增：清空饼图
    }
  }

  setTimeout(() => {
    syncContainersDimensions();
  }, 0);  
}

// 新增：按销售人员渲染饼图的函数
function renderSalesPieChart(salesSummaries) {
  const chartContainer = document.getElementById('chartContainer');
  
  // 清空容器
  chartContainer.innerHTML = salesSummaries.length > 0 
    ? '<canvas id="brandChart"></canvas>' 
    : '<div class="no-chart-data"><br><br>无销售人员数据可展示</div>';

  //根据仓库类型隐藏切换按钮
  chartToggleBtn.style.display = currentWarehouse === 'default' ? 'flex' : 'none'; 

  if (salesSummaries.length === 0) return;
  
  const ctx = document.getElementById('brandChart').getContext('2d');
  if (!ctx) {
    return;
  }
  
  // 饼图颜色生成器 
  const generateColors = (count) => {
    const baseColors = [
      '#4BC0C0', // 青色
      '#f54444ff', // 红色
      '#36A2EB', // 蓝色
      '#F15BB5',  // 粉红        
      '#FFCE56', // 黄色
      '#26cd3cff', // 绿色
      '#9966FF', // 紫色
      '#FF9F40', // 橙色
      '#1982C4', // 深蓝
      '#6A4C93' // 深紫
    ];
    
    // 当销售人员数量超过基础颜色时，生成随机颜色
    if (count > baseColors.length) {
      for (let i = baseColors.length; i < count; i++) {
        baseColors.push(`#${Math.floor(Math.random()*16777215).toString(16)}`);
      }
    }
    
    return baseColors.slice(0, count);
  };
  
  // 创建饼图
  const chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: salesSummaries.map(item => item.sales),
      datasets: [{
        data: salesSummaries.map(item => item.total_amount),
        backgroundColor: generateColors(salesSummaries.length),
        borderWidth: 1,
        borderColor: '#fff',
        hoverOffset: 15,
        radius: '92%' // 设置饼图大小为95%
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { 
              size: window.innerWidth <= 768 ? 10 : 14,
              weight: 'bold'
            },
            padding: window.innerWidth <= 768 ? 9 : 20,
            usePointStyle: true,
            color: '#333'
          }
        },
        title: {
          display: true,
          text: '销售人员销售金额占比',
          font: {
            size: window.innerWidth <= 768 ? 16 : 18,
            weight: 'bold'
          },
          color: '#222',
          padding: {
            top: 20,
            bottom: 10
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: {
            size: 13,
            weight: 'bold'
          },
          bodyFont: {
            size: window.innerWidth <= 768 ? 10 : 12
          },
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = context.chart.getDatasetMeta(0).total;
              const percentage = Math.round((value / total) * 100);
              return `${label}: ¥${formatNumber(value)} (${percentage}%)`;
            }
          }
        },
        datalabels: {
          display: true,
          formatter: (value, ctx) => {
            const total = ctx.chart.getDatasetMeta(0).total;
            const percentage = Math.round((value / total) * 100);
            const label = ctx.chart.data.labels[ctx.dataIndex];
            
            if (percentage < 5) return null;
            
            return `${label}\n${percentage}%`;
          },
          color: '#222',
          font: {
            weight: 'bold',
            size: window.innerWidth <= 768 ? 8 : 12
          },
          align: 'end',
          anchor: 'center',
          offset: 0,
          clip: false,
          textAlign: 'center',
          padding: 2
        }
      },
      animation: {
        animateRotate: true,
        animateScale: true
      }
    },
    plugins: [ChartDataLabels]
  });

  // 存储图表实例以便后续调整
  chartContainer.chartInstance = chart;
}

// 同步容器尺寸函数
function syncContainersDimensions() {
  const returnsTableContainer = document.getElementById('returnsTableContainer');
  const tableContainer = document.querySelector('.summary-table-container');
  const chartContainer = document.querySelector('.chart-container');
  
  if (tableContainer && chartContainer) {
    // 获取左侧表格的实际高度
    const tableHeight = tableContainer.offsetHeight;
    
    // 设置右侧图表容器高度
    chartContainer.style.height = `${tableHeight}px`;

    // 设置退货表格容器高度
    if (returnsTableContainer) {
      returnsTableContainer.style.height = `${tableHeight}px`;
    }

    // 如果图表已渲染，重新调整大小
    if (chartContainer.chartInstance) {
      chartContainer.chartInstance.resize();
    }
  }
}

// ======= 新增: 饼图渲染函数 =======
function renderBrandPieChart(brandSummaries) {
  const chartContainer = document.getElementById('chartContainer');
  
  // 清空容器
  chartContainer.innerHTML = brandSummaries.length > 0 
    ? '<canvas id="brandChart"></canvas>' 
    : '<div class="no-chart-data"><br><br>无品牌数据可展示</div>';

  //根据仓库类型隐藏切换按钮
  chartToggleBtn.style.display = currentWarehouse === 'default' ? 'flex' : 'none'; 
  if (brandSummaries.length === 0) return;
  
  const ctx = document.getElementById('brandChart').getContext('2d');
  if (!ctx) {
    return;
  }
  
  // 饼图颜色生成器 
  const generateColors = (count) => {
    if (currentWarehouse === 'longqiao') {
       baseColors = [
        '#4BC0C0', // 青色
        '#f54444ff', // 红色
        '#36A2EB', // 蓝色
        '#F15BB5',  // 粉红        
        '#FFCE56', // 黄色
        '#26cd3cff', // 绿色
        '#9966FF', // 紫色
        '#FF9F40', // 橙色
        '#1982C4', // 深蓝
        '#6A4C93' // 深紫
      ];      
    }else {
       baseColors = [
        '#26cd3cff', // 绿色
        '#FFCE56', // 黄色
        '#f54444ff', // 红色
        '#36A2EB', // 蓝色
        '#F15BB5',  // 粉红      
        '#9966FF', // 紫色
        '#FF9F40', // 橙色
        '#6A4C93', // 深紫
        '#4BC0C0', // 青色
        '#1982C4' // 深蓝
      ];
    }
    // 当品牌数量超过基础颜色时，生成随机颜色
    if (count > baseColors.length) {
      for (let i = baseColors.length; i < count; i++) {
        baseColors.push(`#${Math.floor(Math.random()*16777215).toString(16)}`);
      }
    }
    
    return baseColors.slice(0, count);
  };
  
  // 创建饼图
  const chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: brandSummaries.map(item => item.brand),
      datasets: [{
        data: brandSummaries.map(item => item.total_amount),
        backgroundColor: generateColors(brandSummaries.length),
        borderWidth: 1,
        borderColor: '#fff',
        hoverOffset: 15,
        radius: '92%' // 设置饼图大小为95%
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { 
              size: window.innerWidth <= 768 ? 10 : 14,
              weight: 'bold'
            },
            padding: window.innerWidth <= 768 ? 9 : 20,
            usePointStyle: true,
            color: '#333'
          }
        },
        title: {
          display: true,
          text: '品牌销售金额占比',
          font: {
            size: window.innerWidth <= 768 ? 16 : 18,
            weight: 'bold'
          },
          color: '#222',
          padding: {
            top: 20,
            bottom: 10
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: {
            size: 13,
            weight: 'bold'
          },
          bodyFont: {
            size: window.innerWidth <= 768 ? 10 : 12
          },
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = context.chart.getDatasetMeta(0).total;
              const percentage = Math.round((value / total) * 100);
              return `${label}: ¥${formatNumber(value)} (${percentage}%)`;
            }
          }
        },
        datalabels: {
          display: true,
          formatter: (value, ctx) => {
            const total = ctx.chart.getDatasetMeta(0).total;
            const percentage = Math.round((value / total) * 100);
            const label = ctx.chart.data.labels[ctx.dataIndex];
            
            if (percentage < 5) return null;
            
            return `${label}\n${percentage}%`;
          },
          color: '#222',
          font: {
            weight: 'bold',
            size: window.innerWidth <= 768 ? 8 : 12
          },
          align: 'end',
          anchor: 'center',
          offset: 0,
          clip: false,
          textAlign: 'center',
          padding: 2
        }
      },
      animation: {
        animateRotate: true,
        animateScale: true
      }
    },
    plugins: [ChartDataLabels]
  });

  // 存储图表实例以便后续调整
  chartContainer.chartInstance = chart;
}

// ============== 8. 其他功能 ==============

// ***清除饼图函数 ***
function clearPieChart() {
  const chartContainer = document.getElementById('chartContainer');
  chartContainer.innerHTML = '<div class="no-chart-data"><br><br>无品牌数据可展示</div>';
  
  //根据仓库类型隐藏切换按钮
  chartToggleBtn.style.display = currentWarehouse === 'default' ? 'flex' : 'none'; 
  
  // 清除图表实例引用
  if (chartContainer.chartInstance) {
    chartContainer.chartInstance.destroy();
    chartContainer.chartInstance = null;
  }
}

// ****【清除筛选】按扭函数****
function clearFilters() {
  // 使用reset方法重置选择状态（避免重新初始化）
  warehouseMultiSelect.reset();
  brandMultiSelect.reset();
  productMultiSelect.reset();
  if (customerMultiSelect) { // 重置客户下拉框
    customerMultiSelect.reset();
  }
  
  // 重置商品列表
  filterProductsByBrand();

  // 清除饼图数据
  clearPieChart();  
  
  // 重新设置默认日期
  setDefaultDates();

  // 饼图切换显示模式
  displayMode = 'returns';
  toggleDisplayMode();
  
  loadFilterOptions().then(() => {
      loadData();
    })
}

// 切换详细记录显示
function toggleDetailSection() {
  detailSection.classList.toggle('visible');
  
  // 更新图标方向
  const icon = document.querySelector('#toggleDetails i');
  if (detailSection.classList.contains('visible')) {
    icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
    // +++ 新增：显示时渲染表格 +++
    showDetailTable();
  } else {
    icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    // 隐藏时清除表格内容
    if (detailTable) {
      detailTable.innerHTML = '';
    }
  }
}

// **** 新增遮罩层函数 ****
function showLoadingOverlay() {
  // 创建或获取遮罩层
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(255, 255, 255, 0.2);
      z-index: 999;
      display: flex;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(2px);
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
  }
}

// **** 移除遮罩层函数 ****
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// **** 添加动态加载xlsx的函数 ****
async function loadXlsxLibrary() { 
  try {
    // 动态创建script标签加载xlsx库
    const script = document.createElement('script');
    script.src = 'https://cdn.bootcdn.net/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    
    // 返回一个Promise，在脚本加载完成后resolve
    return new Promise((resolve, reject) => {
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => reject(new Error('XLSX库加载失败'));
      document.head.appendChild(script);
    });
  } catch (error) {
    showRoundedAlert(`数据导出错误：${error}`, 'error');
    return null;
  }
}

// **** 导出为Excel功能 ****
async function exportToExcel() {
  // 检测是否为微信浏览器
  const isWechat = /MicroMessenger/i.test(navigator.userAgent);  
  if (isWechat) {
    showRoundedAlert(`微信浏览器不支持此功能，请在浏览器中打开网页导出数据。`, 'warning');
    return;
  }

  // 确保xlsx库已加载
  if (typeof XLSX === 'undefined') {
    try {
      loadingEl.style.display = 'block';
      showLoadingOverlay();
      await loadXlsxLibrary();
      if (!window.XLSX) {
        throw new Error('XLSX库加载失败');
      }
    } catch (error) {
      showRoundedAlert('导出功能暂时不可用。');
      return;
    }
  }  
  try {
    // 获取当前筛选后的数据
    const data = getFilteredData();
    
    if (!data || data.length === 0) {
      showRoundedAlert('没有数据可导出', 'warning');
      return;
    }
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 准备导出的数据
    const exportData = data.map(record => {
      let amount, warehouseField, cost;
      
      if (currentWarehouse === 'longqiao') {
        amount = record.amount || 0;
        warehouseField = record.sales || '--';
        cost = record.cost || 0;
      } else {
        amount = (record.quantity || 0) * (record.unit_price || 0);
        warehouseField = record.warehouse || '--';
        cost = record.unit_price || 0;
      }
      
      // 基础行数据
      const row = {
        '日期': record.sale_date || '--',
      };
      
      // 根据仓库类型添加不同的列
      if (currentWarehouse === 'longqiao') {
        row['客户名称'] = record.customer || '--';
      } else {
        row['商品ID'] = record.product_id || '--';
      }
      
      row['商品名称'] = record.product_name || '--';
      row['品牌'] = record.brand || '--';
      
      if (currentWarehouse === 'longqiao') {
        row['销售人员'] = warehouseField;
      } else {
        row['仓库'] = warehouseField;
      }
      
      row['销量'] = record.quantity || 0;
      
      if (currentWarehouse === 'longqiao') {
        row['成本'] = cost;
      } else {
        row['单价'] = cost;
      }
      
      row['金额'] = amount;
      
      // 隆桥仓库添加利润列
      if (currentWarehouse === 'longqiao') {
        const profit = (record.amount || 0) - (record.cost || 0);
        row['毛利'] = profit;
      }
      
      return row;
    });
    
    // 创建工作表
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, "销售记录");
    
    // 生成文件名
    const warehouseName = currentWarehouse === 'longqiao' ? '隆桥仓库' : '多多买菜';
    const fileName = `${warehouseName}_销售记录_${startDateStr}_${endDateStr}.xlsx`;
    loadingEl.style.display = 'none';
    hideLoadingOverlay();
    // 导出文件
    XLSX.writeFile(wb, fileName);
    showRoundedAlert('数据导出成功', 'success');
  } catch (error) {
    showRoundedAlert(`导出失败: ${ error.message}`, 'error');
  }
}

// 屏幕响应式处理函数
function handleResponsiveLayout() {
  const totalProductsCard = document.getElementById('totalProducts').closest('.stat-card');
  if (currentWarehouse === 'longqiao' && window.innerWidth < 800) {
    // 隆桥仓库模式且屏幕宽度小于800px时隐藏商品种类卡片
    totalProductsCard.style.display = 'none';
  } else if (currentWarehouse === 'longqiao') {
    // 隆桥仓库模式但屏幕宽度大于等于768px时显示商品种类卡片
    totalProductsCard.style.display = 'block';
  }
}

// ============== 9. 页面初始化 ==============
document.addEventListener('DOMContentLoaded', async () => {

  // 初始化认证状态
  const isAuthenticated = await initAuth();
  // 添加切换仓库按钮事件监听
  document.getElementById('switchWarehouseBtn').addEventListener('click', switchWarehouse);
  // 在页面加载完成后添加窗口大小变化监听器
  window.addEventListener('resize', handleResponsiveLayout);  
  // 无论是否已登录，都要设置用户菜单事件监听器
  setupUserMenuEventListeners();

  // 如果用户已登录，初始化应用
  if (isAuthenticated) {
    initializeApp();
    return; // 关键优化点：直接返回避免后续认证逻辑
  }

  // 认证标签切换
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      
      authTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      loginForm.classList.remove('active');
      registerForm.classList.remove('active');
      
      if (tabId === 'login') {
        loginForm.classList.add('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
      } else {
        registerForm.classList.add('active');
        registerForm.style.display = 'block';
        loginForm.style.display = 'none';
      }
    });
  });
  
  // 登录功能
  loginBtn.addEventListener('click', async () => {
    const email = loginEmail.value;
    const password = loginPassword.value;
    
    if (!email || !password) {
      showRoundedAlert('请输入邮箱和密码', 'warning');
      return;
    }
    
    try {
      const response = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      
      if (!response || !response.access_token) {
        showRoundedAlert(`登录失败: 请检查用户名或密码是否正确！`, 'error');
        return;
      }
     
      user = response.user;
      showRoundedAlert('登录成功！', 'success');
      // 显示用户状态 - 根据邮箱前缀映射到用户名
      const emailPrefix = user.email.split('@')[0]; // 获取邮箱前缀
      const usernameMap = {
        '162004332': '系统管理员',
        'rickyone': '数据管理员',
        '13762405681': '王英',
        'ksf2025': '康师傅',
        'pepsi_cola': '百事可乐',
        'coca_cola': '可口可乐',
        '15096086678': '娟子'
      };
    
      // 如果邮箱前缀在映射表中，则使用映射的用户名，否则使用邮箱前缀
      const displayName = usernameMap[emailPrefix] || emailPrefix;
      userName.textContent = displayName;
      
      userStatus.style.display = 'block';
      authContainer.style.display = 'none';
      appContainer.style.display = 'block';
      showRoundedAlert(`欢迎 ${displayName}！`, 'success');
      
      // 登录成功后初始化应用
      initializeApp();
    } catch (err) {
      console.error('Login error:', err);
      showRoundedAlert(`登录过程中发生错误: ${err.message}`, 'error');
    }
  });

  // 添加回车键登录支持
  if (loginPassword) {
    loginPassword.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        loginBtn.click();
      }
    });
  }

  // 注册功能  
  registerBtn.addEventListener('click', async () => {
    const email = registerEmail.value;
    const password = registerPassword.value;
    const phone = registerPhone.value;

    if (!email || !password) {
      showRoundedAlert('请输入邮箱和密码', 'warning');
      return;
    }

    const signUpOptions = {
      email,
      password,
      options: {
        data: {}
      }
    };
    
    if (phone) {
      signUpOptions.phone = phone;
    }
    
    try {
      const { data, error } = await supabaseClient.auth.signUp(signUpOptions);
      
      if (error) {
        showRoundedAlert(`注册失败: 该功能被禁止，请与管理员联系！`, 'error');
        return;
      }
      
      showRoundedAlert('注册成功! 请检查您的邮箱进行验证', 'success');
      
      // 切换到登录表单
      authTabs.forEach(t => t.classList.remove('active'));
      document.querySelector('.auth-tab[data-tab="login"]').classList.add('active');
      loginForm.classList.add('active');
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      
      // 预填充登录表单
      loginEmail.value = email;
    } catch (error) {
      showRoundedAlert(`注册异常: ${error.message}`, 'error');
    }
  });

  // 忘记密码功能
  forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = loginEmail.value;
    
    if (!email) {
      showRoundedAlert('请输入您的邮箱', 'warning'); // 替换alert
      return;
    }
    
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href // 使用当前页面作为回调
    });
    
    if (error) {
      showRoundedAlert(`发送重置邮件失败: ${error.message}`, 'error'); // 替换alert
      return;
    }
    
    showRoundedAlert('密码重置邮件已发送，请检查您的邮箱', 'success'); // 替换alert
  });
}); 

// 用户菜单事件监听器
function setupUserMenuEventListeners() {
  // 添加用户菜单切换功能
  if (userInfo) {
    userInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.style.display = userMenu.style.display === 'block' ? 'none' : 'block';
    });
  }

  // 点击页面其他地方关闭用户菜单
  document.addEventListener('click', (e) => {
    if (userMenu && userMenu.style.display === 'block' && !userInfo.contains(e.target)) {
      userMenu.style.display = 'none';
    }
  });

  // 实现退出登录功能
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        
        if (error) {
          showRoundedAlert(`退出登录失败: ${ error.message}`, 'error');
          return;
        }
        showRoundedAlert('已成功退出登录', 'success');

        // 简单有效的解决方案：重新加载页面
        setTimeout(() => {
          window.location.reload();
        }, 500);        
      } catch (error) {
        showRoundedAlert('退出登录时发生错误', 'error');
      }
    });
  }
}


// ============== 应用初始化函数 ==============
function initializeApp() {
  // 初始化Flatpickr
  flatpickrInstance = flatpickr(dateRangePicker, {
    mode: "range",
    dateFormat: "Y-m-d",
    static: true,
    onChange: function(selectedDates) {
      if (selectedDates.length === 2) {
        handleDateChange();
      }
    }
  });
  // 设置默认日期：当月1号到今天
  if (flatpickrInstance) {
    setDefaultDates();
  }

  // 添加按钮事件监听器
  exportDetailsBtn.addEventListener('click', exportToExcel);
  chartToggleBtn.addEventListener('click', toggleDisplayMode);

  // 添加日期变化监听（带防抖）
  let debounceTimer;
  const handleDateChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadFilterOptions()
        .then(() => {
          loadData();// 加载筛选选项后自动加载数据
          handleResponsiveLayout(); // 添加初始响应式处理
        })
        .catch(console.error);
    }, 500); // 500ms防抖
  };

  loadFilterOptions().then(() => {
      // 绑定事件
      queryBtn.addEventListener('click', loadData);
      clearBtn.addEventListener('click', clearFilters);
      document.getElementById('toggleDetails').addEventListener('click', toggleDetailSection);
      
      // 加载初始数据
      loadData();
    })
    .catch(error => {
      console.error('初始化失败:', error);
      loadingEl.innerHTML = `
        <div style="text-align: center; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="color: #e53e3e; font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
          <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">初始化失败</p>
          <p>${error.message}</p>
        </div>
      `;
      loadingEl.style.display = 'block';
    });

  // 使用捕获阶段关闭下拉框
  document.addEventListener('click', (e) => {
    // 只有当点击的不是下拉框相关元素时才关闭
    if (
      !warehouseSelector.contains(e.target) &&
      !warehouseOptions.contains(e.target) &&
      !brandSelector.contains(e.target) &&
      !brandOptions.contains(e.target) &&
      !productSelector.contains(e.target) &&
      !productOptions.contains(e.target) &&
      !customerSelector.contains(e.target) && // 新增客户下拉框判断
      !customerOptions.contains(e.target) // 新增客户下拉框判断
    ) {
      closeAllDropdowns();
    }
  },true); // 添加捕获阶段监听器

  // 为所有下拉框添加标签移除事件监听
  document.querySelectorAll('.select-box').forEach(selectBox => {
    selectBox.addEventListener('click', (e) => {
      // 使用closest确保能捕获动态生成的元素
      const removeBtn = e.target.closest('.tag-remove');
      if (!removeBtn) return;

      e.stopPropagation(); 
      e.preventDefault(); 
      
      const tag = removeBtn.closest('.tag');
      const selectorId = selectBox.id;
      const value = tag.dataset.value;

      // 找到对应的复选框并触发取消选择
      if (selectorId === 'warehouseSelector') {
        const checkbox = warehouseOptions.querySelector(`input[value="${value}"]`);
        if (checkbox) {
          checkbox.checked = false;
          const event = new Event('change', { bubbles: true });
          checkbox.dispatchEvent(event);
        }
      } else if (selectorId === 'brandSelector') {
        const checkbox = brandOptions.querySelector(`input[value="${value}"]`);
        if (checkbox) {
          checkbox.checked = false;
          const event = new Event('change', { bubbles: true });
          checkbox.dispatchEvent(event);
        }
      } else if (selectorId === 'productSelector') {
        const checkbox = productOptions.querySelector(`input[value="${value}"]`);
        if (checkbox) {
          checkbox.checked = false;
          const event = new Event('change', { bubbles: true });
          checkbox.dispatchEvent(event);
        }
      } else if (selectorId === 'customerSelector') {
        const checkbox = customerOptions.querySelector(`input[value="${value}"]`);
        if (checkbox) {
          checkbox.checked = false;
          const event = new Event('change', { bubbles: true });
          checkbox.dispatchEvent(event);
        }
      }
    });
  });

  // 滚动时关闭下拉框
  window.addEventListener('scroll', () => {
    closeAllDropdowns();
  });
  
  // 窗口大小变化时重新定位下拉框
  window.addEventListener('resize', () => {
    if (currentOpenDropdown) {
      const selector = currentOpenDropdown.previousElementSibling;
      if (selector) {
        if (selector.id === 'warehouseSelector') warehouseMultiSelect.positionDropdown();
        else if (selector.id === 'brandSelector') brandMultiSelect.positionDropdown();
        else if (selector.id === 'productSelector') productMultiSelect.positionDropdown();
        else if (selector.id === 'customerSelector') customerMultiSelect.positionDropdown();
      }
    }
  });
  // 初始化按钮位置调整功能
  initToggleButtonPositioning();
}

// 新增：初始化图表切换按钮定位功能
function initToggleButtonPositioning() {
  const chartContainer = document.querySelector('.chart-container');
  const returnsContainer = document.querySelector('.returns-table-container');
  const tableContainer = document.querySelector('.summary-table-container');
  if (!chartContainer || !returnsContainer || !chartToggleBtn) return;

  function updateButtonPosition() {
    let targetContainer;
    
    // 判断当前显示的是哪个容器
    if (chartContainer.style.display !== 'none') {
      targetContainer = chartContainer;
    } else {
      targetContainer = returnsContainer;
    }

    chartToggleBtn.style.transition = 'none'; // 临时禁用过渡效果
    const rect = targetContainer.getBoundingClientRect();
    const parentRect = targetContainer.parentElement.getBoundingClientRect();
    const rectLeft =  rect.left - parentRect.left+10; // 相对于父容器左侧位置加10px内边距
    const top = rect.top - parentRect.top + 10;
    chartToggleBtn.style.left = `${rectLeft}px`;
    chartToggleBtn.style.top = `${top}px`;
  }

  // 使用 ResizeObserver 监听容器尺寸变化
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(updateButtonPosition);
    resizeObserver.observe(chartContainer);
    resizeObserver.observe(returnsContainer);
    resizeObserver.observe(tableContainer);    
  }
  
  updateButtonPosition();// 初始位置

}

