require('dotenv').config();

const express = require('express');
const { getConfig } = require('./config');
const requestContext = require('./middleware/request-context');
const errorHandler = require('./middleware/error-handler');
const healthRoutes = require('./routes/health');
const placeholderRoutes = require('./routes/bookings');

function createApp(configOverride) {
  const app = express();
  const config = configOverride || getConfig();

  app.locals.config = config;

  app.use(express.json());
  app.use(requestContext);

  app.use('/', healthRoutes);
  app.use('/api', placeholderRoutes);

  app.use((req, _res, next) => {
    const err = new Error('Not Found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    next(err);
  });

  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};
