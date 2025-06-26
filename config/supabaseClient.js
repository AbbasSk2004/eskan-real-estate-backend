const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Check if required environment variables are present
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

// Auth options for OAuth
const authOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js'
    }
  }
};

// Create public Supabase client (for unauthenticated operations)
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, authOptions);

// Create authenticated Supabase client (for authenticated operations)
const supabase = createClient(supabaseUrl, supabaseAnonKey, authOptions);

module.exports = { supabase, supabasePublic };