/**
 * Thin compat shim — canonical path is /api/owner/invitations.
 * Old platform-admin teacher invites are now owner→admin invites.
 */
export { GET, POST } from "../../owner/invitations/route";
