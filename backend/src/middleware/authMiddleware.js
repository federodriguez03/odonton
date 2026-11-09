const { authenticateIdentity } = require('./identityMiddleware');

const verifyToken = authenticateIdentity;

module.exports = { verifyToken };
