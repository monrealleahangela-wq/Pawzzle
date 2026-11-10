const LEGACY_TIER_MAP = Object.freeze({ basic: 'free', premium: 'growth', enterprise: 'professional' });

const ENTITLEMENTS = Object.freeze({
  CORE_COMMERCE: 'core_commerce', LOW_STOCK_ALERTS: 'low_stock_alerts',
  STORE_PERFORMANCE_SUMMARY: 'store_performance_summary', SUPPLIER_CATALOG: 'supplier_catalog',
  MANUAL_RESTOCKING: 'manual_restocking', PRODUCT_VARIANTS: 'product_variants',
  SUPPLIER_PROCUREMENT: 'supplier_procurement', GOODS_RECEIVING: 'goods_receiving',
  INVENTORY_HISTORY: 'inventory_history', STOCK_LOSS_APPROVALS: 'stock_loss_approvals',
  STAFF_ATTENDANCE: 'staff_attendance', STAFF_SCHEDULING: 'staff_scheduling',
  ROLE_MANAGEMENT: 'role_management', PROMOTIONS: 'promotions', FEATURED_PRODUCTS: 'featured_products',
  ADVANCED_REPORTS: 'advanced_reports', CSV_EXPORTS: 'csv_exports',
  STOREFRONT_CUSTOMIZATION: 'storefront_customization', PAYROLL: 'payroll',
  COMPENSATION: 'compensation', SUPPLIER_COMPARISONS: 'supplier_comparisons',
  DETAILED_ANALYTICS: 'detailed_analytics', SCHEDULED_REPORTS: 'scheduled_reports',
  PRIORITY_PLACEMENT: 'priority_placement', CUSTOMER_RETENTION_INSIGHTS: 'customer_retention_insights',
  MULTI_LOCATION: 'multi_location', CONSOLIDATED_INVENTORY: 'consolidated_inventory'
});

const universalFeatures = Object.freeze([
  'Store verification and customer-protection controls',
  'FDA compliance review where required',
  'Secure payments with no Pawzzle platform fee'
]);
// Supplier discovery and ordinary replenishment are essential store operations.
// Advanced procurement, comparisons and receiving remain paid entitlements.
const core = [ENTITLEMENTS.CORE_COMMERCE, ENTITLEMENTS.SUPPLIER_CATALOG,
  ENTITLEMENTS.MANUAL_RESTOCKING];
const starter = [...core, ENTITLEMENTS.LOW_STOCK_ALERTS, ENTITLEMENTS.STORE_PERFORMANCE_SUMMARY];
const growth = [...starter, ENTITLEMENTS.PRODUCT_VARIANTS, ENTITLEMENTS.SUPPLIER_PROCUREMENT,
  ENTITLEMENTS.GOODS_RECEIVING, ENTITLEMENTS.INVENTORY_HISTORY, ENTITLEMENTS.STOCK_LOSS_APPROVALS,
  ENTITLEMENTS.STAFF_ATTENDANCE, ENTITLEMENTS.STAFF_SCHEDULING, ENTITLEMENTS.ROLE_MANAGEMENT,
  ENTITLEMENTS.PROMOTIONS, ENTITLEMENTS.FEATURED_PRODUCTS, ENTITLEMENTS.ADVANCED_REPORTS,
  ENTITLEMENTS.CSV_EXPORTS, ENTITLEMENTS.STOREFRONT_CUSTOMIZATION];
const professional = [...growth, ENTITLEMENTS.PAYROLL, ENTITLEMENTS.COMPENSATION,
  ENTITLEMENTS.SUPPLIER_COMPARISONS, ENTITLEMENTS.DETAILED_ANALYTICS, ENTITLEMENTS.SCHEDULED_REPORTS,
  ENTITLEMENTS.PRIORITY_PLACEMENT, ENTITLEMENTS.CUSTOMER_RETENTION_INSIGHTS,
  ENTITLEMENTS.MULTI_LOCATION, ENTITLEMENTS.CONSOLIDATED_INVENTORY];

const SUBSCRIPTION_PLANS = Object.freeze({
  free: Object.freeze({ id: 'free', rank: 0, name: 'Free', monthlyPrice: 0, annualPrice: 0,
    listingLimit: 10, staffLimit: 0, locationLimit: 1, termDays: null, supportLevel: 'community',
    description: 'For a new store building its first catalog.', entitlements: Object.freeze(core),
    features: Object.freeze(['10 active product, pet, and service listings', '1 store location and owner-managed access',
      'Customer chat and inquiries', 'Customer orders and service bookings', 'Basic inventory and payouts',
      'Supplier catalog and manual restocking orders']) }),
  starter: Object.freeze({ id: 'starter', rank: 1, name: 'Pawzzle Starter', monthlyPrice: 299, annualPrice: 3049,
    listingLimit: 30, staffLimit: 2, locationLimit: 1, termDays: 30, supportLevel: 'standard',
    description: 'Start selling and managing your pet business online.', entitlements: Object.freeze(starter),
    features: Object.freeze(['30 active product, pet, and service listings', '1 store location and up to 2 staff accounts',
      'Customer chat, inquiries, orders, and bookings', 'Product inventory and low-stock alerts',
      'Basic store profile and performance summary', 'Standard email support']) }),
  growth: Object.freeze({ id: 'growth', rank: 2, name: 'Pawzzle Growth', monthlyPrice: 699, annualPrice: 7129,
    listingLimit: 70, staffLimit: 8, locationLimit: 1, termDays: 30, trialDays: 14, supportLevel: 'faster',
    description: 'Grow your store with better inventory, staffing, and sales tools.', entitlements: Object.freeze(growth),
    features: Object.freeze(['Everything in Starter', '70 active listings and up to 8 staff accounts',
      'Product variants such as size, flavor, weight, and packaging', 'Supplier procurement and goods receiving',
      'Inventory history and stock-loss approval workflow', 'Staff attendance, scheduling, and role management',
      'Promotions, discount codes, and featured products', 'Advanced sales, inventory, and booking reports',
      'Downloadable CSV reports and storefront customization', 'Faster customer support']) }),
  professional: Object.freeze({ id: 'professional', rank: 3, name: 'Pawzzle Professional', monthlyPrice: 1499, annualPrice: 15289,
    listingLimit: null, staffLimit: 25, locationLimit: 3, termDays: 30, supportLevel: 'priority',
    description: 'Complete operations and reporting for established pet businesses.', entitlements: Object.freeze(professional),
    features: Object.freeze(['Everything in Growth', 'Unlimited active listings and up to 25 staff accounts',
      'Up to 3 store locations with consolidated inventory', 'Staff payroll and compensation tools',
      'Advanced purchasing and supplier comparisons', 'Detailed revenue and operational analytics',
      'Scheduled reports and customer-retention insights', 'Priority marketplace placement and priority support']) })
});

const normalizeSubscriptionTier = tier => {
  const value = String(tier || 'free').trim().toLowerCase();
  return LEGACY_TIER_MAP[value] || (SUBSCRIPTION_PLANS[value] ? value : 'free');
};
const getSubscriptionPlan = tier => SUBSCRIPTION_PLANS[normalizeSubscriptionTier(tier)];
const planHasEntitlement = (tier, entitlement) => getSubscriptionPlan(tier).entitlements.includes(entitlement);
const getPlanPrice = (tier, billingInterval = 'monthly') => {
  const plan = getSubscriptionPlan(tier);
  return billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
};
const getPublicPlanCatalog = () => Object.values(SUBSCRIPTION_PLANS).map(plan => ({ ...plan,
  features: [...plan.features], entitlements: [...plan.entitlements], universalFeatures: [...universalFeatures] }));

module.exports = { LEGACY_TIER_MAP, ENTITLEMENTS, SUBSCRIPTION_PLANS, universalFeatures,
  normalizeSubscriptionTier, getSubscriptionPlan, getPlanPrice, planHasEntitlement, getPublicPlanCatalog };
