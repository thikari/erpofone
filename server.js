require('dotenv').config();
require('express-async-errors');
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  require('./src/lib/watcher').start().catch(err => console.error('[watcher] startup error:', err.message));

  app.listen(PORT, () => {
    console.log(`\n🚀 ErpofOne running → http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   MongoDB: connected\n`);
  });
}).catch(err => {
  console.error('❌ Failed to connect to MongoDB:', err.message);
  process.exit(1);
});
