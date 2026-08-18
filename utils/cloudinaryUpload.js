const { cloudinary, buildFolderPath } = require('../config/cloudinary');
const { slugifyTitle } = require('./slugify');
const { Readable } = require('stream');

const bufferToStream = (buffer) => {
  const readable = new Readable();
  readable._read = () => {}; // _read is required but can be a noop
  readable.push(buffer);
  readable.push(null);
  return readable;
};

const uploadToCloudinary = async ({ buffer, folder, filename, resourceType = 'image' }) => {
  const config = cloudinary.config();
  const isConfigured = config.cloud_name && config.cloud_name !== '...' && 
                       config.api_key && config.api_key !== '...' && 
                       config.api_secret && config.api_secret !== '...';

  if (!isConfigured) {
    return Promise.reject(new Error('Cloudinary is not configured correctly. Please update CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the environment variables.'));
  }

  const uploadFolder = buildFolderPath(folder);
  const publicId = filename.replace(/\.[^/.]+$/, '');

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: uploadFolder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true,
        use_filename: false,
        unique_filename: false
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error', error);
          if (error.message && error.message.includes('Unexpected token')) {
            return reject(new Error('Cloudinary returned an invalid response. This is usually caused by an incorrect cloud name in your environment variables.'));
          }
          return reject(error);
        }
        resolve(result);
      }
    );

    bufferToStream(buffer).pipe(uploadStream);
  });
};

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (err) {
    console.error('Cloudinary delete error', err);
    throw err;
  }
};

const deleteFolderFromCloudinary = async (folderPath) => {
  try {
    const result = await cloudinary.api.delete_folder(folderPath);
    return result;
  } catch (err) {
    console.error('Cloudinary delete folder error', err);
    throw err;
  }
};

// Taxonomy: all assets live under the eskan_realestate root namespace.
const PROPERTIES_ROOT = 'eskan_realestate/properties';
const PROFILES_ROOT = 'eskan_realestate/profiles';

const buildPropertyFolder = (title) => buildFolderPath(PROPERTIES_ROOT, slugifyTitle(title));

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  deleteFolderFromCloudinary,
  slugifyTitle,
  buildPropertyFolder,
  PROPERTIES_ROOT,
  PROFILES_ROOT
};
