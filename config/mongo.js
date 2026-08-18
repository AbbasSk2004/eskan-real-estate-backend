const mongoose = require('mongoose');


const connectToMongo = async () => {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;

  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  const options = {
    dbName: dbName || undefined,
    autoIndex: process.env.NODE_ENV !== 'production',
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000
  };

  try {
    await mongoose.connect(mongoUri, options);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error', err);
    throw err;
  }
};

const disconnectMongo = async () => {
  await mongoose.disconnect();
};

module.exports = {
  connectToMongo,
  disconnectMongo,
  mongoose
};
