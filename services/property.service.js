const Property = require('../models/property.model');
const Favorite = require('../models/favorite.model');
const PropertyView = require('../models/propertyView.model');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');

const buildPropertyQuery = ({
  propertyType,
  status,
  governorate,
  city,
  village,
  priceMin,
  priceMax,
  areaMin,
  areaMax,
  bedrooms,
  bathrooms,
  features,
  keyword,
  verified = true,
  isFeatured,
  recommended,
  ownerId
}) => {
  const filter = {};

  if (verified !== false) {
    filter.verified = true;
  }
  if (typeof verified === 'boolean') {
    filter.verified = verified;
  }
  if (typeof isFeatured === 'boolean') {
    filter.isFeatured = isFeatured;
  }
  if (typeof recommended === 'boolean') {
    filter.recommended = recommended;
  }
  if (ownerId) {
    filter.ownerId = ownerId;
  }
  if (propertyType) {
    filter.propertyType = propertyType;
  }
  if (status) {
    filter.status = status;
  }
  if (governorate) {
    filter.governorate = governorate;
  }
  if (city) {
    filter.city = city;
  }
  if (village) {
    filter.village = village;
  }
  if (priceMin !== undefined) {
    filter.price = { ...filter.price, $gte: Number(priceMin) };
  }
  if (priceMax !== undefined) {
    filter.price = { ...filter.price, $lte: Number(priceMax) };
  }
  if (areaMin !== undefined) {
    filter.area = { ...filter.area, $gte: Number(areaMin) };
  }
  if (areaMax !== undefined) {
    filter.area = { ...filter.area, $lte: Number(areaMax) };
  }
  if (bedrooms !== undefined) {
    filter.bedrooms = { $gte: Number(bedrooms) };
  }
  if (bathrooms !== undefined) {
    filter.bathrooms = { $gte: Number(bathrooms) };
  }
  if (features) {
    const featureList = Array.isArray(features) ? features : String(features).split(',').filter(Boolean);
    if (featureList.length) {
      filter.$and = featureList.map((feature) => ({ [`features.${feature}`]: true }));
    }
  }
  if (keyword) {
    filter.title = { $regex: keyword, $options: 'i' };
  }

  return filter;
};

const buildSort = (sortBy) => {
  switch (sortBy) {
    case 'price_low':
      return { price: 1 };
    case 'price_high':
      return { price: -1 };
    case 'area_low':
      return { area: 1 };
    case 'area_high':
      return { area: -1 };
    case 'newest':
    default:
      return { createdAt: -1 };
  }
};

const populateOwner = (query) => query.populate('ownerId', 'firstName lastName profilePhoto role');

const toResponse = (propertyDoc) => {
  const property = propertyDoc.toObject ? propertyDoc.toObject({ virtuals: true }) : propertyDoc;
  const owner = property.ownerId || null;

  // Provide both camelCase and snake_case fields to support legacy frontends
  const response = {
    ...property,
    // Ensure a stable identifier for frontend usage
    id: property._id || property.id,

    // Legacy snake_case fields expected by the React UI
    main_image: property.mainImage?.url || (typeof property.mainImage === 'string' ? property.mainImage : null) || property.main_image?.url || property.main_image || null,
    property_type: property.propertyType || property.property_type || null,
    governate: property.governorate || property.governate || null,
    city: property.city || null,
    village: property.village || null,
    address: property.address || null,
    price: property.price || null,
    status: property.status || null,
    title: property.title || null,
    description: property.description || null,
    area: property.area || null,
    bedrooms: property.bedrooms || null,
    bathrooms: property.bathrooms || null,
    livingrooms: property.livingRooms || property.livingrooms || null,
    floor: property.floor || null,
    year_built: property.yearBuilt || property.year_built || null,
    parking_spaces: property.parkingSpaces || property.parking_spaces || null,
    garden_area: property.gardenArea || property.garden_area || null,
    furnishing_status: property.furnishingStatus || property.furnishing_status || null,
    shop_front_width: property.shopFrontWidth || property.shop_front_width || null,
    storage_area: property.storageArea || property.storage_area || null,
    units: property.units || null,
    elevators: property.elevators || null,
    plot_size: property.plotSize || property.plot_size || null,
    ceiling_height: property.ceilingHeight || property.ceiling_height || null,
    loading_docks: property.loadingDocks || property.loading_docks || null,
    farm_area: property.farmArea || property.farm_area || null,
    water_source: property.waterSource || property.water_source || null,
    crop_types: property.cropTypes || property.crop_types || null,
    // Keep as-is for compatibility with older clients
    is_featured: property.isFeatured || property.is_featured || false,
    verified: property.verified,
    recommended: property.recommended,
    created_at: property.createdAt || property.created_at,
    updated_at: property.updatedAt || property.updated_at,

    // Provide a stable owner reference expected by legacy UIs
    profiles_id: owner?._id || property.profiles_id || null,
    profiles: owner
      ? {
          profiles_id: owner._id,
          firstname: owner.firstName || owner.firstname || null,
          lastname: owner.lastName || owner.lastname || null,
          profile_photo: owner.profilePhoto?.url || owner.profile_photo || null,
          role: owner.role || null,
          phone: owner.phone || null,
          email: owner.email || null
        }
      : (property.profiles || {}),

    // Keep the modern agent field for newer clients
    agent: owner
      ? {
          name: `${owner.firstName || ''} ${owner.lastName || ''}`.trim(),
          photo: owner.profilePhoto?.url || null,
          role: owner.role
        }
      : null
  };

  return response;
};

const listProperties = async (queryParams = {}, options = {}) => {
  const {
    page = 1,
    pageSize = 12,
    sortBy = 'newest',
    verified,
    ...filters
  } = queryParams;

  const verifiedFlag = verified === 'false' ? false : true;
  const filter = buildPropertyQuery({ ...filters, verified: verifiedFlag });
  const sort = buildSort(sortBy);

  const [totalCount, properties] = await Promise.all([
    Property.countDocuments(filter),
    populateOwner(
      Property.find(filter)
        .sort(sort)
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
    )
  ]);

  const totalPages = Math.ceil(totalCount / Number(pageSize));

  return {
    properties: properties.map(toResponse),
    totalCount,
    totalPages,
    currentPage: Number(page),
    pageSize: Number(pageSize)
  };
};

const getFeaturedProperties = async (limit = 10) => {
  const filter = buildPropertyQuery({ isFeatured: true, verified: true });
  const properties = await populateOwner(
    Property.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
  );
  return properties.map(toResponse);
};

const getRecommendedProperties = async (limit = 6) => {
  const filter = buildPropertyQuery({ recommended: true, verified: true });
  // Ensure mainImage and description exist
  filter['mainImage.url'] = { $exists: true, $ne: '' };
  filter.description = { $exists: true, $ne: '' };

  const properties = await populateOwner(
    Property.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
  );
  return properties.map(toResponse);
};

const getUserProperties = async (userId) => {
  const filter = buildPropertyQuery({ ownerId: userId, verified: true });
  const properties = await populateOwner(Property.find(filter).sort({ createdAt: -1 }));
  return properties.map(toResponse);
};

const getPropertyById = async (id) => {
  const property = await populateOwner(Property.findById(id));
  return property ? toResponse(property) : null;
};

const createProperty = async ({ ownerId, payload, files = [] }) => {
  // Normalize fields keys (support snake_case from legacy mobile/web clients)
  const normalized = {
    ...payload,
    governorate: payload.governorate || payload.governate,
    propertyType: payload.propertyType || payload.property_type,
    status: payload.status,
    price: payload.price !== undefined ? Number(payload.price) : undefined,
    area: payload.area !== undefined ? Number(payload.area) : undefined,
    bedrooms: payload.bedrooms !== undefined ? Number(payload.bedrooms) : undefined,
    bathrooms: payload.bathrooms !== undefined ? Number(payload.bathrooms) : undefined,
    livingRooms: payload.livingRooms !== undefined ? Number(payload.livingRooms) : Number(payload.livingrooms || payload.living_rooms),
    floor: payload.floor !== undefined ? Number(payload.floor) : undefined,
    yearBuilt: payload.yearBuilt !== undefined ? Number(payload.yearBuilt) : Number(payload.year_built),
    parkingSpaces: payload.parkingSpaces !== undefined ? Number(payload.parkingSpaces) : Number(payload.parking_spaces),
    gardenArea: payload.gardenArea !== undefined ? Number(payload.gardenArea) : Number(payload.garden_area),
    meetingRooms: payload.meetingRooms !== undefined ? Number(payload.meetingRooms) : Number(payload.meeting_rooms),
    shopFrontWidth: payload.shopFrontWidth !== undefined ? Number(payload.shopFrontWidth) : Number(payload.shop_front_width),
    storageArea: payload.storageArea !== undefined ? Number(payload.storageArea) : Number(payload.storage_area),
    units: payload.units !== undefined ? Number(payload.units) : undefined,
    elevators: payload.elevators !== undefined ? Number(payload.elevators) : undefined,
    plotSize: payload.plotSize !== undefined ? Number(payload.plotSize) : Number(payload.plot_size),
    ceilingHeight: payload.ceilingHeight !== undefined ? Number(payload.ceilingHeight) : Number(payload.ceiling_height),
    loadingDocks: payload.loadingDocks !== undefined ? Number(payload.loadingDocks) : Number(payload.loading_docks),
    farmArea: payload.farmArea !== undefined ? Number(payload.farmArea) : undefined,
    price: payload.price !== undefined ? Number(payload.price) : undefined,
    features: (() => {
      if (!payload.features) return {};
      if (typeof payload.features === 'object') return payload.features;
      try {
        return JSON.parse(payload.features);
      } catch (_e) {
        return {};
      }
    })(),
    view: payload.view,
    description: payload.description,
    title: payload.title,
    address: payload.address,
    city: payload.city,
    village: payload.village,
    propertyType: payload.propertyType || payload.property_type,
    status: payload.status,
    ...(payload.verified !== undefined ? { verified: payload.verified } : {}),
    ...(payload.recommended !== undefined ? { recommended: payload.recommended } : {})
  };

  const property = new Property({
    ...normalized,
    ownerId
  });

  // Upload images (if any) and attach to property
  if (files.length) {
    const folder = `properties/${property._id}`;

    const uploaded = await Promise.all(
      files.map(async (file, index) => {
        const filename = `${property._id}-${Date.now()}-${index}`;
        const result = await uploadToCloudinary({ buffer: file.buffer, folder, filename });
        return {
          url: result.secure_url,
          publicId: result.public_id
        };
      })
    );

    property.images = uploaded;
    if (uploaded[0]) {
      property.mainImage = uploaded[0];
    }
  }

  await property.save();
  return toResponse(property);
};

const updateProperty = async ({ propertyId, payload, files = [] }) => {
  const property = await Property.findById(propertyId);
  if (!property) {
    const err = new Error('Property not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Merge payload fields (keep existing values when missing)
  const updates = {
    ...payload,
    propertyType: payload.propertyType || payload.property_type || property.propertyType,
    status: payload.status || property.status,
    price: payload.price !== undefined ? Number(payload.price) : property.price,
    area: payload.area !== undefined ? Number(payload.area) : property.area,
    bedrooms: payload.bedrooms !== undefined ? Number(payload.bedrooms) : property.bedrooms,
    bathrooms: payload.bathrooms !== undefined ? Number(payload.bathrooms) : property.bathrooms,
    livingRooms: payload.livingRooms !== undefined ? Number(payload.livingRooms) : property.livingRooms,
    floor: payload.floor !== undefined ? Number(payload.floor) : property.floor,
    yearBuilt: payload.yearBuilt !== undefined ? Number(payload.yearBuilt) : property.yearBuilt,
    parkingSpaces: payload.parkingSpaces !== undefined ? Number(payload.parkingSpaces) : property.parkingSpaces,
    gardenArea: payload.gardenArea !== undefined ? Number(payload.gardenArea) : property.gardenArea,
    meetingRooms: payload.meetingRooms !== undefined ? Number(payload.meetingRooms) : property.meetingRooms,
    shopFrontWidth: payload.shopFrontWidth !== undefined ? Number(payload.shopFrontWidth) : property.shopFrontWidth,
    storageArea: payload.storageArea !== undefined ? Number(payload.storageArea) : property.storageArea,
    units: payload.units !== undefined ? Number(payload.units) : property.units,
    elevators: payload.elevators !== undefined ? Number(payload.elevators) : property.elevators,
    plotSize: payload.plotSize !== undefined ? Number(payload.plotSize) : property.plotSize,
    ceilingHeight: payload.ceilingHeight !== undefined ? Number(payload.ceilingHeight) : property.ceilingHeight,
    loadingDocks: payload.loadingDocks !== undefined ? Number(payload.loadingDocks) : property.loadingDocks,
    farmArea: payload.farmArea !== undefined ? Number(payload.farmArea) : property.farmArea,
    features: payload.features !== undefined ? payload.features : property.features,
    title: payload.title !== undefined ? payload.title : property.title,
    description: payload.description !== undefined ? payload.description : property.description,
    address: payload.address !== undefined ? payload.address : property.address,
    city: payload.city !== undefined ? payload.city : property.city,
    village: payload.village !== undefined ? payload.village : property.village,
    verified: payload.verified !== undefined ? payload.verified : property.verified,
    recommended: payload.recommended !== undefined ? payload.recommended : property.recommended
  };

  Object.assign(property, updates);

  // Handle new images uploads
  if (files.length) {
    const folder = `properties/${property._id}`;

    const uploaded = await Promise.all(
      files.map(async (file, index) => {
        const filename = `${property._id}-${Date.now()}-${index}`;
        const result = await uploadToCloudinary({ buffer: file.buffer, folder, filename });
        return {
          url: result.secure_url,
          publicId: result.public_id
        };
      })
    );

    // Append new images
    property.images = [...(property.images || []), ...uploaded];
    if (!property.mainImage && uploaded[0]) {
      property.mainImage = uploaded[0];
    }
  }

  await property.save();
  return toResponse(await populateOwner(Property.findById(property._id)));
};

const deleteProperty = async ({ propertyId, userId, userRole }) => {
  const property = await Property.findById(propertyId);
  if (!property) {
    const err = new Error('Property not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (property.ownerId !== userId && userRole !== 'admin') {
    const err = new Error('Forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const cleanup = async () => {
    const idsToDelete = [];

    if (property.mainImage?.publicId) {
      idsToDelete.push(property.mainImage.publicId);
    }
    if (Array.isArray(property.images)) {
      property.images.forEach((img) => {
        if (img.publicId) idsToDelete.push(img.publicId);
      });
    }

    await Promise.all(idsToDelete.map((publicId) => deleteFromCloudinary(publicId).catch(() => {})));
  };

  await cleanup();
  await Property.deleteOne({ _id: propertyId });
  await Favorite.deleteMany({ propertyId });
  await PropertyView.deleteMany({ propertyId });

  return true;
};

const recordPropertyView = async ({ propertyId, userId, ipAddress }) => {
  const view = new PropertyView({
    propertyId,
    userId,
    ipAddress: ipAddress || 'unknown'
  });
  await view.save();
  return view;
};

const addFavorite = async ({ propertyId, userId }) => {
  const existing = await Favorite.findOne({ propertyId, userId });
  if (existing) {
    return existing;
  }
  const favorite = new Favorite({ propertyId, userId });
  await favorite.save();
  return favorite;
};

module.exports = {
  listProperties,
  getFeaturedProperties,
  getRecommendedProperties,
  getUserProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  recordPropertyView,
  addFavorite,
  // Helper to produce the API response shape for a property (used by other services)
  formatProperty: toResponse
};
