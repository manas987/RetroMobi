// flespi -- read-only passthrough. No telemetry is stored in our own DB; we
// always ask flespi for the latest position when a user asks for it.
export interface TrackerClient {
  getLastPosition(
    deviceIdentifier: string,
  ): Promise<{ lat: number; lng: number; timestamp: string; battery: number | null } | null>;
}

function getConfig(): { token: string; baseUrl: string } | null {
  const token = process.env.FLESPI_TOKEN;
  const baseUrl = process.env.FLESPI_BASE_URL ?? "https://flespi.io";
  if (!token) return null;
  return { token, baseUrl };
}

export const trackerClient: TrackerClient = {
  async getLastPosition(deviceIdentifier) {
    const config = getConfig();
    if (!config) {
      console.log(`[dev-fallback] flespi.getLastPosition not configured — faking a position for ${deviceIdentifier}`);
      // Mussoorie -- same coordinates the test fixtures seed shops with.
      return { lat: 30.3165, lng: 78.0322, timestamp: new Date().toISOString(), battery: 80 };
    }
    const { token, baseUrl } = config;
    const response = await fetch(
      `${baseUrl}/gw/devices/${deviceIdentifier}/messages?data=%7B%22count%22%3A1%7D`,
      { headers: { Authorization: `FlespiToken ${token}` } },
    );
    if (!response.ok) {
      throw new Error(`flespi getLastPosition failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as {
      result?: Array<{
        "position.latitude"?: number;
        "position.longitude"?: number;
        timestamp?: number;
        "battery.level"?: number;
      }>;
    };
    const message = body.result?.[0];
    if (!message || message["position.latitude"] == null || message["position.longitude"] == null) {
      return null;
    }
    return {
      lat: message["position.latitude"],
      lng: message["position.longitude"],
      timestamp: new Date((message.timestamp ?? 0) * 1000).toISOString(),
      battery: message["battery.level"] ?? null,
    };
  },
};
