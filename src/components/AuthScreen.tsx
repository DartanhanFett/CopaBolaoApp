import React, { useState } from 'react';
import { Mail, User, Sparkles, ArrowRight, Check, AlertCircle, ArrowLeft, MailCheck, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSupabase } from '../../lib/supabase/client';
import { apiJson } from '../lib/api';
import PrivacyPolicy from './PrivacyPolicy';

interface AuthScreenProps {
  onLoginSuccess: () => void; // Parent reads /api/auth/me and updates sessionUser
}

export default function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otpToken, setOtpToken] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [hasSupabase] = useState<boolean>(() => !!getSupabase());
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Pre-calculated beautiful mock avatars to let users register and choose
  const mockAvatars = [
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Sophia',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Jack',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Dusty',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Toby',
  ];
  const [selectedAvatar, setSelectedAvatar] = useState(mockAvatars[0]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMsg('Por favor, informe seu endereço de e-mail!');
      return;
    }
    if (isSignUp && !name.trim()) {
      setErrorMsg('Adicione o seu nome ou apelido para o ranking!');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        // Supabase not configured — fall back to legacy server-mediated OTP for local dev.
        const data = await apiJson<{ success: boolean; message?: string; isMock?: boolean; mockCode?: string }>(
          '/api/auth/otp/send',
          { method: 'POST', body: JSON.stringify({ email: trimmedEmail, isSignUp, name: name.trim() }) }
        );
        if (!data.success) throw new Error(data.message || 'Erro ao enviar código.');
        setSuccessMsg(data.message || 'Modo simulação ativo: use 123456');
        setStep('otp');
        return;
      }

      // Real Supabase OTP — token arrives by email.
      // emailRedirectTo points the magic link back to the current page so it works
      // even if the user clicks the link instead of typing the 6-digit code.
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: isSignUp,
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        const friendly = error.message?.toLowerCase().includes('rate')
          ? 'Muitos pedidos seguidos. Aguarde um minuto e tente de novo.'
          : 'Erro ao enviar o código de acesso. Tente novamente.';
        throw new Error(friendly);
      }
      setSuccessMsg('Link enviado! Confira seu e-mail (incluindo a pasta de spam).');
      setStep('otp');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de conexão ao solicitar OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // OAuth login (Google). Uses Supabase's hosted authorize endpoint, which redirects
  // the browser to Google, then back to our origin with a session cookie. The
  // onAuthStateChange listener in App.tsx picks up the new session and calls /api/auth/me.
  const handleOAuthLogin = async (provider: 'google') => {
    setErrorMsg('');
    setSuccessMsg('');
    const supabase = getSupabase();
    if (!supabase) {
      setErrorMsg('Login social requer Supabase configurado.');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        const msg = error.message?.toLowerCase().includes('provider')
          ? `Login com ${provider} não está habilitado no Supabase. Veja Authentication → Providers.`
          : `Erro ao iniciar login com ${provider}.`;
        throw new Error(msg);
      }
      // Browser will redirect to Google; nothing else to do here.
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado.');
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (otpToken.trim().length < 6) {
      setErrorMsg('O código de acesso deve conter 6 números!');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = getSupabase();
      const trimmedEmail = email.trim().toLowerCase();

      if (!supabase) {
        // Legacy fallback (no Supabase env vars).
        const data = await apiJson<{ success: boolean; message?: string }>(
          '/api/auth/otp/verify',
          {
            method: 'POST',
            body: JSON.stringify({
              email: trimmedEmail,
              token: otpToken.trim(),
              isSignUp,
              name: name.trim(),
              avatar: selectedAvatar,
            }),
          }
        );
        if (!data.success) throw new Error(data.message || 'Código incorreto.');
        setSuccessMsg('Autenticado com sucesso! Entrando no bolão...');
        setTimeout(() => onLoginSuccess(), 800);
        return;
      }

      // Real Supabase verify. Either type works; "email" covers both signup and login flows in Supabase.
      const { data: verifyData, error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: otpToken.trim(),
        type: 'email',
      });
      if (error || !verifyData.session) {
        throw new Error('Código incorreto ou expirado. Solicite um novo código.');
      }

      // Upsert profile row (server reads the JWT we just received).
      try {
        await apiJson('/api/db/users', {
          method: 'POST',
          body: JSON.stringify({
            id: trimmedEmail,
            name: name.trim() || trimmedEmail.split('@')[0],
            avatar: selectedAvatar,
          }),
        });
      } catch (profileErr: any) {
        // Don't block login if profile upsert fails — /api/auth/me will create on demand.
        console.warn('Profile upsert failed (continuing):', profileErr?.message);
      }

      setSuccessMsg('Autenticado com sucesso! Entrando no bolão...');
      setTimeout(() => onLoginSuccess(), 800);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao verificar código de acesso.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center px-4 py-8" id="auth-screen">
      <div className="w-full max-w-md mx-auto space-y-6" id="auth-container">

        {/* Branding Title */}
        <div className="text-center space-y-2" id="auth-header">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.6 }}
            className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-2xl relative overflow-hidden ring-2 ring-emerald-500/55 border border-emerald-400/25 mx-auto"
            id="auth-logo"
          >
            <div className="absolute inset-0.5 bg-gradient-to-t from-emerald-500/10 to-transparent rounded-[14px]" />
            <span className="text-3.5xl select-none filter drop-shadow-[0_4px_12px_rgba(16,185,129,0.4)]">⚽</span>
            <Sparkles className="absolute top-2 right-2 w-3.5 h-3.5 text-lime-400 animate-pulse" />
          </motion.div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-white" id="auth-title">
              CopaBolão <span className="text-emerald-400 font-medium text-xs font-mono">PWA</span>
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto" id="auth-desc">
              Sem senhas fracas! Receba um link de acesso direto no seu e-mail para palpitar e gerenciar bolões da Copa.
            </p>
          </div>
        </div>

        {/* Dynamic Card */}
        <motion.div
          layout
          className="bg-slate-900 border border-slate-800/85 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
          id="auth-card"
        >
          <div className="absolute top-0 right-0 -mr-12 -mt-12 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          {step === 'form' ? (
            <div id="auth-step-form">
              {/* Tab selectors */}
              <div className="flex bg-slate-950 rounded-xl p-1 mb-6 border border-slate-850" id="auth-tabs">
                <button
                  type="button"
                  onClick={() => { setIsSignUp(false); setErrorMsg(''); setSuccessMsg(''); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${!isSignUp ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                  id="tab-login"
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => { setIsSignUp(true); setErrorMsg(''); setSuccessMsg(''); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${isSignUp ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                  id="tab-signup"
                >
                  Criar Conta
                </button>
              </div>

              <form onSubmit={handleRequestOtp} className="space-y-4" id="form-request-otp">
                <AnimatePresence mode="popLayout">
                  {isSignUp && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 overflow-hidden"
                      id="signup-name-field"
                    >
                      <label className="block text-xs font-semibold text-slate-400">
                        Seu Nome ou Apelido *
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Ex: Alan Kardec"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-150 outline-none transition"
                          id="input-name"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5" id="form-email-field">
                  <label className="block text-xs font-semibold text-slate-400">
                    Endereço de E-mail *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      placeholder="Seu principal e-mail"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-150 outline-none transition"
                      id="input-email"
                    />
                  </div>
                </div>

                {isSignUp && (
                  <div className="space-y-2 pt-1" id="form-avatar-picker">
                    <label className="block text-xs font-semibold text-slate-400">
                      Selecione seu Avatar
                    </label>
                    <div className="flex gap-2 items-center justify-between bg-slate-950/60 p-2 rounded-xl border border-slate-850">
                      {mockAvatars.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setSelectedAvatar(url)}
                          className={`relative rounded-full block transition-transform active:scale-95 ${selectedAvatar === url ? 'ring-2 ring-emerald-400' : 'opacity-70 hover:opacity-100'}`}
                        >
                          <img src={url} alt="avatar" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                          {selectedAvatar === url && (
                            <span className="absolute -bottom-1 -right-1 bg-emerald-400 text-slate-950 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center text-[8px] font-bold">
                              ✓
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-400 flex items-center gap-2" id="alert-error">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs font-semibold text-emerald-400 flex items-center gap-2" id="alert-success">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-2.5 bg-gradient-to-r from-emerald-500 to-lime-400 hover:from-emerald-400 hover:to-lime-300 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 transition font-extrabold text-slate-950 text-xs rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                  id="btn-send-otp"
                >
                  {isLoading ? (
                    <span>Enviando código...</span>
                  ) : (
                    <>
                      <span>{isSignUp ? 'Criar Conta e Receber Link' : 'Receber Link de Acesso'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div id="auth-step-verify">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-2">
                  <button
                    type="button"
                    onClick={() => { setStep('form'); setErrorMsg(''); setSuccessMsg(''); }}
                    className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition"
                    id="btn-back-form"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar / Mudar E-mail</span>
                  </button>
                </div>

                {/* Email-link flow: Supabase free tier sends a magic-link email (not a 6-digit code).
                    The user clicks the link in the email and lands back here authenticated.
                    No code input — keeps the UX honest about what actually happens. */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-center space-y-3" id="otp-instruction-card">
                  <div className="w-12 h-12 mx-auto bg-emerald-500/15 border border-emerald-500/25 rounded-2xl flex items-center justify-center">
                    <MailCheck className="w-6 h-6 text-emerald-400" />
                  </div>

                  <h3 className="text-base font-extrabold text-white">
                    Confira seu e-mail
                  </h3>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Enviamos um link de acesso para
                    <br />
                    <strong className="text-emerald-400">{email}</strong>
                  </p>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-left text-[11px] text-slate-300 space-y-2 leading-relaxed">
                    <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <ExternalLink className="w-3 h-3" />
                      Como entrar:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-400">
                      <li>Abra o e-mail que acabou de chegar (verifique também a pasta de spam).</li>
                      <li>Clique no botão / link <strong className="text-slate-200">"Sign in"</strong>.</li>
                      <li>Você será redirecionado de volta já autenticado.</li>
                    </ol>
                    <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                      Importante: clique no link no <strong>mesmo dispositivo</strong> em que você está abrindo o app.
                    </p>
                  </div>
                </div>

                {/* Mock-mode helper — only shown when running without Supabase configured.
                    Lets local devs continue testing without setting up secrets. */}
                {!hasSupabase && (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-3 text-xs flex flex-col gap-2 text-center" id="mock-badge">
                    <span className="font-bold">🧪 Modo simulação (sem Supabase)</span>
                    <p className="text-[10.5px] opacity-80">
                      Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY no .env para OTP real. Por enquanto, digite <strong>123456</strong> abaixo:
                    </p>
                    <input
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full text-center font-mono font-bold text-base tracking-[0.4em] py-2 bg-slate-950 border border-slate-800 rounded-lg outline-none text-amber-300"
                    />
                    <button
                      type="button"
                      onClick={(e) => handleVerifyOtp(e as any)}
                      disabled={isLoading}
                      className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 py-1.5 rounded-lg font-mono font-bold transition active:scale-95"
                    >
                      {isLoading ? 'Validando...' : 'Entrar (modo simulação)'}
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-400 flex items-center gap-2" id="verify-error">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs font-semibold text-emerald-400 flex items-center gap-2" id="verify-success">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => { setStep('form'); setOtpToken(''); setSuccessMsg(''); setErrorMsg(''); }}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                >
                  Não recebi o e-mail — reenviar
                </button>
              </div>
            </div>
          )}

          {/* Social login. Google goes through Supabase OAuth. We considered Apple
              ID too but it requires the paid Apple Developer Program — pulled out
              until that becomes worth it. */}
          <div className="my-5 flex items-center justify-between text-xs text-slate-500">
            <span className="border-b border-slate-800 w-1/4"></span>
            <span>ou continue com</span>
            <span className="border-b border-slate-800 w-1/4"></span>
          </div>
          <div id="auth-social">
            <button
              type="button"
              onClick={() => handleOAuthLogin('google')}
              disabled={isLoading}
              className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-900 disabled:opacity-50 text-slate-200 hover:text-white border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Continuar com Google</span>
            </button>
          </div>
        </motion.div>

        <div className="text-center text-[10px] text-slate-600 space-y-1">
          <p>
            Ao criar conta você concorda com os{' '}
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-emerald-400 hover:text-emerald-300 underline font-bold"
            >
              Termos & Privacidade
            </button>
            .
          </p>
          <p className="font-semibold text-slate-500">Desenvolvido com carinho por Dartanhan & Amigos</p>
        </div>
      </div>
    </div>
    </>
  );
}
