// ═══════════════════════════════════════════════════════════
//  SUBSCRIPTION PLANS CONFIG
//  Yahan se prices change karo — baaki sab automatic
// ═══════════════════════════════════════════════════════════

const PLANS = {
  // 7 Days
  weekly: {
    id: 'weekly',
    name: 'Weekly Plan',
    nameHindi: 'साप्ताहिक प्लान',
    days: 7,
    price: 99,
    currency: 'INR',
    badge: null,
    badgeColor: null,
    description: '7 din ka access',
    features: [
      'Live Location',
      'Notification List',
      'Call Logs',
      '1 Device'
    ],
    isPopular: false,
    isActive: true
  },

  // 15 Days
  biweekly: {
    id: 'biweekly',
    name: 'Bi-Weekly Plan',
    nameHindi: 'पाक्षिक प्लान',
    days: 15,
    price: 179,
    currency: 'INR',
    badge: 'Save 10%',
    badgeColor: '#22c55e',
    description: '15 din ka access',
    features: [
      'Live Location',
      'Notification List',
      'Call Logs',
      '1 Device',
      'Basic Support'
    ],
    isPopular: false,
    isActive: true
  },

  // 30 Days (1 Month)
  monthly: {
    id: 'monthly',
    name: 'Monthly Plan',
    nameHindi: 'मासिक प्लान',
    days: 30,
    price: 299,
    currency: 'INR',
    badge: 'Popular',
    badgeColor: '#f59e0b',
    description: '30 din ka access',
    features: [
      'Live Location',
      'Notification List',
      'Call Logs',
      'Camera Recording',
      'Screen Recording',
      '1 Device',
      'Email Support'
    ],
    isPopular: true,
    isActive: true
  },

  // 90 Days (3 Months)
  quarterly: {
    id: 'quarterly',
    name: 'Quarterly Plan',
    nameHindi: 'त्रैमासिक प्लान',
    days: 90,
    price: 799,
    currency: 'INR',
    badge: 'Save 11%',
    badgeColor: '#22c55e',
    description: '3 mahine ka access',
    features: [
      'Sab Monthly features',
      'Live Streaming',
      'Geofencing',
      'Unlimited Storage',
      '2 Devices',
      'Priority Support'
    ],
    isPopular: false,
    isActive: true
  },

  // 180 Days (6 Months)
  halfyearly: {
    id: 'halfyearly',
    name: 'Half-Yearly Plan',
    nameHindi: 'अर्धवार्षिक प्लान',
    days: 180,
    price: 1499,
    currency: 'INR',
    badge: 'Save 17%',
    badgeColor: '#22c55e',
    description: '6 mahine ka access',
    features: [
      'Sab Quarterly features',
      'Call Recording',
      'WhatsApp Monitor',
      'Intruder Capture',
      '3 Devices',
      'Priority Support'
    ],
    isPopular: false,
    isActive: true
  },

  // 365 Days (1 Year)
  yearly: {
    id: 'yearly',
    name: 'Yearly Plan',
    nameHindi: 'वार्षिक प्लान',
    days: 365,
    price: 2499,
    currency: 'INR',
    badge: 'Best Value - Save 30%',
    badgeColor: '#ef4444',
    description: '1 saal ka access',
    features: [
      'Sab Half-Yearly features',
      'Unlimited Devices',
      'All Future Features',
      'Dedicated Support',
      'VIP Access',
      'No Ads'
    ],
    isPopular: false,
    isActive: true
  }
};

// Helper functions
const getPlanById = (planId) => PLANS[planId] || null;

const getAllActivePlans = () => {
  return Object.values(PLANS).filter(p => p.isActive);
};

const getPopularPlan = () => {
  return Object.values(PLANS).find(p => p.isPopular) || PLANS.monthly;
};

// Calculate savings
const calculateSavings = (plan) => {
  if (!plan || plan.days <= 30) return null;
  const monthlyPrice = PLANS.monthly.price;
  const monthlyEquivalent = (plan.price / plan.days) * 30;
  const savings = monthlyPrice - monthlyEquivalent;
  const percent = Math.round((savings / monthlyPrice) * 100);
  return { amount: Math.round(savings), percent };
};

module.exports = {
  PLANS,
  getPlanById,
  getAllActivePlans,
  getPopularPlan,
  calculateSavings
};
