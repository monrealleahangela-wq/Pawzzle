const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const PetProfile = require('../models/PetProfile');
const Store = require('../models/Store');
const {
  getCustomerVisibleOwnerIds,
  buildCustomerVisibleStoreFilter,
  withCustomerComplianceFilter
} = require('../utils/storeVisibility');
const {
  buildCustomerProductStockFilter,
  hasCustomerAvailableStock
} = require('../services/customerProductAvailabilityService');
const { getCustomerVariantReadiness } = require('../services/customerVariantReadinessService');
const { listCustomerVariants } = require('../services/customerProductVariantService');
const { lifeStageForProfile, rankProductsForPet } = require('../services/productRecommendationService');

const normalizeCandidateProduct = async product => {
  if (product.productMode !== 'variant') return hasCustomerAvailableStock(product) ? product.toObject() : null;
  const catalog = await listCustomerVariants(product);
  const inStockVariants = catalog.variants.filter(variant => variant.inStock);
  if (!hasCustomerAvailableStock(product, catalog.variants) || !inStockVariants.length) return null;
  const object = product.toObject();
  return {
    ...object,
    normalizedVariants: catalog.variants,
    variantCapabilities: {
      browsingEnabled: catalog.browsingEnabled,
      purchasingEnabled: catalog.purchasingEnabled
    },
    price: Math.min(...inStockVariants.map(variant => Number(variant.price))),
    stockQuantity: catalog.variants.reduce((sum, variant) => sum + Number(variant.availableQuantity || 0), 0),
    images: inStockVariants[0]?.images?.length ? inStockVariants[0].images : object.images
  };
};

const getCustomerProductRecommendations = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

    const allProfiles = await PetProfile.find({ owner: req.user._id })
      .sort({ lastBookedAt: -1, createdAt: -1 })
      .lean();
    const selectedProfiles = req.body.petProfileId
      ? allProfiles.filter(profile => String(profile._id) === String(req.body.petProfileId))
      : allProfiles.slice(0, 1);
    if (req.body.petProfileId && !selectedProfiles.length) {
      return res.status(404).json({ message: 'The selected pet profile was not found in your account.' });
    }

    const ownerIds = await getCustomerVisibleOwnerIds();
    const stores = await Store.find(withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds))).select('_id');
    const storeIds = stores.map(store => store._id);
    const variantReadiness = await getCustomerVariantReadiness();
    const filter = {
      isActive: true,
      isDeleted: { $ne: true },
      visibility: { $nin: ['draft', 'hidden'] },
      store: { $in: storeIds }
    };
    if (!variantReadiness.browsingEnabled) filter.productMode = { $ne: 'variant' };
    filter.$and = [await buildCustomerProductStockFilter({
      storeIds,
      variantBrowsingEnabled: variantReadiness.browsingEnabled
    })];

    const productDocuments = await Product.find(filter)
      .populate('store', 'name logo contactInfo.address')
      .sort({ 'ratings.average': -1, createdAt: -1 })
      .limit(200);
    const products = (await Promise.all(productDocuments.map(normalizeCandidateProduct))).filter(Boolean);
    const ranked = rankProductsForPet({
      products,
      petProfiles: selectedProfiles,
      budget: req.body.budget,
      category: req.body.category || 'all',
      limit: 12
    });

    return res.json({
      ...ranked,
      selectedPetProfileId: req.body.petProfileId || null,
      petProfiles: allProfiles.map(profile => ({
        _id: profile._id,
        name: profile.name,
        type: profile.type,
        breed: profile.breed,
        size: profile.size,
        lifeStage: lifeStageForProfile(profile)
      })),
      methodology: 'Rule-based filtering removes unsafe or incompatible products. Weighted content matching ranks declared species, breed, life stage, size, weight, activity, coat, skin, dietary, allergy, and benefit information.',
      disclaimer: 'Compatibility scores are shopping guidance, not medical or scientific guarantees. Health and wellness products are not treatments; consult a veterinarian for allergies, illness, or therapeutic needs.'
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Product recommendation error:', error);
    return res.status(500).json({ message: 'Unable to calculate personalized product recommendations.' });
  }
};

module.exports = { getCustomerProductRecommendations, normalizeCandidateProduct };
