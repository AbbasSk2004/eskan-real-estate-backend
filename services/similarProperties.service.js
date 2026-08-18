const propertyService = require('./property.service');

/**
 * Similar properties for the detail page: strict same-type matching only.
 *
 * Matches the visited property's exact `propertyType` and nothing else — no
 * price/location/AI heuristics and no cross-type fallback. If a type has thin
 * inventory, returning fewer than `limit` (or []) is the intended result, not
 * a bug.
 *
 * Excludes the visited property itself and any sold listing. Verified-only and
 * newest-first are inherited from `listProperties` (verified defaults to true;
 * default sort is `createdAt: -1`). Routing through the service also preserves
 * the `toResponse` shaping the frontend relies on — raw documents would omit
 * `main_image`, `property_type`, `id`, owner, and the other legacy fields.
 */
const getSimilarProperties = async (propertyId, limit = 4) => {
  const property = await propertyService.getPropertyById(propertyId);
  if (!property) return [];

  const propertyType = property.property_type || property.propertyType;
  if (!propertyType) return [];

  const result = await propertyService.listProperties({
    propertyType,
    page: 1,
    // Over-fetch a small buffer so removing the visited property and any sold
    // listing below still tends to fill `limit` on healthy inventory.
    pageSize: limit + 4
  });

  if (!result || !Array.isArray(result.properties)) return [];

  // `propertyId` may have been a slug, so compare against the resolved id.
  return result.properties
    .filter((p) => p.id !== property.id && p.status !== 'sold')
    .slice(0, limit);
};

module.exports = {
  getSimilarProperties
};
