// The verification of an identity provider's token lives in core (packages/core/src/gateway/jwt-verify.ts): core-api uses it for the ID token of a
// staff sign-in as well. Re-exported here so the gateway's imports and tests keep their path.
export { createJwtVerifier, createGatewayJwtVerifier, JwtRejected } from '@whoobe-cms/core/server';
export type { JwtRejection, JwtVerifierDeps, VerifiedToken } from '@whoobe-cms/core/server';
