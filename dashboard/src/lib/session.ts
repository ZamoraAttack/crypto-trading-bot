import { SessionOptions } from "iron-session";

export interface SessionData {
  username?: string;
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.DASHBOARD_JWT_SECRET || "fallback-secret-change-this-immediately",
  cookieName: "crypto-bot-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 60 * 24,  // 24 hours
  },
};
