require('dotenv').config();

const { createApp } = require('./app');
const { getConfig } = require('./config');

const config = getConfig();
const app = createApp(config);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`${config.serviceName} listening on port ${config.port}`);
});
