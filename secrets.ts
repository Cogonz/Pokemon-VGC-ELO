// Use AWS Secret Manager to Protect API Key
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});
let cached: string | undefined;

export async function getLimitlessApiKey(): Promise<string | undefined> {
  if (cached) return cached;
  if (process.env.LIMITLESS_API_KEY) {           // local dev / explicitly set
    return (cached = process.env.LIMITLESS_API_KEY);
  }
  const secretName = process.env.LIMITLESS_SECRET_NAME;
  if (!secretName) return undefined;             // no key configured -> go unauthenticated
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!res.SecretString) return undefined;
  return (cached = res.SecretString);
}