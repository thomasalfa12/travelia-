/**
 * src/middleware/authMiddleware.ts
 * Middleware untuk memverifikasi Token JWT dari header Authorization.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Menambahkan properti 'user' ke tipe Request Express
export interface AuthRequest extends Request {
  user?: {
    userId: number;
    driverProfileId: number;
    role: string;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) {
    return res.sendStatus(401); // Unauthorized
  }

  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    return res.status(500).json({ error: "JWT_SECRET tidak dikonfigurasi di server." });
  }

  jwt.verify(token, secretKey, (err: any, user: any) => {
    if (err) {
      return res.sendStatus(403); // Forbidden (token tidak valid)
    }
    req.user = user; // Simpan data user dari token ke dalam request
    next(); // Lanjutkan ke controller berikutnya
  });
}
