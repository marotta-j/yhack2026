export function getLavaForwardToken(): string {
  const secretKey = process.env.LAVA_SECRET_KEY;
  if (!secretKey) throw new Error("LAVA_SECRET_KEY is not set");
  return secretKey;
}
