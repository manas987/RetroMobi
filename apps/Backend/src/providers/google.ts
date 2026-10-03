import { OAuth2Client } from "google-auth-library";

export interface GoogleIdentity {
  email: string;
  name: string;
  googleSub: string;
}

function getClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
  return new OAuth2Client(clientId);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  try {
    const client = getClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) return null;

    return {
      email: payload.email,
      name: payload.name ?? "",
      googleSub: payload.sub,
    };
  } catch {
    return null;
  }
}
