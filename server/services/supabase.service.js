const { createClient } = require('@supabase/supabase-js');

// Lazy/guarded: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY belum di-set di .env saat ini.
// Jangan crash seluruh server hanya karena fitur upload belum dikonfigurasi.
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = { supabase };
