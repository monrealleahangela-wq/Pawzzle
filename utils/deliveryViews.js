const plain = value => (value?.toObject ? value.toObject() : value);

const compact = value => Object.fromEntries(
  Object.entries(value).filter(([, field]) => field !== undefined)
);

const customerView = customer => {
  const source = plain(customer);
  if (!source || typeof source !== 'object') return source;
  return compact({
    _id: source._id,
    firstName: source.firstName,
    lastName: source.lastName,
    phone: source.phone || source.phoneNumber
  });
};

const storeView = store => {
  const source = plain(store);
  if (!source || typeof source !== 'object') return source;
  return compact({ _id: source._id, name: source.name, contactInfo: source.contactInfo, address: source.address });
};

const riderView = rider => {
  const source = plain(rider);
  if (!source || typeof source !== 'object') return source;
  return compact({
    _id: source._id,
    firstName: source.firstName,
    lastName: source.lastName,
    phone: source.phone,
    riderProfile: source.riderProfile ? {
      staffId: source.riderProfile.staffId,
      vehicleType: source.riderProfile.vehicleType,
      plateNumber: source.riderProfile.plateNumber,
      deliveryZone: source.riderProfile.deliveryZone,
      vehicleCapacity: source.riderProfile.vehicleCapacity
    } : undefined
  });
};

const orderView = order => {
  const source = plain(order);
  if (!source || typeof source !== 'object') return source;
  return compact({
    _id: source._id,
    orderNumber: source.orderNumber,
    trackingNumber: source.trackingNumber,
    customer: customerView(source.customer),
    store: storeView(source.store),
    shippingAddress: source.shippingAddress,
    phoneNumber: source.phoneNumber,
    notes: source.notes,
    items: (source.items || []).map(item => {
      const row = plain(item) || {};
      return compact({ _id: row._id, itemType: row.itemType, name: row.name, quantity: row.quantity, image: row.image });
    }),
    paymentMethod: source.paymentMethod,
    totalAmount: source.totalAmount,
    status: source.status
  });
};

const bookingView = booking => {
  const source = plain(booking);
  if (!source || typeof source !== 'object') return source;
  const service = plain(source.service);
  return compact({
    _id: source._id,
    customer: customerView(source.customer),
    store: storeView(source.store),
    service: service && typeof service === 'object'
      ? compact({ _id: service._id, name: service.name, duration: service.duration })
      : service,
    serviceAddress: source.serviceAddress,
    notes: source.notes,
    status: source.status,
    bookingDate: source.bookingDate,
    startTime: source.startTime,
    endTime: source.endTime
  });
};

const proofView = proof => {
  const source = plain(proof);
  if (!source || typeof source !== 'object') return undefined;
  return compact({
    photo: source.photo,
    signature: source.signature,
    method: source.method,
    otpVerified: source.otpVerified,
    notes: source.notes,
    codPaymentStatus: source.codPaymentStatus,
    timestamp: source.timestamp
  });
};

const parcelView = parcel => {
  const source = plain(parcel);
  if (!source || typeof source !== 'object') return undefined;
  return compact({ weightKg: source.weightKg, parcelCount: source.parcelCount });
};

const riderDeliveryView = delivery => {
  const source = plain(delivery) || {};
  return compact({
    _id: source._id,
    order: orderView(source.order),
    booking: bookingView(source.booking),
    status: source.status,
    isLive: source.isLive,
    assignmentType: source.assignmentType,
    assignedRider: riderView(source.assignedRider),
    assignedAt: source.assignedAt,
    parcel: parcelView(source.parcel),
    statusHistory: source.statusHistory,
    chat: source.chat,
    pickedUpAt: source.pickedUpAt,
    arrivedAt: source.arrivedAt,
    deliveredAt: source.deliveredAt,
    proofOfDelivery: proofView(source.proofOfDelivery),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  });
};

const riderFeedbackView = review => {
  const source = plain(review) || {};
  const delivery = plain(source.deliveryId);
  return compact({
    _id: source._id,
    rating: source.rating,
    comment: source.comment,
    deliveryReference: delivery?._id,
    deliveredAt: delivery?.deliveredAt,
    createdAt: source.createdAt
  });
};

module.exports = { riderDeliveryView, riderFeedbackView };
