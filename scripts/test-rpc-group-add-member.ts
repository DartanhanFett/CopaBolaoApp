/**
 * Smoke test for the copabolao_group_add_member RPC.
 *
 * What we check:
 *   1. The function exists (no "function does not exist" / 404).
 *   2. Calling it on a non-existent group returns an empty array (not an error).
 *   3. Calling it with a real group:
 *      - First call adds the email to members[].
 *      - Second call (same email) is a no-op — members[] doesn't grow.
 *   4. Cleanup: remove the test email so the prod data stays untouched.
 *
 * Uses the service_role key from .env to bypass RLS — required because the
 * RPC runs as the caller and our RLS policies don't allow random updates.
 * The key is read from process.env, never logged or echoed.
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TEST_EMAIL = `__rpc_smoke_${Date.now()}@example.invalid`;

async function pickRealGroupId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("copabolao_groups")
    .select("id, name")
    .eq("deleted", false)
    .limit(1);
  if (error) {
    console.error("Falha ao listar grupos:", error.message);
    return null;
  }
  if (!data || data.length === 0) {
    console.error("Nenhum grupo ativo no banco — não dá pra testar a RPC.");
    return null;
  }
  console.log(`Vai usar bolão real para o teste: ${data[0].id} (${data[0].name})`);
  return data[0].id;
}

async function readMembers(groupId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("copabolao_groups")
    .select("members")
    .eq("id", groupId)
    .single();
  if (error) throw new Error(`readMembers: ${error.message}`);
  return Array.isArray(data?.members) ? (data!.members as string[]) : [];
}

async function main() {
  console.log("\n=== TESTE 1: RPC existe ===");
  // Chamada com group inexistente — sucesso = []. Erro com "does not exist"
  // significa que a função não foi instalada.
  const ghost = await supabase.rpc("copabolao_group_add_member", {
    p_group_id: "__id_que_nao_existe_xyz__",
    p_user_email: TEST_EMAIL,
  });
  if (ghost.error) {
    const msg = ghost.error.message.toLowerCase();
    if (msg.includes("does not exist") || msg.includes("could not find")) {
      console.error("❌ RPC NÃO INSTALADA. Rode a migration no SQL Editor.");
      console.error("   Mensagem:", ghost.error.message);
      process.exit(2);
    }
    console.error("❌ RPC retornou erro inesperado:", ghost.error.message);
    process.exit(3);
  }
  console.log(`✅ RPC respondeu. Retornou ${(ghost.data as any[])?.length ?? 0} linhas (esperado 0).`);

  console.log("\n=== TESTE 2: Adicionar membro ===");
  const groupId = await pickRealGroupId();
  if (!groupId) process.exit(4);

  const before = await readMembers(groupId);
  console.log(`Membros antes: ${before.length}`);

  const add1 = await supabase.rpc("copabolao_group_add_member", {
    p_group_id: groupId,
    p_user_email: TEST_EMAIL,
  });
  if (add1.error) {
    console.error("❌ Erro ao adicionar:", add1.error.message);
    process.exit(5);
  }
  const after1 = await readMembers(groupId);
  if (!after1.includes(TEST_EMAIL)) {
    console.error("❌ Email não apareceu em members[] depois do RPC.");
    process.exit(6);
  }
  if (after1.length !== before.length + 1) {
    console.error(`❌ Tamanho esperado ${before.length + 1}, veio ${after1.length}`);
    process.exit(7);
  }
  console.log(`✅ Email adicionado (${after1.length} membros agora).`);

  console.log("\n=== TESTE 3: Idempotência (mesmo email duas vezes) ===");
  const add2 = await supabase.rpc("copabolao_group_add_member", {
    p_group_id: groupId,
    p_user_email: TEST_EMAIL,
  });
  if (add2.error) {
    console.error("❌ Erro na segunda chamada:", add2.error.message);
    process.exit(8);
  }
  const after2 = await readMembers(groupId);
  if (after2.length !== after1.length) {
    console.error(`❌ Idempotência quebrada: era ${after1.length}, virou ${after2.length}`);
    process.exit(9);
  }
  console.log(`✅ Segunda chamada não duplicou (${after2.length} membros, igual antes).`);

  console.log("\n=== CLEANUP ===");
  // Remove o email de teste do array. Sem isso o bolão fica com lixo "@example.invalid".
  const cleaned = after2.filter((m) => m !== TEST_EMAIL);
  const { error: cleanupErr } = await supabase
    .from("copabolao_groups")
    .update({ members: cleaned })
    .eq("id", groupId);
  if (cleanupErr) {
    console.error("⚠️  Falha no cleanup — remover manualmente o email:", TEST_EMAIL);
    console.error("    Erro:", cleanupErr.message);
  } else {
    console.log(`✅ Email de teste removido do bolão.`);
  }

  console.log("\n🎉 Todos os testes passaram. RPC pronta pra produção.\n");
}

main().catch((e) => {
  console.error("Falha inesperada:", e);
  process.exit(99);
});
