import { supabase } from './supabaseClient';

let running = false;

async function runPrompt() {
  if (running) return;
  running = true;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;
    await supabase.rpc('ec_send_login_verification_prompt');
  } catch (error) {
    console.warn('[verification-prompt]', error?.message || error);
  } finally {
    running = false;
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(() => void runPrompt(), 150);
});

window.addEventListener('focus', () => void runPrompt());
setTimeout(() => void runPrompt(), 300);

export {};
