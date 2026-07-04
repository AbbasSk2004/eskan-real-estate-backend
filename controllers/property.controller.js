const multer = require('multer');
const propertyService = require('../services/property.service');

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
    const data = await propertyService.getRecommendedProperties();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching recommended properties', err);
    res.status(500).json({ success: false, message: 'Failed to fetch recommended properties' });
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
    const data = await propertyService.listProperties(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching properties', err);
    res.status(500).json({ success: false, message: 'Failed to fetch properties' });
  }
};

const getProperty = async (req, res) => {
  try {
    const property = await propertyService.getPropertyById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    res.json({ success: true, data: property });
  } catch (err) {
    console.error('Error fetching property', err);
    res.status(500).json({ success: false, message: 'Failed to fetch property details' });
  }
};

const recordPropertyView = async (req, res) => {
  try {
    const userId = req.user?._id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    await propertyService.recordPropertyView({ propertyId: req.params.id, userId, ipAddress });
    res.status(201).json({ success: true, message: 'Property view recorded' });
  } catch (err) {
    console.error('Error recording property view', err);
    res.status(500).json({ success: false, message: 'Failed to record property view' });
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
  recordPropertyView,
  addFavorite,
  createProperty,
  updateProperty,
  deleteProperty,
  handleUpload
};
