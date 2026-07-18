import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://schdtmdpgexsacxzozso.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjaGR0bWRwZ2V4c2FjeHpvenNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzI1MjMsImV4cCI6MjA5OTEwODUyM30.OT0YaKOmPwnQcfvqqwRut6aJFJ98k_pdOiE4yTUmitY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session);
  });
  return data.subscription;
}

export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}
