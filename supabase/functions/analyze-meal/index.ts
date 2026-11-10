// Edge Function "analyze-meal": estima calorias de uma FOTO de refeição ou de um TEXTO
// ("amendoim 30g") usando a API do Google Gemini. A chave fica só no servidor.
// Configurar: supabase secrets set GEMINI_API_KEY=sua_chave   (chave grátis em aistudio.google.com)
// Deploy:     supabase functions deploy analyze-meal
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROMPT = `Você é um nutricionista. Identifique cada alimento/bebida {SRC} e estime a porção em gramas (ou ml) e os valores nutricionais dessa porção, considerando a culinária brasileira.
Responda SOMENTE JSON no formato:
{"items":[{"name":"string em português","grams":número,"kcal":número,"p":número,"c":número,"g":número}],"note":"observação curta"}
p, c, g = proteínas, carboidratos e gorduras em gramas. Se não houver comida, retorne {"items":[],"note":"Não encontrei alimentos."}.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const { data: prof } = await caller.from('profiles').select('active').eq('id', user.id).single();
    if (!prof?.active) return json({ error: 'Conta inativa.' }, 403);

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'Análise por IA não configurada (GEMINI_API_KEY).' }, 501);
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';

    const b = await req.json();
    const parts: unknown[] = [];
    if (b.image) {
      if (String(b.image).length > 4_000_000) return json({ error: 'Imagem muito grande.' }, 413);
      parts.push({ text: PROMPT.replace('{SRC}', 'que aparece na foto') });
      parts.push({ inline_data: { mime_type: b.mime || 'image/jpeg', data: b.image } });
    } else if (b.text) {
      parts.push({ text: PROMPT.replace('{SRC}', 'descrito a seguir') + '\nDescrição: ' + String(b.text).slice(0, 200) });
    } else return json({ error: 'Envie image ou text.' }, 400);

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
    });
    if (!r.ok) return json({ error: 'Falha na análise (' + r.status + ').' }, 502);
    const out = await r.json();
    const txt = out?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(txt.replace(/^```json|```$/g, '').trim());
    const items = (parsed.items ?? []).slice(0, 15).map((i: any) => ({
      name: String(i.name ?? '?'), grams: +i.grams || 0, kcal: Math.round(+i.kcal || 0), p: +(+i.p || 0).toFixed(1), c: +(+i.c || 0).toFixed(1), g: +(+i.g || 0).toFixed(1),
    }));
    return json({ items, note: parsed.note ?? '' });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro.' }, 400);
  }
});
