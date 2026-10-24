import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'veyra_hotel_secure_jwt_secret_key_2026';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', details: err.message });
  }
}

/**
 * Role-based access middleware
 * Admin has access to everything
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = (req.user.role_code || req.user.role || '').toLowerCase();
    
    // Administrator can access everything
    if (userRole === 'admin' || userRole === 'administrator') {
      return next();
    }

    const hasPermission = allowedRoles.some(r => {
      const norm = r.toLowerCase().replace(/\s+/g, '');
      const userNorm = userRole.replace(/\s+/g, '');
      return norm === userNorm || userNorm.includes(norm);
    });

    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions for this portal' });
    }

    next();
  };
}

export function generateToken(user, keepSigned = false) {
  const expiresIn = keepSigned ? '30d' : '24h';
  return jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role_name,
      role_code: user.role_code,
    },
    JWT_SECRET,
    { expiresIn }
  );
}
