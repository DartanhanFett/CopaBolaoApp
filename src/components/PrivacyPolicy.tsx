import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';

interface PrivacyPolicyProps {
  onClose: () => void;
}

/**
 * Minimal privacy notice for the demo.
 * Plain Portuguese so non-tech users understand what we collect.
 * Update before any public release beyond friends-only demo.
 */
export default function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 overflow-y-auto">
      <div className="max-w-md mx-auto px-5 py-6 text-slate-200">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-emerald-400 transition mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h1 className="text-xl font-black text-white">Termos & Privacidade</h1>
        </div>
        <p className="text-[11px] text-slate-500 mb-6">Última atualização: junho de 2026</p>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-extrabold text-emerald-400 mt-4">O que é o CopaBolão?</h2>
          <p>
            O CopaBolão é um app de uso pessoal para amigos brincarem com palpites de jogos da Copa do
            Mundo. <strong>Não há dinheiro real envolvido.</strong> A "taxa de entrada" exibida no
            grupo é apenas um valor de referência simbólico que vocês combinam offline.
          </p>

          <h2 className="text-base font-extrabold text-emerald-400 mt-4">Quais dados coletamos?</h2>
          <ul className="list-disc pl-5 space-y-1 text-slate-300">
            <li><strong>Email:</strong> usado como identificador único e para enviar o código de acesso (OTP).</li>
            <li><strong>Nome/apelido</strong> e <strong>avatar:</strong> exibidos no ranking e nos comentários.</li>
            <li><strong>Palpites e comentários:</strong> visíveis para outros membros do mesmo bolão.</li>
          </ul>

          <h2 className="text-base font-extrabold text-emerald-400 mt-4">Não coletamos</h2>
          <ul className="list-disc pl-5 space-y-1 text-slate-300">
            <li>Senhas (autenticação é por código OTP).</li>
            <li>Dados de localização, contatos, câmera, microfone.</li>
            <li>Informações financeiras.</li>
          </ul>

          <h2 className="text-base font-extrabold text-emerald-400 mt-4">Onde os dados ficam?</h2>
          <p>
            Em um banco Supabase (Postgres) hospedado em servidores nos EUA. Conexões usam HTTPS. O
            envio do código OTP por email passa pelo serviço de email do Supabase.
          </p>

          <h2 className="text-base font-extrabold text-emerald-400 mt-4">Seus direitos (LGPD)</h2>
          <p>
            Você pode pedir a exclusão da sua conta a qualquer momento na tela de Perfil → "Excluir
            conta". Isso remove você dos rankings e marca seu perfil como deletado. Para qualquer
            outra dúvida ou pedido sobre seus dados, fale com o administrador deste bolão.
          </p>

          <h2 className="text-base font-extrabold text-emerald-400 mt-4">Limites desta versão</h2>
          <p>
            Este é um app de demo entre amigos. Não oferecemos garantia de disponibilidade, backup
            ou suporte profissional. Se planejarmos um lançamento público, esta política será
            atualizada com termos completos.
          </p>
        </section>

        <button
          onClick={onClose}
          className="mt-8 w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition active:scale-95"
        >
          Entendi, voltar
        </button>
      </div>
    </div>
  );
}
