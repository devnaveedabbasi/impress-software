import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 8000,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.EXPIRES_IN
  },
  allowedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://192.168.1.4:3000",
    "http://192.168.1.9:3000",
  ],
  adminSecret: process.env.ADMIN_SECRET,
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true' || false,
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD
  }
};