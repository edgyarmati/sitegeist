import type { NextFunction, Request, Response } from "express";
import { unsealData } from "iron-session";
import { apiRoutes } from "../shared/api.js";

export interface SessionData {
	authenticated: boolean;
}

const SESSION_COOKIE_NAME = "sitegeist_session";

/**
 * Create auth middleware that checks for valid session cookie
 * Uses route definitions to determine which endpoints require auth
 */
export function createAuthMiddleware(getIronSecret: () => string | null) {
	return async (req: Request, res: Response, next: NextFunction) => {
		// Check if this route requires auth based on apiRoutes
		const routePath = req.path;

		const routeEntry = Object.values(apiRoutes).find((route) => {
			// Match both path and method
			const pattern = route.path.replace(/:[^/]+/g, "[^/]+");
			const pathMatches = new RegExp(`^${pattern}$`).test(routePath);
			const methodMatches = route.method === req.method;
			return pathMatches && methodMatches;
		});

		// If route doesn't require auth, allow it
		if (routeEntry && !routeEntry.auth) {
			return next();
		}

		// Route requires auth - get current iron secret
		const ironSecret = getIronSecret();

		// If no iron secret set, setup hasn't been completed
		// Return 403 to indicate setup is needed
		if (!ironSecret) {
			return res.status(403).json({ error: "Setup required - complete setup first" });
		}

		// Check for session cookie
		const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME];

		if (!sessionCookie) {
			return res.status(401).json({ error: "Authentication required" });
		}

		try {
			// Unseal and verify session
			const session = await unsealData<SessionData>(sessionCookie, {
				password: ironSecret,
			});

			if (!session.authenticated) {
				return res.status(401).json({ error: "Invalid session" });
			}

			// Session valid, continue
			next();
		} catch (error) {
			console.error("Session validation error:", error);
			res.status(401).json({ error: "Invalid session" });
		}
	};
}

/**
 * Get Iron secret configuration
 */
export function getIronConfig(ironSecret: string) {
	return {
		password: ironSecret,
		cookieName: SESSION_COOKIE_NAME,
		cookieOptions: {
			secure: process.env.NODE_ENV === "production",
			httpOnly: true,
			sameSite: "strict" as const,
			maxAge: 365 * 24 * 60 * 60, // 1 year
			path: "/",
		},
	};
}
