const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function requireRole(requiredRoles = []) {
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/, '');
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!requiredRoles.includes(decoded.role)) return res.status(403).json({ error: 'forbidden' });
      req.user = decoded;
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  };
}

module.exports = { requireRole };

