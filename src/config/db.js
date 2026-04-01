const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/paperclip-hq';
  await mongoose.connect(uri);
  console.log(`   MongoDB → ${uri}`);
};

module.exports = connectDB;
