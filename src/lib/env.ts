export function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function optEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
