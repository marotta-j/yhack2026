export function getLavaForwardToken(): string {
  const secretKey = process.env.LAVA_SECRET_KEY;
  if (!secretKey) throw new Error("LAVA_SECRET_KEY is not set");
  return Buffer.from(JSON.stringify({ secret_key: secretKey })).toString("base64");
}

export function buildLavaUrl(providerUrl: string): string {
  return `https://api.lava.so/v1/forward?u=${encodeURIComponent(providerUrl)}`;
}
