const LEGACY_TIER_MAP = Object.freeze({
  basic: 'free',
  premium: 'growth',
  enterprise: 'professional'
});

const SUBSCRIPTION_PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    listingLimit: 10,
    staffLimit: 0,
    locationLimit: 1,
    description: 'For a new store building its first catalog.',
    features: ['10 active listings', '1 store location', 'Owner-managed account', 'Orders, bookings, chat, and basic inventory']
  }),
  starter: Object.freeze({
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 299,
    listingLimit: 30,
    staffLimit: 2,
    locationLimit: 1,
    description: 'For a small store ready to organize daily operations.',
    features: ['30 active listings', '1 store location', 'Up to 2 staff accounts', 'Low-stock monitoring and basic store summaries']
  }),
  growth: Object.freeze({
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 699,
    listingLimit: 70,
    staffLimit: 8,
    locationLimit: 2,
    description: 'For a growing store with a larger catalog and team.',
    features: ['70 active listings', 'Up to 2 store locations', 'Up to 8 staff accounts', 'Product variants, procurement, receiving, and advanced reports']
  }),
  professional: Object.freeze({
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 1499,
    listingLimit: null,
    staffLimit: 25,
    locationLimit: 5,
    description: 'For established operations that need maximum catalog capacity.',
    features: ['Unlimited active listings', 'Up to 5 store locations', 'Up to 25 staff accounts', 'Advanced purchasing, workforce, analytics, and priority support']
  })
});

const normalizeSubscriptionTier = tier => {
  const value = String(tier || 'free').trim().toLowerCase();
  return LEGACY_TIER_MAP[value] || (SUBSCRIPTION_PLANS[value] ? value : 'free');
};

const getSubscriptionPlan = tier => SUBSCRIPTION_PLANS[normalizeSubscriptionTier(tier)];

const getPublicPlanCatalog = () => Object.values(SUBSCRIPTION_PLANS).map(plan => ({ ...plan, features: [...plan.features] }));

module.exports = {
  LEGACY_TIER_MAP,
  SUBSCRIPTION_PLANS,
  normalizeSubscriptionTier,
  getSubscriptionPlan,
  getPublicPlanCatalog
};
