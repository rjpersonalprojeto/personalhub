// Edge Function "admin-users": ações que exigem a chave de serviço.
// Quem pode chamar: CEO (tudo) ou professor (somente os próprios alunos).
// Deploy: supabase functions deploy admin-users
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const DATA_TABLES = ['workouts', 'checkins', 'water', 'logs', 'cardio', 'weights', 'settings'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: me } = await admin.from('profiles').select('role,active').eq('id', user.id).single();
    if (!me?.active || !['ceo', 'trainer'].includes(me.role)) return json({ error: 'Acesso negado.' }, 403);
    const isCeo = me.role === 'ceo';

    const b = await req.json();

    // Garante que o chamador pode gerenciar o alvo
    const target = async (id: string) => {
      const { data } = await admin.from('profiles').select('role,trainer_id').eq('id', id).single();
      if (!data || data.role === 'ceo' || id === user.id) throw new Error('Usuário não permitido.');
      if (!isCeo && !(data.role === 'student' && data.trainer_id === user.id)) throw new Error('Este aluno não é seu.');
      return data;
    };

    const createUser = async (role: string, trainer_id: string | null) => {
      if (!b.email || !b.password || String(b.password).length < 6) throw new Error('E-mail e senha (mín. 6 caracteres) obrigatórios.');
      const { data, error } = await admin.auth.admin.createUser({ email: b.email, password: b.password, email_confirm: true });
      if (error) throw error;
      const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, email: b.email, name: b.name || b.email, role, active: true, trainer_id, phone: b.phone || null });
      if (e2) { await admin.auth.admin.deleteUser(data.user.id); throw e2; }
      return json({ id: data.user.id });
    };

    switch (b.action) {
      case 'createStudent':
        return createUser('student', isCeo ? (b.trainerId || user.id) : user.id);
      case 'createTrainer':
        if (!isCeo) throw new Error('Somente o CEO cadastra professores.');
        return createUser('trainer', null);
      case 'resetPassword': {
        await target(b.id);
        if (String(b.password).length < 6) throw new Error('Senha muito curta.');
        const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password });
        if (error) throw error;
        return json({ ok: true });
      }
      case 'setActive': {
        await target(b.id);
        await admin.auth.admin.updateUserById(b.id, { ban_duration: b.active ? 'none' : '876000h' });
        await admin.from('profiles').update({ active: !!b.active }).eq('id', b.id);
        return json({ ok: true });
      }
      case 'delete': {
        const t = await target(b.id);
        if (t.role === 'trainer') {
          const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('trainer_id', b.id);
          if (count) throw new Error('Este professor ainda tem alunos. Transfira ou exclua os alunos primeiro.');
          await admin.from('templates').delete().eq('owner', b.id);
          await admin.from('foods').delete().eq('owner', b.id);
          await admin.from('tips').delete().eq('owner', b.id);
        }
        for (const tb of DATA_TABLES) await admin.from(tb).delete().eq('uid', b.id);
        await admin.from('messages').delete().or(`to_id.eq.${b.id},from_id.eq.${b.id}`);
        const { error } = await admin.auth.admin.deleteUser(b.id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'setTrainer': { // CEO transfere aluno para outro professor
        if (!isCeo) throw new Error('Somente o CEO.');
        await target(b.id);
        await admin.from('profiles').update({ trainer_id: b.trainerId }).eq('id', b.id);
        return json({ ok: true });
      }
      default: return json({ error: 'Ação inválida.' }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro.' }, 400);
  }
});
