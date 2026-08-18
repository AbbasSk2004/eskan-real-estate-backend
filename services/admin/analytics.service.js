const Property = require('../../models/property.model');
const PropertyView = require('../../models/propertyView.model');
const PropertyInquiry = require('../../models/propertyInquiry.model');

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

const overview = async ({ startDate, endDate }) => {
  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);

  const filterByDate = (field) => {
    const filter = {};
    if (parsedStart) filter[field] = { ...filter[field], $gte: parsedStart };
    if (parsedEnd) filter[field] = { ...filter[field], $lte: parsedEnd };
    return filter;
  };

  const [totalProperties, totalViews, totalInquiries] = await Promise.all([
    Property.countDocuments({ ...(parsedStart || parsedEnd ? filterByDate('createdAt') : {}) }),
    PropertyView.countDocuments({ ...(parsedStart || parsedEnd ? filterByDate('viewedAt') : {}) }),
    PropertyInquiry.countDocuments({ ...(parsedStart || parsedEnd ? filterByDate('createdAt') : {}) })
  ]);

  const conversionRate = totalViews > 0 ? Number(((totalInquiries / totalViews) * 100).toFixed(2)) : 0;

  return { totalProperties, totalViews, totalInquiries, conversionRate };
};

const propertyViewsByMonth = async ({ startDate, endDate }) => {
  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);

  const match = {};
  if (parsedStart) match.viewedAt = { ...(match.viewedAt || {}), $gte: parsedStart };
  if (parsedEnd) match.viewedAt = { ...(match.viewedAt || {}), $lte: parsedEnd };

  const views = await PropertyView.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $month: '$viewedAt' },
        count: { $sum: 1 }
      }
    }
  ]);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const counts = Array(12).fill(0);
  views.forEach((v) => {
    const idx = (v._id || 1) - 1;
    if (idx >= 0 && idx < 12) counts[idx] = v.count;
  });

  return { labels: months, datasets: [{ label: 'Property Views', data: counts }] };
};

const propertyListingsByMonth = async ({ startDate, endDate }) => {
  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);

  const match = {};
  if (parsedStart) match.createdAt = { ...(match.createdAt || {}), $gte: parsedStart };
  if (parsedEnd) match.createdAt = { ...(match.createdAt || {}), $lte: parsedEnd };

  const listings = await Property.aggregate([
    { $match: match },
    {
      $group: {
        _id: { month: { $month: '$createdAt' }, status: '$status' },
        count: { $sum: 1 }
      }
    }
  ]);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const forSale = Array(12).fill(0);
  const forRent = Array(12).fill(0);

  listings.forEach((item) => {
    const monthIdx = (item._id.month || 1) - 1;
    const status = (item._id.status || '').toLowerCase();
    if (status.includes('sale')) {
      forSale[monthIdx] += item.count;
    } else if (status.includes('rent')) {
      forRent[monthIdx] += item.count;
    }
  });

  return { labels: months, datasets: [
    { label: 'For Sale', data: forSale, backgroundColor: 'rgba(78, 115, 223, 0.8)' },
    { label: 'For Rent', data: forRent, backgroundColor: 'rgba(28, 200, 138, 0.8)' }
  ] };
};

const propertyTypesDistribution = async ({ startDate, endDate }) => {
  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);

  const match = {};
  if (parsedStart) match.createdAt = { ...(match.createdAt || {}), $gte: parsedStart };
  if (parsedEnd) match.createdAt = { ...(match.createdAt || {}), $lte: parsedEnd };

  const types = await Property.aggregate([
    { $match: match },
    { $group: { _id: '$propertyType', count: { $sum: 1 } } }
  ]);

  const labels = types.map((t) => t._id || 'Unknown');
  const data = types.map((t) => t.count);

  return { labels, datasets: [{ data, backgroundColor: ['rgba(78, 115, 223, 0.8)', 'rgba(28, 200, 138, 0.8)', 'rgba(54, 185, 204, 0.8)', 'rgba(246, 194, 62, 0.8)', 'rgba(231, 74, 59, 0.8)'] }] };
};

const topPerformingProperties = async ({ limit = 5, startDate, endDate }) => {
  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);

  const match = {};
  if (parsedStart) match.createdAt = { ...(match.createdAt || {}), $gte: parsedStart };
  if (parsedEnd) match.createdAt = { ...(match.createdAt || {}), $lte: parsedEnd };

  const views = await PropertyView.aggregate([
    { $match: parsedStart || parsedEnd ? { viewedAt: match.createdAt || {} } : {} },
    { $group: { _id: '$propertyId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: Number(limit) }
  ]);

  const propertyIds = views.map((v) => v._id).filter(Boolean);
  const properties = await Property.find({ _id: { $in: propertyIds } }).select('title');
  const propertyMap = new Map(properties.map((p) => [p._id, p.title]));

  const data = views.map((v) => ({
    id: v._id,
    title: propertyMap.get(v._id) || 'Unknown Property',
    views: v.count
  }));

  return data;
};

module.exports = {
  overview,
  propertyViewsByMonth,
  propertyListingsByMonth,
  propertyTypesDistribution,
  topPerformingProperties
};
