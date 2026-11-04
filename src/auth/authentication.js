import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

class AuthManager {
  constructor() {
    this.user = null;
    this.profile = null;
    this.listeners = new Set();
    this.initialized = false;
  }

  onChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  notify() {
    for (const cb of this.listeners) {
      try {
        cb({ user: this.user, profile: this.profile });
      } catch {
        // ignore listener error
      }
    }
  }

  async init() {
    if (this.initialized || !supabase) return;
    this.initialized = true;

    try {
      const { data } = await supabase.auth.getSession();
      this.user = data?.session?.user || null;
      if (this.user) {
        await this.ensureProfile();
      }
      this.notify();
    } catch {
      this.user = null;
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      this.user = session?.user || null;
      if (this.user) {
        await this.ensureProfile();
      } else {
        this.profile = null;
      }
      this.notify();
    });
  }

  async ensureProfile() {
    if (!supabase || !this.user) return null;
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', this.user.id)
        .maybeSingle();

      if (existing) {
        this.profile = existing;
        return existing;
      }

      const emailPrefix = (this.user.email || 'comandante').split('@')[0];
      const displayName =
        this.user.user_metadata?.full_name ||
        this.user.user_metadata?.name ||
        emailPrefix ||
        'Comandante Aegis';
      const username = `${emailPrefix.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'cmdr'}_${this.user.id.slice(0, 6)}`;

      const { data: created } = await supabase
        .from('profiles')
        .upsert(
          {
            id: this.user.id,
            display_name: displayName,
            username,
            avatar_url: this.user.user_metadata?.avatar_url || null,
            colony_title: 'Comandante Aegis',
            last_seen_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        )
        .select('*')
        .maybeSingle();

      this.profile = created || { id: this.user.id, display_name: displayName };
      return this.profile;
    } catch {
      return null;
    }
  }

  async checkGoogleProviderEnabled() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof fetch === 'undefined') return true;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_ANON_KEY }
      });
      if (!res.ok) return true;
      const settings = await res.json();
      if (settings?.external && settings.external.google === false) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  async signInWithGoogle() {
    if (!supabase) {
      return { ok: false, reason: 'Supabase não configurado.' };
    }

    const googleEnabled = await this.checkGoogleProviderEnabled();
    if (!googleEnabled) {
      return {
        ok: false,
        providerDisabled: true,
        callbackUrl: `${SUPABASE_URL}/auth/v1/callback`,
        reason:
          'O provedor Google OAuth ainda precisa ser ativado no painel do Supabase (Authentication → Providers → Google) com seu Client ID e Client Secret do Google Cloud. Você também pode entrar imediatamente com E-mail e Senha abaixo!'
      };
    }

    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) {
      return { ok: false, reason: error.message };
    }
    return { ok: true, data };
  }

  async signInWithEmail(email, password) {
    if (!supabase) return { ok: false, reason: 'Supabase não configurado.' };
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !password) {
      return { ok: false, reason: 'Informe e-mail e senha.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) {
      return { ok: false, reason: error.message };
    }
    this.user = data.user;
    await this.ensureProfile();
    this.notify();
    return { ok: true, user: data.user };
  }

  async signUpWithEmail(email, password, displayName = 'Comandante') {
    if (!supabase) return { ok: false, reason: 'Supabase não configurado.' };
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !password || password.length < 6) {
      return { ok: false, reason: 'Informe um e-mail válido e senha com no mínimo 6 caracteres.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: displayName || 'Comandante Aegis'
        }
      }
    });

    if (error) {
      return { ok: false, reason: error.message };
    }
    this.user = data.user;
    if (this.user) {
      await this.ensureProfile();
    }
    this.notify();
    return { ok: true, user: data.user, session: data.session };
  }

  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    this.user = null;
    this.profile = null;
    this.notify();
  }
}

export const authManager = new AuthManager();
