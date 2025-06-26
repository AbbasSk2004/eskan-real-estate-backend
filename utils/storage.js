const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Upload a file to Supabase storage
 * @param {Object} file - The file object from multer
 * @param {string} bucket - The storage bucket name
 * @param {string} filePath - The path within the bucket
 * @returns {Promise<string>} The public URL of the uploaded file
 */
const uploadToSupabaseStorage = async (file, bucket, filePath) => {
  try {
    if (!file || !bucket || !filePath) {
      throw new Error('Missing required parameters');
    }

    // Ensure forward slashes and clean the path
    const cleanPath = filePath.replace(/\\/g, '/');

    // Upload file to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(cleanPath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (uploadError) {
      logger.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl }, error: urlError } = await supabase.storage
      .from(bucket)
      .getPublicUrl(cleanPath);

    if (urlError || !publicUrl) {
      throw new Error('Failed to get public URL');
    }

    // Return the full public URL as a string
    return publicUrl;

  } catch (error) {
    logger.error('File upload error:', error);
    throw error;
  }
};

/**
 * Delete a file from Supabase storage
 * @param {string} bucket - The storage bucket name
 * @param {string} filePath - The path within the bucket
 * @returns {Promise<void>}
 */
const deleteFromSupabaseStorage = async (bucket, filePath) => {
  try {
    if (!bucket || !filePath) {
      throw new Error('Missing required parameters');
    }

    // Ensure forward slashes and clean the path
    const cleanPath = filePath.replace(/\\/g, '/');

    // Delete file from Supabase storage
    const { error } = await supabase.storage
      .from(bucket)
      .remove([cleanPath]);

    if (error) {
      logger.error('Delete error:', error);
      throw error;
    }

    logger.info(`Successfully deleted file: ${cleanPath} from bucket: ${bucket}`);
  } catch (error) {
    logger.error('File deletion error:', error);
    throw error;
  }
};

module.exports = {
  uploadToSupabaseStorage,
  deleteFromSupabaseStorage
};
