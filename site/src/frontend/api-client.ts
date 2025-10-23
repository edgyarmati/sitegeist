import type { Api } from "../shared/api.js";
import { apiRoutes } from "../shared/api.js";

// Allow custom fetch implementation (e.g., for tests with cookie jar)
type FetchFunction = typeof fetch;

// Auto-generate API client from route definitions
export function createApiClient(baseUrl: string = "/api", customFetch?: FetchFunction): Api {
	const fetchFn = customFetch || fetch;

	// biome-ignore lint/suspicious/noExplicitAny: fine
	const client = {} as any;

	for (const [methodName, route] of Object.entries(apiRoutes)) {
		// biome-ignore lint/suspicious/noExplicitAny: fine
		client[methodName] = async (...args: any[]) => {
			// Build path by replacing :param with actual values
			let path = route.path;
			let argIndex = 0;

			// Extract path params (e.g., :id)
			const pathParams = route.path.match(/:\w+/g) || [];
			for (const param of pathParams) {
				param.slice(1); // Remove :
				path = path.replace(param, encodeURIComponent(args[argIndex++]));
			}

			// Remaining args are body (for POST/PATCH/DELETE) or query params (for GET)
			const body = argIndex < args.length ? args[argIndex] : undefined;

			// For GET requests with a parameter, add it as a query param
			if (route.method === "GET" && body !== undefined && body !== null && body !== "") {
				const queryParam = typeof body === "string" ? body : JSON.stringify(body);
				path += `?path=${encodeURIComponent(queryParam)}`;
			}

			// Build headers
			const headers: Record<string, string> = {};

			// Send JSON for POST/PATCH/DELETE with body
			if (body && (route.method === "POST" || route.method === "PATCH" || route.method === "DELETE")) {
				headers["Content-Type"] = "application/json";
			}

			// Make request with credentials to include httpOnly cookies
			let response: Response;
			try {
				response = await fetchFn(`${baseUrl}${path}`, {
					method: route.method,
					headers,
					credentials: "include", // Include httpOnly cookies
					body: body && route.method !== "GET" ? JSON.stringify(body) : undefined,
				});
			} catch (_err) {
				// Network error (connection refused, DNS failure, etc.)
				throw new Error(`Server at ${baseUrl} running?`);
			}

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`API error: ${error}`);
			}

			// Handle void responses (204)
			if (response.status === 204 || response.headers.get("content-length") === "0") {
				return undefined;
			}

			return response.json();
		};
	}

	return client as Api;
}
