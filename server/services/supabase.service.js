const { StorageClient } = require('@supabase/storage-js');

// Cuma butuh Storage API (upload banner/logo) — pakai @supabase/storage-js langsung,
// BUKAN @supabase/supabase-js penuh. createClient() dari supabase-js selalu inisialisasi
// RealtimeClient (WebSocket) di constructor-nya meski tidak pernah dipakai, dan itu throw
// synchronous error di Node < 22 ("native WebSocket not found") — VPS masih Node 20.
// StorageClient tidak punya dependency ke Realtime sama sekali, jadi aman di Node manapun.
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const storage = new StorageClient(`${process.env.SUPABASE_URL}/storage/v1`, {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  });
  supabase = { storage };
}

module.exports = { supabase };
