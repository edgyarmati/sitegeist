import type { EmailSignup, SignupRequest, SignupResponse } from "./types.js";

// Health check response
export interface HealthResponse {
	status: "healthy";
	timestamp: string;
}

// Status response
export interface StatusResponse {
	setupRequired: boolean;
}

// Setup/Login request
export interface AuthRequest {
	password: string;
}

// API interface - shared contract between client and server
export interface Api {
	// Public endpoints (no auth required)
	health(): Promise<HealthResponse>;
	signup(request: SignupRequest): Promise<SignupResponse>;
	status(): Promise<StatusResponse>;

	// Setup & Auth (no auth required)
	// biome-ignore lint/suspicious/noExplicitAny: fine
	setup(request: AuthRequest, ...extra: any[]): Promise<void>;
	// biome-ignore lint/suspicious/noExplicitAny: fine
	login(request: AuthRequest, ...extra: any[]): Promise<void>;
	// biome-ignore lint/suspicious/noExplicitAny: fine
	logout(...extra: any[]): Promise<void>;

	// Admin endpoints (auth required)
	listSignups(): Promise<EmailSignup[]>;
}

// Route definitions - used to auto-generate client and server
export interface RouteDefinition {
	method: "GET" | "POST" | "PATCH" | "DELETE";
	path: string;
	auth: boolean; // true = requires authentication
}

export const apiRoutes: Record<keyof Api, RouteDefinition> = {
	// Public endpoints
	health: { method: "GET", path: "/health", auth: false },
	signup: { method: "POST", path: "/signup", auth: false },
	status: { method: "GET", path: "/status", auth: false },

	// Setup & Auth
	setup: { method: "POST", path: "/setup", auth: false },
	login: { method: "POST", path: "/login", auth: false },
	logout: { method: "POST", path: "/logout", auth: false },

	// Admin endpoints
	listSignups: { method: "GET", path: "/admin/signups", auth: true },
};

// Helper types
export type ApiMethod = keyof Api;
export type ApiRequest<M extends ApiMethod> = Parameters<Api[M]>;
export type ApiResponse<M extends ApiMethod> = Awaited<ReturnType<Api[M]>>;
