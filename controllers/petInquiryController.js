const mongoose = require('mongoose');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const PetInquiry = require('../models/PetInquiry');
const { isStoreAdmin, isOperationalStaff, hasPermission } = require('../config/permissions');
const { canAccessStore, getAuthorizedStoreIds } = require('../utils/authorizationPolicy');
const { isMarketplacePet } = require('../utils/catalogListing');
const {
  getCustomerVisibleOwnerIds, buildCustomerVisibleStoreFilter, withCustomerComplianceFilter
} = require('../utils/storeVisibility');
const { cleanText, validateRequestKey, validateAction } = require('../utils/petInquiryPolicy');
const { createNotification } = require('./notificationController');

const isSeller = user => (isStoreAdmin(user) || isOperationalStaff(user)) && hasPermission(user, 'pets.manage');
const fail = (res, error) => res.status(error.statusCode || 500).json({
  message: error.statusCode ? error.message : 'Unable to process this pet inquiry.'
});
const idValid = id => mongoose.isValidObjectId(id);
const customerLink = inquiry => `/pet-inquiries?id=${inquiry._id}`;
const sellerLink = inquiry => `/admin/pet-inquiries?id=${inquiry._id}`;
const toClientInquiry = inquiry => {
  const value = inquiry?.toObject ? inquiry.toObject() : { ...inquiry };
  delete value.submissionKey;
  value.events = (value.events || []).map(event => {
    const safe = event?.toObject ? event.toObject() : { ...event };
    delete safe.requestKey;
    return safe;
  });
  return value;
};

const notify = async (inquiry, action, actor) => {
  const seller = ['submitted', 'customer_follow_up', 'cancelled'].includes(action);
  const recipient = seller
    ? (await Store.findById(inquiry.store).select('owner').lean())?.owner
    : inquiry.customer;
  if (!recipient) return;
  const titles = {
    submitted: 'New pet inquiry', customer_follow_up: 'Pet inquiry follow-up',
    seller_reply: 'Seller replied to your pet inquiry',
    information_requested: 'More information requested',
    resolved: 'Pet inquiry resolved', cancelled: 'Pet inquiry cancelled'
  };
  await createNotification({
    recipient, sender: actor, type: 'user_action', title: titles[action],
    message: `Inquiry about ${inquiry.petSnapshot.name}: ${inquiry.subject}`,
    relatedId: inquiry._id, relatedModel: 'PetInquiry',
    targetUrl: seller ? sellerLink(inquiry) : customerLink(inquiry)
  });
};

const list = async (req, res) => {
  try {
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(30, Number.parseInt(req.query.limit, 10) || 10));
    let filter;
    if (req.user.role === 'customer') {
      filter = { customer: req.user._id };
      if (req.query.pet) {
        if (!idValid(req.query.pet)) return res.status(400).json({ message: 'Invalid pet identifier.' });
        filter.pet = req.query.pet;
      }
    } else if (isSeller(req.user)) {
      const storeIds = await getAuthorizedStoreIds(req.user);
      filter = { store: { $in: storeIds || [] } };
      if (req.query.status) {
        if (req.query.status === 'needs_response') {
          filter.status = { $in: ['submitted', 'awaiting_seller_response'] };
        } else {
          if (!['submitted', 'awaiting_seller_response', 'seller_responded', 'additional_information_required', 'resolved', 'cancelled'].includes(req.query.status)) {
            return res.status(400).json({ message: 'Invalid inquiry status.' });
          }
          filter.status = req.query.status;
        }
      }
    } else return res.status(403).json({ message: 'Access denied.' });
    const [inquiries, total] = await Promise.all([
      PetInquiry.find(filter).sort({ lastActivityAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PetInquiry.countDocuments(filter)
    ]);
    return res.json({ inquiries: inquiries.map(toClientInquiry), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { console.error('Pet inquiry list failed:', error); return fail(res, error); }
};

const getOne = async (req, res) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ message: 'Invalid inquiry identifier.' });
    const inquiry = await PetInquiry.findById(req.params.id).lean();
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found.' });
    const allowed = req.user.role === 'customer'
      ? String(inquiry.customer) === String(req.user._id)
      : isSeller(req.user) && await canAccessStore(req.user, inquiry.store);
    if (!allowed) return res.status(404).json({ message: 'Inquiry not found.' });
    return res.json({ inquiry: toClientInquiry(inquiry) });
  } catch (error) { console.error('Pet inquiry read failed:', error); return fail(res, error); }
};

const create = async (req, res) => {
  try {
    if (req.user.role !== 'customer') return res.status(403).json({ message: 'Only customers may ask about a pet.' });
    const requestKey = validateRequestKey(req.body.requestKey);
    const existing = await PetInquiry.findOne({ customer: req.user._id, submissionKey: requestKey });
    if (existing) return res.status(200).json({ inquiry: toClientInquiry(existing), replayed: true });
    if (!idValid(req.body.petId)) return res.status(400).json({ message: 'Invalid pet identifier.' });
    const subject = cleanText(req.body.subject, 3, 160, 'Subject');
    const question = cleanText(req.body.question, 10, 2000, 'Question');
    const pet = await Pet.findById(req.body.petId);
    if (!pet || !pet.store || !isMarketplacePet(pet) || pet.status !== 'available' || pet.isAvailable !== true) {
      return res.status(409).json({ message: 'This pet is not available for new inquiries.' });
    }
    const ownerIds = await getCustomerVisibleOwnerIds();
    const store = await Store.findOne(withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds, { _id: pet.store }))).select('_id owner');
    if (!store) return res.status(409).json({ message: 'This pet listing is not currently available for inquiries.' });
    const now = new Date();
    let inquiry;
    try {
      inquiry = await PetInquiry.create({
        pet: pet._id, customer: req.user._id, store: store._id,
        petSnapshot: { name: pet.name, image: pet.images?.[0] }, subject, question,
        submissionKey: requestKey, status: 'submitted', lastActivityAt: now,
        events: [{ kind: 'submitted', status: 'submitted', body: question, actor: req.user._id, requestKey, createdAt: now }]
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      inquiry = await PetInquiry.findOne({ customer: req.user._id, submissionKey: requestKey });
      if (!inquiry) throw error;
      return res.status(200).json({ inquiry: toClientInquiry(inquiry), replayed: true });
    }
    await notify(inquiry, 'submitted', req.user._id);
    return res.status(201).json({ inquiry: toClientInquiry(inquiry) });
  } catch (error) { console.error('Pet inquiry creation failed:', error); return fail(res, error); }
};

const act = async (req, res) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ message: 'Invalid inquiry identifier.' });
    const requestKey = validateRequestKey(req.body.requestKey);
    const inquiry = await PetInquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found.' });
    const actor = req.user.role === 'customer' && String(inquiry.customer) === String(req.user._id)
      ? 'customer'
      : isSeller(req.user) && await canAccessStore(req.user, inquiry.store) ? 'seller' : null;
    if (!actor) return res.status(404).json({ message: 'Inquiry not found.' });
    const replay = inquiry.events.some(event => event.requestKey === requestKey);
    if (replay) return res.json({ inquiry: toClientInquiry(inquiry), replayed: true });
    const rule = validateAction(req.body.action, actor, inquiry.status);
    const body = rule.body ? cleanText(req.body.body, 2, 2000, 'Message')
      : req.body.body ? cleanText(req.body.body, 2, 2000, 'Note') : undefined;
    const now = new Date();
    const updated = await PetInquiry.findOneAndUpdate({
      _id: inquiry._id, status: { $in: rule.from }, 'events.requestKey': { $ne: requestKey }
    }, {
      $set: { status: rule.to, lastActivityAt: now },
      $push: { events: { kind: req.body.action, status: rule.to, body, actor: req.user._id, requestKey, createdAt: now } }
    }, { new: true, runValidators: true });
    if (!updated) {
      const latest = await PetInquiry.findById(inquiry._id);
      if (latest?.events.some(event => event.requestKey === requestKey)) return res.json({ inquiry: toClientInquiry(latest), replayed: true });
      return res.status(409).json({ message: 'Inquiry changed. Refresh and try again.' });
    }
    await notify(updated, req.body.action, req.user._id);
    return res.json({ inquiry: toClientInquiry(updated) });
  } catch (error) { console.error('Pet inquiry action failed:', error); return fail(res, error); }
};

module.exports = { list, getOne, create, act, isSeller };
