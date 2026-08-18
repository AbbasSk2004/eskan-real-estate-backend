// Slugifies a title into a safe URL/Cloudinary segment:
// lowercase, spaces -> hyphens, strips special characters, keeps Arabic
// letters, falls back to "property" when nothing usable remains.
const slugifyTitle = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06ff-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'property';

module.exports = {
  slugifyTitle
};