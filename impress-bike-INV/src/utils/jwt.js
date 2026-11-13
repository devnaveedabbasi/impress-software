import jwt from "jsonwebtoken";
import config from "../config/index.js";

export function signToken(userId, role, accountType = "user") {
  return jwt.sign(
    {
      userId,
      role,
      accountType,
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
    }
  );
}