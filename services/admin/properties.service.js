const propertyService = require('../../services/property.service');

const listProperties = async (query) => {
  return propertyService.listProperties(query);
};

const getProperty = async (id) => {
  return propertyService.getPropertyById(id);
};

const createProperty = async ({ ownerId, payload, files }) => {
  return propertyService.createProperty({ ownerId, payload, files });
};

const updateProperty = async ({ propertyId, payload, files }) => {
  return propertyService.updateProperty({ propertyId, payload, files });
};

const deleteProperty = async ({ propertyId, userId, userRole }) => {
  return propertyService.deleteProperty({ propertyId, userId, userRole });
};

module.exports = {
  listProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty
};
