/**
 * Cloudflare Access JWT Authentication
 * 
 * Extracts user identity from Cloudflare Access JWT tokens.
 * The JWT is automatically added by Access in the `Cf-Access-Jwt-Assertion` header.
 */

export interface AccessUser {
	/** Unique user identifier (sub claim) */
	id: string;
	/** User's email address */
	email: string;
	/** Identity provider name */
	identityProvider?: string;
	/** Full name if available */
	name?: string;
	/** Raw JWT claims */
	claims: AccessJwtPayload;
}

export interface AccessJwtPayload {
	/** Audience - your Access application AUD tag */
	aud: string[];
	/** Subject - unique user identifier */
	sub: string;
	/** Email address */
	email: string;
	/** Issued at timestamp */
	iat: number;
	/** Expiration timestamp */
	exp: number;
	/** Issuer */
	iss: string;
	/** Identity provider */
	identity_nonce?: string;
	/** Custom claims from identity provider */
	custom?: Record<string, unknown>;
	/** User's name (if provided by IdP) */
	name?: string;
	/** Given name */
	given_name?: string;
	/** Family name */
	family_name?: string;
}

/**
 * Extract user identity from Cloudflare Access JWT.
 * 
 * Note: In production, you should verify the JWT signature using your Access
 * application's public keys from the certs endpoint. For simplicity, this
 * implementation trusts the JWT since it's already validated by Access at the edge.
 * 
 * @param request - The incoming request with Access JWT header
 * @returns User identity or null if not authenticated
 */
export function getAccessUser(request: Request): AccessUser | null {
	const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
	
	if (!jwt) {
		return null;
	}

	try {
		// JWT format: header.payload.signature
		const parts = jwt.split(".");
		if (parts.length !== 3) {
			console.error("Invalid JWT format");
			return null;
		}

		// Decode the payload (middle part)
		const payload = JSON.parse(atob(parts[1])) as AccessJwtPayload;

		// Check expiration
		if (payload.exp && payload.exp < Date.now() / 1000) {
			console.error("JWT has expired");
			return null;
		}

		// Build user object
		const user: AccessUser = {
			id: payload.sub,
			email: payload.email,
			name: payload.name || payload.given_name 
				? `${payload.given_name || ""} ${payload.family_name || ""}`.trim()
				: undefined,
			claims: payload,
		};

		return user;
	} catch (error) {
		console.error("Failed to parse Access JWT:", error);
		return null;
	}
}

/**
 * Require authentication - returns user or throws 401 response.
 */
export function requireAuth(request: Request): AccessUser {
	const user = getAccessUser(request);
	
	if (!user) {
		throw new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	return user;
}

/**
 * Get user identity header for development/testing.
 * In dev mode without Access, you can set a custom header.
 */
export function getDevUser(request: Request): AccessUser | null {
	const devEmail = request.headers.get("X-Dev-User-Email");
	
	if (!devEmail) {
		return null;
	}

	return {
		id: `dev_${devEmail}`,
		email: devEmail,
		name: "Dev User",
		claims: {
			aud: ["dev"],
			sub: `dev_${devEmail}`,
			email: devEmail,
			iat: Date.now() / 1000,
			exp: Date.now() / 1000 + 3600,
			iss: "dev",
		},
	};
}

/**
 * Get user from Access JWT or dev header (for local development).
 */
export function getUser(request: Request, allowDev = false): AccessUser | null {
	// Try Access JWT first
	const accessUser = getAccessUser(request);
	if (accessUser) {
		return accessUser;
	}

	// Fall back to dev user in development
	if (allowDev) {
		return getDevUser(request);
	}

	return null;
}
