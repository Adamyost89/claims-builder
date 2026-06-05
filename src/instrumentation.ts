export async function register() {
  const { ensureStorageReady } = await import("@/server/storage/adapter");
  await ensureStorageReady();
}
