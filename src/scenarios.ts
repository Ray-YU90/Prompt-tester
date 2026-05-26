// 场景预设：外卖/点单场景的常见步骤
// 每个场景包含原始系统文案，以及对该场景的描述（用于 AI 理解）

export type Scenario = {
  id: string
  name: string
  category: '点单引导' | '搜索结果' | '订单确认' | '支付结果' | '订单跟踪' | '异常处理'
  originalText: string
  description: string
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'address',
    name: '选择配送地址',
    category: '点单引导',
    originalText: '您想点团餐，请先选择一个配送地址',
    description: '用户刚进入团餐流程，需要先选地址才能继续',
  },
  {
    id: 'single-meal',
    name: '选择单人套餐',
    category: '点单引导',
    originalText: '您想点单人餐，请先选择一个配送地址',
    description: '用户刚进入单人点餐流程，需要先选地址',
  },
  {
    id: 'search-result',
    name: '展示搜索结果',
    category: '搜索结果',
    originalText: '已为您在公司地址附近搜索吃喝全有的香辣单人套餐，请查看搜索结果',
    description: '已根据用户偏好搜索到附近店铺套餐，请用户查看',
  },
  {
    id: 'recommend-store',
    name: '推荐店铺',
    category: '搜索结果',
    originalText: '为您推荐附近评分4.8的真功夫餐厅，距离1.2公里，预计30分钟送达',
    description: '主动给用户推荐合适的店铺',
  },
  {
    id: 'confirm-order-team',
    name: '确认团餐订单',
    category: '订单确认',
    originalText:
      '订单总价207元，包含真功夫8人商务团餐198元、配送费4元、包装费5元，请问您确认付款吗',
    description: '展示订单明细，请用户确认付款',
  },
  {
    id: 'confirm-order-single',
    name: '确认单人订单',
    category: '订单确认',
    originalText: '订单总价32元，包含香辣鸡腿堡套餐28元、配送费4元，请问您确认付款吗',
    description: '展示单人订单明细，请用户确认',
  },
  {
    id: 'pay-success-lunch',
    name: '支付成功（午餐）',
    category: '支付结果',
    originalText: '已为您完成支付，订单金额207元，预计11:50送达公司，祝您用餐愉快',
    description: '支付成功后给出预计送达时间（午餐时段）',
  },
  {
    id: 'pay-success-afternoon',
    name: '支付成功（下午）',
    category: '支付结果',
    originalText: '好的，支付成功，预计13:15送达公司，祝您用餐愉快',
    description: '支付成功后给出预计送达时间（下午时段）',
  },
  {
    id: 'order-pickup',
    name: '骑手已取餐',
    category: '订单跟踪',
    originalText: '骑手已取餐，正在为您配送，请耐心等待',
    description: '订单状态变更通知：骑手已经取到餐',
  },
  {
    id: 'order-delivered',
    name: '订单已送达',
    category: '订单跟踪',
    originalText: '您的订单已送达，请尽快取餐',
    description: '骑手已送达订单',
  },
  {
    id: 'out-of-stock',
    name: '商品售罄',
    category: '异常处理',
    originalText: '抱歉，您选择的香辣鸡腿堡已售罄，请重新选择其他商品',
    description: '用户选的商品已经卖完，需要重新选',
  },
  {
    id: 'delivery-late',
    name: '配送延迟',
    category: '异常处理',
    originalText: '抱歉，由于天气原因，您的订单可能会延迟15分钟送达',
    description: '订单延迟通知，需要安抚用户',
  },
]

export const CATEGORIES = [
  '点单引导',
  '搜索结果',
  '订单确认',
  '支付结果',
  '订单跟踪',
  '异常处理',
] as const
