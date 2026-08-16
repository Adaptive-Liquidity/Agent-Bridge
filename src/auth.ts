import { timingSafeEqual } from "node:crypto";

export function isExpectedBearerToken(
  authorization: string | undefined,
  bearerToken: string,
): boolean {
  if (authorization === undefined) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${bearerToken}`);
  const received = Buffer.from(authorization);

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}
