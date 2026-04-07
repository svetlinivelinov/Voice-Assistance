function ok(res, data = {}, status = 200) {
  return res.status(status).json({ data });
}

function error(res, code, message, details = {}, status = 400) {
  return res.status(status).json({
    error: {
      code,
      message,
      details
    }
  });
}

module.exports = {
  ok,
  error
};
