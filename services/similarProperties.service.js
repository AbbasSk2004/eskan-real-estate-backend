const propertyService = require('./property.service');

/**
 * Get similar properties based on simple heuristics.
 *
 * - Same property type
 * - Same city/governorate
 * - Similar price range (+/- 20%)
 *
 * Excludes the original property.
 */
const getSimilarProperties = async (propertyId, limit = 4) => {
  const property = await propertyService.getPropertyById(propertyId);
  if (!property) return [];

  const price = Number(property.price) || 0;
  const priceRange = price > 0 ? 0.2 : 0;

  const filters = {
    propertyType: property.property_type || property.propertyType || undefined,
    city: property.city || undefined,
    governorate: property.governate || property.governorate || undefined,
    status: property.status || undefined,
    priceMin: price > 0 ? Math.max(0, price - price * priceRange) : undefined,
    priceMax: price > 0 ? price + price * priceRange : undefined
  };

  const result = await propertyService.listProperties({
    ...filters,
    page: 1,
    pageSize: limit
  });

  if (!result || !Array.isArray(result.properties)) return [];

  return result.properties.filter((p) => p.id !== propertyId).slice(0, limit);
};

module.exports = {
  getSimilarProperties
};
