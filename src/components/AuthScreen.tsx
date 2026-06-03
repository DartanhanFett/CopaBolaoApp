import React, { useState } from 'react';
import { Mail, User, Sparkles, ArrowRight, Check, AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthScreenProps {
  onLoginSuccess: (userName: string, userEmail: string, avatarUrl: string) => void;
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
  const [mockCodeHint, setMockCodeHint] = useState('');

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

  // Requesting the access OTP code
  const handleRequestOtp = (e: React.FormEvent) => {
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

    fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: trimmedEmail,
        isSignUp,
        name: name.trim()
      })
    })
    .then(res => res.json())
    .then(data => {
      setIsLoading(false);
      if (data.success) {
        setSuccessMsg(data.message || 'Código enviado! Verifique seu e-mail.');
        setStep('otp');
        if (data.isMock && data.mockCode) {
          setMockCodeHint(data.mockCode);
        } else {
          setMockCodeHint('');
        }
      } else {
        setErrorMsg(data.message || 'Erro ao enviar código. Verifique as informações.');
      }
    })
    .catch(err => {
      setIsLoading(false);
      setErrorMsg('Erro de conexão ao solicitar OTP.');
      console.error(err);
    });
  };

  // Verifying the OTP code
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (otpToken.trim().length < 6) {
      setErrorMsg('O código de acesso deve conter 6 números!');
      return;
    }

    setIsLoading(true);

    fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        token: otpToken.trim(),
        isSignUp,
        name: name.trim(),
        avatar: selectedAvatar
      })
    })
    .then(res => res.json())
    .then(data => {
      setIsLoading(false);
      if (data.success) {
        setSuccessMsg('Autenticado com sucesso! Entrando no bolão...');
        setTimeout(() => {
          onLoginSuccess(data.user.name, data.user.id, data.user.avatar);
        }, 1200);
      } else {
        setErrorMsg(data.message || 'Código incorreto ou expirado da verificação.');
      }
    })
    .catch(err => {
      setIsLoading(false);
      setErrorMsg('Erro de conexão ao verificar código.');
      console.error(err);
    });
  };

  const handleProviderLogin = (provider: 'Google' | 'Apple') => {
    setErrorMsg('');
    setIsLoading(true);
    
    const mockEmail = provider === 'Google' ? 'dartanhan.fett@gmail.com' : 'lucas.apple@example.com';
    const mockName = provider === 'Google' ? 'Dartanhan Fett' : 'Lucas Cupertino';
    const mockPic = provider === 'Google' 
      ? 'https://api.dicebear.com/7.x/adventurer/svg?seed=Dartanhan'
      : 'https://api.dicebear.com/7.x/adventurer/svg?seed=Dusty';

    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mockEmail, name: mockName, avatar: mockPic })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        return fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: mockEmail })
        }).then(r => r.json());
      }
      return data;
    })
    .then(data => {
      setIsLoading(false);
      if (data.success) {
        setSuccessMsg(`Conectado com sucesso via ${provider}!`);
        setTimeout(() => {
          onLoginSuccess(data.user.name, data.user.id, data.user.avatar);
        }, 1000);
      } else {
        setErrorMsg('Erro na autenticação social rápida.');
      }
    })
    .catch(() => {
      setIsLoading(false);
      setErrorMsg('Erro ao tentar conectar via login social.');
    });
  };

  return (
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
              Sem senhas fracas! Use o código mágico direto em seu e-mail para palpitar e gerenciar liguas da Copa.
            </p>
          </div>
        </div>

        {/* Dynamic Card */}
        <motion.div
          layout
          className="bg-slate-900 border border-slate-800/85 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
          id="auth-card"
        >
          {/* Back glows */}
          <div className="absolute top-0 right-0 -mr-12 -mt-12 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          {step === 'form' ? (
            <div id="auth-step-form">
              {/* Tab selectors */}
              <div className="flex bg-slate-950 rounded-xl p-1 mb-6 border border-slate-850" id="auth-tabs">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    !isSignUp ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  id="tab-login"
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    isSignUp ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  id="tab-signup"
                >
                  Criar Conta
                </button>
              </div>

              <form onSubmit={handleRequestOtp} className="space-y-4" id="form-request-otp">
                {/* Display Name for sign up */}
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

                {/* Email input */}
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

                {/* Avatar picker (Only on Sign Up for cool game-like personality!) */}
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
                          className={`relative rounded-full block transition-transform active:scale-95 ${
                            selectedAvatar === url ? 'ring-2 ring-emerald-400' : 'opacity-70 hover:opacity-100'
                          }`}
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

                {/* Status alerts */}
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

                {/* Submit to send OTP */}
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
                      <span>{isSignUp ? 'Solicitar Código de Cadastro' : 'Receber Código por E-mail'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            // STEP: OTP Code Verification UI
            <div id="auth-step-verify">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('form');
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition"
                    id="btn-back-form"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar / Mudar E-mail</span>
                  </button>
                </div>

                <div className="text-center space-y-1 mb-4" id="otp-instruction-header">
                  <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    <span>Digite o Código de Segurança</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Enviamos um código para o endereço <strong className="text-emerald-400">{email}</strong>.
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-4" id="form-verify-otp">
                  <div className="space-y-2">
                    <label className="block text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Código de 6 dígitos
                    </label>
                    <input
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      placeholder="000000"
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full text-center font-mono font-extrabold text-2xl tracking-[0.5em] py-3 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl outline-none transition text-emerald-300"
                      id="input-otp"
                    />
                  </div>

                  {/* Simulator Testing badge dynamically fetched */}
                  {mockCodeHint && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 text-xs flex flex-col gap-1 text-center" id="mock-badge">
                      <span className="font-bold">🧪 Ambiente de Teste Ativo</span>
                      <p className="text-[10.5px] opacity-80">
                        Como o Supabase não está totalmente provisionado, use o código de simulação:
                      </p>
                      <button
                        type="button"
                        onClick={() => setOtpToken(mockCodeHint)}
                        className="mt-1 bg-emerald-500 text-slate-950 py-1 px-2 rounded-lg font-mono font-bold hover:bg-emerald-400 active:scale-95 transition"
                      >
                        Autopreencher {mockCodeHint}
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
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-lime-400 hover:from-emerald-400 hover:to-lime-300 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 transition font-extrabold text-slate-950 text-xs rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                    id="btn-submit-verify"
                  >
                    {isLoading ? (
                      <span>Validando...</span>
                    ) : (
                      <>
                        <span>Confirmar Código e Entrar ⚽</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Social Logins divider */}
          <div className="my-5 flex items-center justify-between text-xs text-slate-500">
            <span className="border-b border-slate-800 w-1/4"></span>
            <span>ou continue com</span>
            <span className="border-b border-slate-800 w-1/4"></span>
          </div>

          {/* Providers Group */}
          <div className="grid grid-cols-2 gap-3" id="auth-social-logins">
            {/* Google */}
            <button
              onClick={() => handleProviderLogin('Google')}
              className="py-2 px-3 bg-slate-950 hover:bg-slate-850 text-slate-350 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-2"
              id="btn-google"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.3.6 4.6 1.8l2.4-2.4C17.3 1.7 14.9 1 12.24 1c-5.5 0-10 4.5-10 10s4.5 10 10 10c5.5 0 10-4.5 10-10 0-.6-.1-1.2-.2-1.715H12.24z"/>
              </svg>
              <span>Google</span>
            </button>

            {/* Apple ID */}
            <button
              onClick={() => handleProviderLogin('Apple')}
              className="py-2 px-3 bg-slate-950 hover:bg-slate-850 text-slate-350 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-2"
              id="btn-apple"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.2.67-2.92 1.5-.61.73-1.14 1.87-1 2.99 1.1.08 2.25-.59 2.93-1.43z"/>
              </svg>
              <span>Apple ID</span>
            </button>
          </div>

        </motion.div>

        {/* Informative Footer */}
        <div className="text-center text-[10px] text-slate-600 space-y-1">
          <p>Ao criar conta você aceita os termos de zoeira, palpites e responsabilidades esportivas.</p>
          <p className="font-semibold text-slate-500">Desenvolvido com carinho por Dartanhan & Amigos</p>
        </div>
      </div>
    </div>
  );
}
