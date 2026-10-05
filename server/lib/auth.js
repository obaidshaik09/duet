import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'duet-dev-secret-change-me';
const COOKIE = 'duet_token';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' },
  );
}

export function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      return jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
      return null;
    }
  }
  const cookie = req.cookies?.[COOKIE];
  if (!cookie) return null;
  try {
    return jwt.verify(cookie, JWT_SECRET);
  } catch {
    return null;
  }
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

export function requireAuth(req, res, next) {
  const payload = readToken(req);
  if (!payload?.sub) {
    return res.status(401).json({ error: { message: 'Please sign in.' } });
  }
  req.user = { id: payload.sub, email: payload.email, name: payload.name };
  next();
}

export { COOKIE, JWT_SECRET };
