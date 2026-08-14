const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const InventoryTransaction = require('../models/InventoryTransaction');
const PurchaseOrder = require('../models/PurchaseOrder');
const Expense = require('../models/Expense');
const ProcurementPayment = require('../models/ProcurementPayment');
const Payout = require('../models/Payout');
const Delivery = require('../models/Delivery');
const RiderEarning = require('../models/RiderEarning');
const RiderPayout = require('../models/RiderPayout');
const Review = require('../models/Review');
const User = require('../models/User');
const DecisionSupportService = require('./decisionSupportService');

const SPECIALIST_ROLES = [
  'veterinarian', 'veterinary_technician', 'veterinary_assistant',
  'veterinary_nurse', 'veterinary_laboratory_technician',
  'groomer', 'trainer', 'boarding_staff', 'boarding_specialist'
];
const OPERATIONAL_STAFF_ROLES = [
  'manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer',
  'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff',
  'delivery_dispatcher', 'delivery_rider'
];

const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = value => Number(value || 0);
const sum = (rows, selector) => rows.reduce((total, row) => total + money(selector(row)), 0);
const growthRate = (current, previous) => previous === 0
  ? (current > 0 ? 100 : 0)
  : Number((((current - previous) / previous) * 100).toFixed(1));

const buildSeries = (orders, bookings, now) => {
  const revenueAt = (row, type) => type === 'order' ? money(row.totalAmount) : money(row.totalPrice);
  const paid = [
    ...orders.filter(row => row.paymentStatus === 'paid').map(row => ({ ...row, kind: 'order' })),
    ...bookings.filter(row => row.paymentStatus === 'paid').map(row => ({ ...row, kind: 'booking' }))
  ];
  const dailyStart = addDays(startOfDay(now), -13);
  const daily = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(dailyStart, index);
    const key = dayKey(date);
    return {
      key,
      label: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      revenue: sum(paid.filter(row => dayKey(new Date(row.createdAt)) === key), row => revenueAt(row, row.kind))
    };
  });

  const weeklyStart = addDays(startOfDay(now), -55);
  const weekly = Array.from({ length: 8 }, (_, index) => {
    const from = addDays(weeklyStart, index * 7);
    const to = addDays(from, 7);
    return {
      key: dayKey(from),
      label: `W${index + 1}`,
      revenue: sum(paid.filter(row => new Date(row.createdAt) >= from && new Date(row.createdAt) < to), row => revenueAt(row, row.kind))
    };
  });

  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = monthKey(date);
    return {
      key,
      label: date.toLocaleDateString('en-PH', { month: 'short' }),
      revenue: sum(paid.filter(row => monthKey(new Date(row.createdAt)) === key), row => revenueAt(row, row.kind))
    };
  });
  return { daily, weekly, monthly };
};

const statusCount = (rows, statuses) => rows.filter(row => statuses.includes(row.status)).length;

const isAvailableToday = (staff, now) => {
  const profile = staff.professionalProfile || {};
  if (profile.temporaryUnavailable?.active || profile.emergencyUnavailable?.active) return false;
  const leaves = profile.leaveSchedule || [];
  if (leaves.some(leave => now >= new Date(leave.startDate) && now <= new Date(leave.endDate))) return false;
  const key = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const schedule = profile.availability?.[key];
  return schedule ? schedule.available !== false : true;
};

const buildStoreOperationsSnapshot = async (store, { includeFinancials = false } = {}) => {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const month = startOfMonth(now);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = addDays(today, -30);
  const sevenDaysAgo = addDays(today, -6);
  const storeId = store._id;
  const active = { store: storeId, isDeleted: { $ne: true } };
  const staffFilter = {
    store: storeId,
    isDeleted: { $ne: true },
    isActive: { $ne: false },
    $or: [
      { role: { $in: SPECIALIST_ROLES } },
      { role: 'staff', staffType: { $in: SPECIALIST_ROLES } }
    ]
  };
  const workforceFilter = {
    store: storeId,
    isDeleted: { $ne: true },
    staffStatus: { $ne: 'archived' },
    $or: [{ role: 'staff' }, { role: { $in: OPERATIONAL_STAFF_ROLES } }]
  };

  const [orders, bookings, petCount, productCount, inventory, movements, purchaseOrders,
    expenses, procurementPayments, payouts, deliveries, riderEarnings, riderPayouts, specialists, workforceMembers, staffReviews, allReviews] = await Promise.all([
    Order.find(active).select('customer items totalAmount netAmount platformFee pricingBreakdown shippingFee status paymentStatus createdAt orderNumber').sort({ createdAt: -1 }).lean(),
    Booking.find(active).select('customer service staff serviceProvider totalPrice netAmount platformFee pricingBreakdown status paymentStatus bookingDate startTime createdAt').populate('service', 'name').lean(),
    Pet.countDocuments(active),
    Product.countDocuments(active),
    Inventory.find({ store: storeId, isActive: { $ne: false } }).populate('product', 'name category sku stockQuantity minStockThreshold').populate('supplierProductRef', 'deliveryLeadTimeDays').lean(),
    InventoryTransaction.find({ store: storeId, occurredAt: { $gte: addDays(today, -60) } }).select('product type quantity occurredAt').lean(),
    PurchaseOrder.find(active).populate('supplier', 'businessName performance ratings').lean(),
    includeFinancials ? Expense.find({ store: storeId, status: { $ne: 'void' } }).lean() : [],
    includeFinancials ? ProcurementPayment.find({ store: storeId, status: 'recorded' }).lean() : [],
    includeFinancials ? Payout.find({ store: storeId }).lean() : [],
    Delivery.find({ store: storeId }).select('status assignmentType assignedRider assignedAt pickedUpAt deliveredAt createdAt').lean(),
    RiderEarning.find({ store: storeId, earnedAt: { $gte: today } }).lean(),
    includeFinancials ? RiderPayout.find({ store: storeId, createdAt: { $gte: month } }).lean() : [],
    User.find(staffFilter).select('firstName lastName role staffType avatar profilePicture professionalProfile').lean(),
    User.find(workforceFilter).select('firstName lastName role staffType isActive staffStatus professionalProfile createdAt').lean(),
    Review.find({ storeId, staffId: { $ne: null }, isDeleted: { $ne: true }, isApproved: { $ne: false } }).select('staffId rating createdAt').lean(),
    Review.find({ storeId, isDeleted: { $ne: true }, isApproved: { $ne: false } }).select('rating createdAt').lean()
  ]);

  const paidOrders = orders.filter(row => row.paymentStatus === 'paid');
  const paidBookings = bookings.filter(row => row.paymentStatus === 'paid');
  const todayPaidOrders = paidOrders.filter(row => new Date(row.createdAt) >= today && new Date(row.createdAt) < tomorrow);
  const todayPaidBookings = paidBookings.filter(row => new Date(row.createdAt) >= today && new Date(row.createdAt) < tomorrow);
  const monthPaidOrders = paidOrders.filter(row => new Date(row.createdAt) >= month);
  const monthPaidBookings = paidBookings.filter(row => new Date(row.createdAt) >= month);
  const previousPaidOrders = paidOrders.filter(row => new Date(row.createdAt) >= previousMonth && new Date(row.createdAt) < month);
  const previousPaidBookings = paidBookings.filter(row => new Date(row.createdAt) >= previousMonth && new Date(row.createdAt) < month);
  const monthSales = sum(monthPaidOrders, row => row.totalAmount) + sum(monthPaidBookings, row => row.totalPrice);
  const previousSales = sum(previousPaidOrders, row => row.totalAmount) + sum(previousPaidBookings, row => row.totalPrice);
  const weekPaidOrders = paidOrders.filter(row => new Date(row.createdAt) >= sevenDaysAgo);
  const weekPaidBookings = paidBookings.filter(row => new Date(row.createdAt) >= sevenDaysAgo);

  const orderProductRevenue = sum(paidOrders, row => Math.max(0, money(row.totalAmount) - money(row.pricingBreakdown?.deliveryFee || row.shippingFee)));
  const bookingServiceRevenue = sum(paidBookings, row => Math.max(0, money(row.totalPrice) - money(row.pricingBreakdown?.deliveryFee)));
  const deliveryRevenue = sum(paidOrders, row => row.pricingBreakdown?.deliveryFee || row.shippingFee)
    + sum(paidBookings, row => row.pricingBreakdown?.deliveryFee);

  const salesByProduct = new Map();
  paidOrders.filter(row => new Date(row.createdAt) >= thirtyDaysAgo).forEach(order => {
    (order.items || []).filter(item => item.itemType === 'product').forEach(item => {
      const current = salesByProduct.get(String(item.itemId)) || { name: item.name, quantity: 0, revenue: 0 };
      current.quantity += money(item.quantity);
      current.revenue += money(item.price) * money(item.quantity);
      salesByProduct.set(String(item.itemId), current);
    });
  });
  const fastMoving = [...salesByProduct.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const slowMoving = inventory
    .filter(row => row.product && !salesByProduct.has(String(row.product._id)))
    .slice(0, 5)
    .map(row => ({ id: row.product._id, name: row.product.name, quantity: row.quantity }));

  const bookingStatus = [
    { key: 'completed', label: 'Completed', value: statusCount(bookings, ['completed', 'finished']) },
    { key: 'pending', label: 'Pending review', value: statusCount(bookings, ['pending']) },
    { key: 'cancelled', label: 'Cancelled', value: statusCount(bookings, ['cancelled', 'rejected', 'no_show']) },
    { key: 'proposal', label: 'Proposal pending', value: statusCount(bookings, ['awaiting_customer_confirmation']) },
    { key: 'in_progress', label: 'In progress', value: statusCount(bookings, ['processing']) }
  ];

  const staffRows = specialists.map(staff => {
    const id = String(staff._id);
    const reviews = staffReviews.filter(review => String(review.staffId) === id);
    const completed = bookings.filter(booking => ['completed', 'finished'].includes(booking.status)
      && [booking.staff, booking.serviceProvider].some(value => String(value || '') === id)).length;
    const activeBookings = bookings.filter(booking => ['confirmed', 'approved', 'processing'].includes(booking.status)
      && [booking.staff, booking.serviceProvider].some(value => String(value || '') === id)).length;
    return {
      id,
      name: `${staff.firstName || ''} ${staff.lastName || ''}`.trim(),
      role: staff.staffType || staff.role,
      photo: staff.avatar || staff.profilePicture || '',
      rating: reviews.length ? Number((sum(reviews, review => review.rating) / reviews.length).toFixed(1)) : 0,
      reviewCount: reviews.length,
      completedServices: completed,
      activeBookings,
      availableToday: isAvailableToday(staff, now),
      verified: staff.professionalProfile?.verification?.status === 'verified'
    };
  });
  const workforceRows = workforceMembers.map(member => {
    const id = String(member._id);
    const activeWorkload = bookings.filter(booking => ['confirmed', 'approved', 'processing', 'finished'].includes(booking.status)
      && [booking.staff, booking.serviceProvider].some(value => String(value || '') === id)).length;
    const profile = member.professionalProfile || {};
    const onLeave = (profile.leaveSchedule || []).some(leave => new Date(leave.startDate) <= now && new Date(leave.endDate) >= today);
    const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const onBreak = (profile.availability?.[day]?.breaks || []).some(item => item.start <= currentTime && currentTime < item.end);
    const accountStatus = member.staffStatus || (member.isActive === false ? 'inactive' : 'active');
    const status = profile.emergencyUnavailable?.active ? 'emergency_unavailable'
      : onLeave ? 'on_leave'
        : profile.temporaryUnavailable?.active ? 'temporary_unavailable'
          : onBreak ? 'break'
          : activeWorkload ? 'busy'
            : member.isActive === false || accountStatus !== 'active' ? accountStatus : 'available';
    return { id, role: member.staffType || member.role, status, activeWorkload, verification: profile.verification?.status || 'not_required' };
  });
  const roleDistribution = [...new Set(workforceRows.map(row => row.role))].map(role => ({ role, count: workforceRows.filter(row => row.role === role).length })).sort((a, b) => b.count - a.count);
  const upcomingLeave = workforceMembers.flatMap(member => (member.professionalProfile?.leaveSchedule || []).map(leave => ({
    staffId: String(member._id), name: `${member.firstName || ''} ${member.lastName || ''}`.trim(), startDate: leave.startDate, endDate: leave.endDate
  }))).filter(leave => new Date(leave.endDate) >= today && new Date(leave.startDate) <= addDays(today, 30)).sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).slice(0, 5);

  const deliveryDurations = deliveries
    .filter(row => row.deliveredAt && (row.pickedUpAt || row.assignedAt || row.createdAt))
    .map(row => (new Date(row.deliveredAt) - new Date(row.pickedUpAt || row.assignedAt || row.createdAt)) / 60000)
    .filter(value => value >= 0);
  const riderWorkload = new Map();
  deliveries.filter(row => row.assignedRider && !['delivered', 'cancelled', 'returned_to_store'].includes(row.status)).forEach(row => {
    const id = String(row.assignedRider);
    riderWorkload.set(id, (riderWorkload.get(id) || 0) + 1);
  });

  const customerCounts = new Map();
  [...orders, ...bookings].forEach(row => {
    const id = String(row.customer || '');
    if (id) customerCounts.set(id, (customerCounts.get(id) || 0) + 1);
  });
  const serviceCounts = new Map();
  paidBookings.forEach(row => {
    const name = row.service?.name || 'Service';
    serviceCounts.set(name, (serviceCounts.get(name) || 0) + 1);
  });
  const hourCounts = new Map();
  bookings.forEach(row => {
    const hour = Number(String(row.startTime || '0').split(':')[0]);
    if (Number.isFinite(hour)) hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  const monthlyExpenses = expenses.filter(row => new Date(row.expenseDate) >= month);
  const monthlyProcurement = purchaseOrders.filter(row => new Date(row.createdAt) >= month && row.status !== 'cancelled');
  const vatCollected = sum(monthPaidOrders, row => row.pricingBreakdown?.vatAmount)
    + sum(monthPaidBookings, row => row.pricingBreakdown?.vatAmount);
  const financeRevenue = sum(monthPaidOrders, row => row.totalAmount) + sum(monthPaidBookings, row => row.totalPrice) - vatCollected;
  const expenseTotal = sum(monthlyExpenses, row => row.grossAmount);
  const procurementCost = sum(monthlyProcurement, row => row.totalCost);
  const procurementPaid = sum(procurementPayments.filter(row => new Date(row.paymentDate) >= month), row => row.amount);
  const deliveryPaid = sum(riderPayouts.filter(row => row.status === 'paid'), row => row.amount);
  const recognizedExpenses = expenseTotal + procurementPaid + deliveryPaid;
  const pendingProcurement = sum(purchaseOrders, row => Math.max(0, money(row.totalCost) - money(row.paidAmount)));
  const productSalesWindows = new Map();
  paidOrders.forEach(order => {
    const createdAt = new Date(order.createdAt);
    if (createdAt < addDays(today, -60)) return;
    (order.items || []).filter(item => item.itemType === 'product').forEach(item => {
      const id = String(item.itemId);
      const row = productSalesWindows.get(id) || { current: 0, previous: 0, observations: 0 };
      if (createdAt >= thirtyDaysAgo) row.current += money(item.quantity);
      else row.previous += money(item.quantity);
      row.observations += 1;
      productSalesWindows.set(id, row);
    });
  });
  const ledgerUsageWindows = new Map();
  movements.filter(row => ['sale', 'service_use'].includes(row.type)).forEach(movement => {
    const id = String(movement.product);
    const row = ledgerUsageWindows.get(id) || { current: 0, previous: 0, observations: 0 };
    if (new Date(movement.occurredAt) >= thirtyDaysAgo) row.current += money(movement.quantity);
    else row.previous += money(movement.quantity);
    row.observations += 1;
    ledgerUsageWindows.set(id, row);
  });
  // The inventory ledger is authoritative when it exists; order-item history
  // is only the compatibility fallback for products without ledger movements.
  ledgerUsageWindows.forEach((value, key) => productSalesWindows.set(key, value));
  const inventoryRecommendations = inventory.filter(row => row.product).map(row => {
    const sales = productSalesWindows.get(String(row.product._id)) || { current: 0, previous: 0, observations: 0 };
    return DecisionSupportService.explainInventoryPosition({ product: row.product, inventory: row, unitsLast30: sales.current, unitsPrevious30: sales.previous, observations: sales.observations });
  }).sort((a, b) => Number(b.decision.shouldReorder) - Number(a.decision.shouldReorder) || (a.inventoryPosition.daysRemaining ?? Infinity) - (b.inventoryPosition.daysRemaining ?? Infinity));
  const supplierInsights = DecisionSupportService.supplierInsights(purchaseOrders);
  const demandForecast = DecisionSupportService.bookingDemandForecast(bookings, { now, activeSpecialists: staffRows.length });
  const bookingCompleted = statusCount(bookings, ['completed', 'finished']);
  const bookingCancelled = statusCount(bookings, ['cancelled', 'rejected', 'no_show']);
  const averageRating = allReviews.length ? sum(allReviews, row => row.rating) / allReviews.length : null;
  const healthScore = DecisionSupportService.storeHealthScore({
    revenueGrowth: growthRate(monthSales, previousSales),
    bookingTotal: bookings.length,
    bookingCompleted,
    bookingCancelled,
    reviewCount: allReviews.length,
    averageRating,
    inventoryTotal: inventory.length,
    inventoryRiskCount: inventoryRecommendations.filter(row => row.decision.shouldReorder).length,
    supplierScore: supplierInsights.length ? sum(supplierInsights, row => row.score) / supplierInsights.length : null,
    pendingPayouts: includeFinancials ? payouts.filter(row => ['pending', 'processing'].includes(row.status)).length : null,
    serviceTotal: bookings.length,
    serviceCompleted: bookingCompleted
  });
  const credentialDocuments = specialists.flatMap(staff => staff.professionalProfile?.credentialDocuments || []);
  const inThirtyDays = new Date(now.getTime() + 30 * 86400000);
  const risks = DecisionSupportService.riskIndicators({
    inventory: inventoryRecommendations,
    credentialsExpired: credentialDocuments.filter(document => document.status !== 'archived' && document.expiresAt && new Date(document.expiresAt) <= now).length,
    credentialsExpiring: credentialDocuments.filter(document => document.status !== 'archived' && document.expiresAt && new Date(document.expiresAt) > now && new Date(document.expiresAt) <= inThirtyDays).length,
    supplierDelayCount: purchaseOrders.filter(order => order.status === 'delivered' && order.estimatedDeliveryDate && order.actualDeliveryDate && new Date(order.actualDeliveryDate) > new Date(order.estimatedDeliveryDate)).length,
    cancellationRate: bookings.length ? bookingCancelled / bookings.length * 100 : 0,
    cancelledBookings: bookingCancelled,
    totalBookings: bookings.length,
    pendingPayouts: payouts.filter(row => ['pending', 'processing'].includes(row.status)).length,
    overdueProcurement: purchaseOrders.filter(order => !['delivered', 'cancelled', 'returned'].includes(order.status) && order.estimatedDeliveryDate && new Date(order.estimatedDeliveryDate) < now).length,
    bookingCongestion: demandForecast.recommendedStaffing.gap > 0 ? {
      reason: `${demandForecast.recommendedStaffing.gap} additional specialist${demandForecast.recommendedStaffing.gap === 1 ? '' : 's'} may be needed during the observed peak.`,
      evidence: demandForecast.basedOn,
      action: demandForecast.recommendedAction
    } : null
  });

  const response = {
    generatedAt: now.toISOString(),
    store: { id: storeId, name: store.name, balance: money(store.balance) },
    counts: { pets: petCount, products: productCount, orders: orders.length, bookings: bookings.length },
    kpis: {
      todaySales: sum(todayPaidOrders, row => row.totalAmount) + sum(todayPaidBookings, row => row.totalPrice),
      monthlySales: monthSales,
      ordersToday: orders.filter(row => new Date(row.createdAt) >= today && new Date(row.createdAt) < tomorrow).length,
      bookingsToday: bookings.filter(row => new Date(row.bookingDate) >= today && new Date(row.bookingDate) < tomorrow).length,
      pendingOrders: statusCount(orders, ['pending', 'pending_payment', 'awaiting_confirmation', 'confirmed', 'preparing']),
      activeDeliveries: deliveries.filter(row => !['delivered', 'cancelled', 'returned_to_store'].includes(row.status)).length,
      pendingBookings: statusCount(bookings, ['pending', 'awaiting_customer_confirmation', 'awaiting_payment']),
      lowStockItems: inventory.filter(row => money(row.quantity) <= money(row.reorderLevel)).length,
      revenueGrowth: growthRate(monthSales, previousSales)
    },
    weekly: {
      revenue: sum(weekPaidOrders, row => row.totalAmount) + sum(weekPaidBookings, row => row.totalPrice),
      bookings: bookings.filter(row => new Date(row.bookingDate) >= sevenDaysAgo && new Date(row.bookingDate) < tomorrow).length,
      activeWorkload: sum(workforceRows, row => row.activeWorkload)
    },
    sales: {
      trends: buildSeries(orders, bookings, now),
      breakdown: [
        { key: 'products', label: 'Products', value: orderProductRevenue },
        { key: 'services', label: 'Services', value: bookingServiceRevenue },
        { key: 'deliveries', label: 'Delivery fees', value: deliveryRevenue }
      ]
    },
    bookings: {
      status: bookingStatus,
      today: bookings.filter(row => new Date(row.bookingDate) >= today && new Date(row.bookingDate) < tomorrow).length,
      upcoming: bookings.filter(row => new Date(row.bookingDate) >= tomorrow && !['cancelled', 'rejected', 'completed', 'finished'].includes(row.status)).length
    },
    specialists: {
      active: staffRows.length,
      availableToday: staffRows.filter(row => row.availableToday).length,
      topRated: [...staffRows].sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount).slice(0, 5),
      mostCompleted: [...staffRows].sort((a, b) => b.completedServices - a.completedServices).slice(0, 5)
    },
    workforce: {
      total: workforceRows.length,
      available: workforceRows.filter(row => row.status === 'available').length,
      busy: workforceRows.filter(row => row.status === 'busy').length,
      onBreak: workforceRows.filter(row => row.status === 'break').length,
      onLeave: workforceRows.filter(row => row.status === 'on_leave').length,
      unavailable: workforceRows.filter(row => ['temporary_unavailable', 'emergency_unavailable', 'inactive', 'suspended'].includes(row.status)).length,
      pendingVerification: workforceRows.filter(row => row.verification === 'pending_verification').length,
      activeWorkload: sum(workforceRows, row => row.activeWorkload),
      distribution: roleDistribution,
      upcomingLeave,
      configuredRolePolicies: Object.keys(store.rolePermissions || {}).length
    },
    inventory: {
      low: inventory.filter(row => money(row.quantity) > 0 && money(row.quantity) <= money(row.reorderLevel)).length,
      critical: inventory.filter(row => money(row.quantity) === 0).length,
      reorderRequired: inventory.filter(row => money(row.quantity) <= money(row.reorderLevel)).length,
      fastMoving,
      slowMoving,
      movementCount30d: movements.length
    },
    logistics: {
      active: deliveries.filter(row => !['delivered', 'cancelled', 'returned_to_store'].includes(row.status)).length,
      completed: statusCount(deliveries, ['delivered']),
      failed: statusCount(deliveries, ['failed_attempt', 'returned_to_store', 'declined']),
      averageDeliveryMinutes: deliveryDurations.length ? Math.round(sum(deliveryDurations, value => value) / deliveryDurations.length) : 0,
      internal: deliveries.filter(row => row.assignmentType === 'internal').length,
      thirdParty: deliveries.filter(row => row.assignmentType === 'third_party').length,
      activeRiderWorkload: [...riderWorkload.values()].reduce((total, value) => total + value, 0),
      riderEarningsToday: sum(riderEarnings, row => row.amount),
      completionRate: deliveries.length ? Number(((statusCount(deliveries, ['delivered']) / deliveries.length) * 100).toFixed(1)) : 0
    },
    customers: {
      newCustomers: [...customerCounts.values()].filter(count => count === 1).length,
      returningCustomers: [...customerCounts.values()].filter(count => count > 1).length,
      popularServices: [...serviceCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      topProducts: [...salesByProduct.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      peakBookingHours: [...hourCounts.entries()].map(([hour, count]) => ({ hour, count })).sort((a, b) => b.count - a.count).slice(0, 5)
    },
    recentOrders: orders.slice(0, 6)
  };

  response.decisionSupport = {
    healthScore,
    bookingDemand: demandForecast,
    inventoryRecommendations: inventoryRecommendations.slice(0, 8),
    procurement: {
      preferredSupplier: supplierInsights[0] || null,
      supplierRanking: supplierInsights.slice(0, 5),
      reorderTiming: inventoryRecommendations.filter(row => row.decision.shouldReorder).slice(0, 5),
      why: supplierInsights[0]?.why || 'No completed supplier history is available for a stable preference.',
      basedOn: supplierInsights[0]?.basedOn || ['Recorded store purchase orders'],
      recommendedAction: supplierInsights[0]?.recommendedAction || 'Record supplier delivery outcomes to enable a preference.'
    },
    risks,
    recommendedActions: risks.slice(0, 5).map(risk => ({ title: risk.title, severity: risk.severity, why: risk.reason, basedOn: risk.evidence, recommendedAction: risk.suggestedAction }))
  };

  if (includeFinancials) {
    response.procurement = {
      pendingPurchaseOrders: statusCount(purchaseOrders, ['draft', 'submitted', 'confirmed', 'processing', 'shipped']),
      deliveredPurchaseOrders: statusCount(purchaseOrders, ['delivered']),
      monthlyCost: procurementCost,
      recordedPayments: procurementPaid,
      supplierPerformance: purchaseOrders
        .filter(row => row.supplier)
        .reduce((rows, order) => {
          const id = String(order.supplier._id);
          let existing = rows.find(row => row.id === id);
          if (!existing) {
            existing = { id, name: order.supplier.businessName, orders: 0, delivered: 0, reliability: money(order.supplier.performance?.reliabilityScore) };
            rows.push(existing);
          }
          existing.orders += 1;
          if (order.status === 'delivered') existing.delivered += 1;
          return rows;
        }, []).sort((a, b) => b.delivered - a.delivered).slice(0, 5)
    };
    response.finance = {
      revenue: financeRevenue,
      expenses: recognizedExpenses,
      profit: financeRevenue - recognizedExpenses,
      vatCollected,
      payouts: {
        pending: sum(payouts.filter(row => ['pending', 'processing'].includes(row.status)), row => row.amount),
        completed: sum(payouts.filter(row => row.status === 'completed'), row => row.amount)
      },
      pendingProcurementPayments: pendingProcurement,
      incomeVsExpense: [
        { label: 'Income', value: financeRevenue },
        { label: 'Expenses', value: recognizedExpenses }
      ]
    };
  }

  return response;
};

module.exports = {
  SPECIALIST_ROLES,
  buildSeries,
  growthRate,
  buildStoreOperationsSnapshot
};
