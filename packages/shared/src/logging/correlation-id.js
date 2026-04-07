const { v4: uuidv4 } = require("uuid");

function createRequestContextMiddleware() {
  return function requestContextMiddleware(req, _res, next) {
    const requestId = req.header("X-Request-Id") || uuidv4();
    req.requestId = requestId;
    next();
  };
}

module.exports = {
  createRequestContextMiddleware
};
