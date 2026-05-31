const records = new Map();

export async function getIdempotencyRecord(key) {
  if (!key) return null;
  return records.get(key) || null;
}

export async function saveIdempotencyRecord(key, value) {
  if (!key) return;
  records.set(key, {
    ...value,
    savedAt: new Date().toISOString()
  });
}

