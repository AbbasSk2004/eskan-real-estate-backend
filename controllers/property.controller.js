const multer = require('multer');
const propertyService = require('../services/property.service');
const recommendationService = require('../services/recommendation.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
}).array('images', 10);

const handleUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: 'File upload failed' });
    }
    next();
  });
};

const getFeaturedProperties = async (req, res) => {
  try {
    const data = await propertyService.getFeaturedProperties();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching featured properties', err);
    res.status(500).json({ success: false, message: 'Failed to fetch featured properties' });
  }
};

const getRecommendedProperties = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));

    // Identity comes from the session cookie and the visitor cookie only. A
    // client-supplied `user_id` query param is deliberately ignored: honouring
    // it would let anyone read anyone else's personalized feed by guessing an
    // id. Legacy clients may still send it; it is simply inert.
    const result = await recommendationService.getRecommendations({
      userId: req.user?._id || null,
      visitorId: req.visitorId || null,
      limit
    });

    // Personalized payloads must never be shared. Without this, a CDN or
    // Next.js ISR could hand one visitor's ranked list to everyone else.
    res.set('Cache-Control', 'private, no-store');

    // `data` is unchanged for legacy clients (the mobile app reads it
    // directly); `source` and `personalized` are additive.
    res.json({
      success: true,
      data: result.properties,
      source: result.source,
      personalized: result.personalized
    });
  } catch (err) {
    console.error('Error fetching recommended properties', err);

    // The homepage must render even if ranking fails, so degrade to the
    // admin-curated list rather than returning an error the carousel shows.
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));
      const data = await propertyService.getRecommendedProperties(limit);
      res.set('Cache-Control', 'private, no-store');
      return res.json({ success: true, data, source: 'curated', personalized: false });
    } catch (fallbackErr) {
      console.error('Recommendation fallback also failed', fallbackErr);
      return res.status(500).json({ success: false, message: 'Failed to fetch recommended properties' });
    }
  }
};

const getUserProperties = async (req, res) => {
  try {
    const data = await propertyService.getUserProperties(req.user._id);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching user properties', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your properties' });
  }
};

const listProperties = async (req, res) => {
  try {
    // Admins get the owner's email/phone; everyone else must not (see
    // populateOwner in property.service.js). The admin routes mount these same
    // handlers behind requireRole('admin'), so the role on req.user is the
    // authoritative signal — the mount path is not visible here.
    const data = await propertyService.listProperties(req.query, {
      includeOwnerContact: req.user?.role === 'admin'
    });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching properties', err);
    res.status(500).json({ success: false, message: 'Failed to fetch properties' });
  }
};

const getProperty = async (req, res) => {
  try {
    const property = await propertyService.getPropertyById(req.params.id, {
      includeOwnerContact: req.user?.role === 'admin'
    });
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    res.json({ success: true, data: property });
  } catch (err) {
    console.error('Error fetching property', err);
    res.status(500).json({ success: false, message: 'Failed to fetch property details' });
  }
};

const addFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    await propertyService.addFavorite({ propertyId: req.params.id, userId });
    res.status(201).json({ success: true, message: 'Property added to favorites' });
  } catch (err) {
    console.error('Error adding favorite', err);
    res.status(500).json({ success: false, message: 'Failed to add property to favorites' });
  }
};

const createProperty = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: 'Request body is required' });
    }

    const ownerId = req.user?.role === 'admin' && req.body.ownerId ? req.body.ownerId : req.user._id;
    const property = await propertyService.createProperty({
      ownerId,
      payload: req.body,
      files: req.files || []
    });

    res.status(201).json({ success: true, message: 'Property created successfully', data: property });
  } catch (err) {
    console.error('Error creating property', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create property' });
  }
};

const updateProperty = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: 'Request body is required' });
    }

    const property = await propertyService.updateProperty({
      propertyId: req.params.id,
      payload: req.body,
      files: req.files || []
    });

    res.json({ success: true, message: 'Property updated successfully', data: property });
  } catch (err) {
    console.error('Error updating property', err);
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message || 'Failed to update property' });
  }
};

const deleteProperty = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    await propertyService.deleteProperty({ propertyId: req.params.id, userId, userRole });
    res.json({ success: true, message: 'Property deleted successfully' });
  } catch (err) {
    console.error('Error deleting property', err);
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this property' });
    }
    res.status(500).json({ success: false, message: err.message || 'Failed to delete property' });
  }
};

module.exports = {
  getFeaturedProperties,
  getRecommendedProperties,
  getUserProperties,
  listProperties,
  getProperty,
  addFavorite,
  createProperty,
  updateProperty,
  deleteProperty,
  handleUpload
};
