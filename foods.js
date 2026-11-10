/* Base nutricional PersonalHUB (valores por 100 g, aproximados - TACO/USDA).
   Formato: nome|categoria|kcal|proteína|carbo|gordura|porção(g) */
const FOOD_CATS = {
  F: 'Frutas',
  P: 'Carnes e proteínas',
  C: 'Carboidratos',
  V: 'Vegetais',
  L: 'Laticínios',
  D: 'Doces e lanches',
  B: 'Bebidas',
  O: 'Gorduras e oleaginosas',
};

const FOOD_RAW = `Banana|F|89|1.1|23|0.3|100
Maçã|F|52|0.3|14|0.2|130
Laranja|F|47|0.9|12|0.1|130
Mamão|F|43|0.5|11|0.3|150
Melancia|F|30|0.6|8|0.2|200
Abacaxi|F|50|0.5|13|0.1|120
Uva|F|69|0.7|18|0.2|100
Morango|F|32|0.7|8|0.3|100
Manga|F|60|0.8|15|0.4|150
Abacate|F|160|2|9|15|100
Melão|F|34|0.8|8|0.2|150
Pera|F|57|0.4|15|0.1|120
Kiwi|F|61|1.1|15|0.5|80
Goiaba|F|68|2.6|14|1|100
Maracujá|F|97|2.2|23|0.7|50
Tangerina|F|53|0.8|13|0.3|100
Ameixa|F|46|0.7|11|0.3|60
Açaí (polpa sem açúcar)|F|70|1|6|5|100
Açaí na tigela (com xarope)|F|145|1.5|26|4|200
Limão|F|29|1.1|9|0.3|50
Coco fresco|F|354|3.3|15|33|40
Peito de frango grelhado|P|159|32|0|3|120
Frango desfiado|P|165|31|0|3.6|100
Coxa de frango assada|P|215|26|0|12|100
Asa de frango assada|P|240|23|0|16|100
Patinho grelhado|P|219|36|0|7|120
Alcatra grelhada|P|241|32|0|12|120
Contrafilé grelhado|P|240|29|0|13|120
Picanha|P|289|25|0|21|120
Carne moída refogada|P|212|26|0|12|100
Carne de sol / charque|P|248|33|0|12|80
Costela bovina|P|370|20|0|32|120
Lombo suíno assado|P|242|27|0|14|100
Pernil suíno assado|P|262|27|0|17|100
Bacon frito|P|541|37|1.4|42|20
Linguiça toscana|P|296|16|2|25|80
Linguiça calabresa|P|318|18|2|27|60
Tilápia grelhada|P|128|26|0|2.7|120
Salmão grelhado|P|208|20|0|13|120
Atum em lata (ao natural)|P|116|26|0|1|60
Sardinha em lata|P|208|25|0|11|60
Camarão cozido|P|99|24|0.2|0.3|100
Ovo cozido|P|155|13|1.1|11|50
Ovo mexido / frito|P|196|13|1.2|15|55
Clara de ovo|P|52|11|0.7|0.2|33
Omelete simples|P|175|12|1.5|13|100
Presunto|P|107|17|1.5|3|30
Peito de peru|P|104|17|4|2|30
Fígado bovino|P|135|20|4|3.6|100
Whey protein (pó)|P|400|80|8|6|30
Barra de proteína|P|370|30|35|11|45
Strogonoff de frango|P|178|16|4|11|150
Arroz branco cozido|C|128|2.5|28|0.2|120
Arroz integral cozido|C|124|2.6|26|1|120
Feijão carioca cozido|C|76|4.8|14|0.5|100
Feijão preto cozido|C|77|4.5|14|0.5|100
Lentilha cozida|C|93|6.3|16|0.5|100
Grão-de-bico cozido|C|164|9|27|2.6|100
Macarrão cozido|C|158|5.8|31|0.9|140
Macarrão integral cozido|C|149|6|30|1.1|140
Lasanha à bolonhesa|C|165|9|15|7.5|250
Pão francês|C|300|8|58|3.1|50
Pão integral|C|253|10|43|3.5|50
Pão de forma|C|265|9|49|3.2|50
Tapioca (goma hidratada)|C|240|0|60|0|50
Crepioca|C|198|8|30|5|80
Cuscuz de milho|C|112|2.2|25|0.7|120
Batata inglesa cozida|C|87|1.9|20|0.1|120
Batata frita|C|312|3.4|41|15|100
Purê de batata|C|105|2.1|16|3.8|120
Batata-doce cozida|C|86|1.6|20|0.1|120
Mandioca cozida|C|125|0.6|30|0.3|100
Inhame cozido|C|118|1.5|28|0.2|100
Aveia em flocos|C|394|14|67|8.5|30
Granola|C|471|10|64|20|30
Farofa pronta / mandioca|C|406|2.2|80|9|30
Milho verde|C|86|3.2|19|1.2|100
Pipoca (sem manteiga)|C|387|13|78|4.5|25
Biscoito cream cracker|C|432|10|69|14|30
Pão de queijo|C|363|5|35|22|40
Alface|V|15|1.4|2.9|0.2|50
Tomate|V|18|0.9|3.9|0.2|100
Cenoura|V|41|0.9|10|0.2|80
Brócolis cozido|V|34|2.8|7|0.4|100
Couve refogada|V|49|4.3|9|0.9|50
Pepino|V|15|0.7|3.6|0.1|100
Cebola|V|40|1.1|9|0.1|50
Abobrinha|V|17|1.2|3.1|0.3|100
Beterraba cozida|V|43|1.6|10|0.2|80
Espinafre|V|23|2.9|3.6|0.4|50
Couve-flor|V|25|1.9|5|0.3|100
Chuchu cozido|V|19|0.8|4.5|0.1|100
Abóbora cozida|V|26|1|6.5|0.1|100
Pimentão|V|31|1|6|0.3|80
Vagem cozida|V|31|1.8|7|0.2|100
Repolho|V|25|1.3|6|0.1|70
Salada mista (folhas, tomate, cenoura)|V|24|1.2|4.5|0.3|120
Leite integral|L|61|3.2|4.8|3.3|200
Leite desnatado|L|35|3.4|5|0.1|200
Iogurte natural|L|61|3.5|4.7|3.3|170
Iogurte grego|L|97|9|4|5|100
Queijo mussarela|L|300|22|2.2|22|30
Queijo minas frescal|L|264|17|3|20|30
Queijo coalho|L|329|22|2.1|26|40
Queijo prato|L|360|23|1.5|29|30
Requeijão|L|257|9|3|23|30
Queijo cottage|L|98|11|3.4|4.3|100
Manteiga|L|717|0.9|0.1|81|10
Cream cheese|L|342|6|4|34|20
Ricota|L|174|11|3|13|30
Açúcar refinado|D|387|0|100|0|10
Chocolate ao leite|D|535|8|59|30|25
Chocolate 70% cacau|D|598|8|46|43|25
Brigadeiro|D|390|4|60|15|20
Sorvete de creme|D|207|3.5|24|11|60
Bolo de chocolate|D|370|5|53|16|60
Mel|D|304|0.3|82|0|20
Doce de leite|D|306|7|55|7|20
Pudim de leite|D|190|5|30|6|100
Paçoca|D|487|14|50|28|20
Goiabada|D|270|0.6|70|0|30
Biscoito recheado|D|480|6|70|20|30
Pizza de mussarela / calabresa|D|266|11|33|10|100
Hambúrguer artesanal (lanche)|D|255|13|24|12|180
Coxinha de frango|D|283|9|32|13|80
Pastel de carne / queijo|D|315|8|35|16|90
Água|B|0|0|0|0|200
Café sem açúcar|B|2|0.1|0|0|50
Suco de laranja natural|B|45|0.7|10|0.2|200
Refrigerante de cola|B|42|0|10.6|0|350
Refrigerante zero|B|0|0|0|0|350
Cerveja|B|43|0.5|3.6|0|350
Vinho tinto|B|85|0.1|2.6|0|150
Água de coco|B|19|0.7|3.7|0.2|200
Leite de soja|B|33|2.8|1.7|1.8|200
Suco de uva integral|B|60|0.3|15|0.1|200
Chá sem açúcar|B|1|0|0.2|0|200
Isotônico|B|24|0|6|0|500
Energético|B|45|0|11|0|250
Azeite de oliva|O|884|0|0|100|13
Castanha-do-pará|O|659|14|12|67|10
Amendoim|O|567|26|16|49|30
Pasta de amendoim|O|588|25|20|50|15
Amêndoas|O|579|21|22|50|30
Nozes|O|654|15|14|65|30
Castanha de caju|O|553|18|30|44|30
Chia|O|486|17|42|31|15
Linhaça|O|534|18|29|42|15
Maionese|O|680|1|0.6|75|15`;

const FOODS_SEED = FOOD_RAW.split('\n').map((l, i) => {
  const [name, cat, kcal, p, c, g, port] = l.split('|');
  return { id: 'f' + i, name, cat, kcal: +kcal, p: +p, c: +c, g: +g, port: +port };
});

/* Classificação visual: 🟢 leve / 🟡 moderado / 🔴 calórico (por 100 g) */
function foodBadge(kcal) {
  return kcal < 80 ? ['🟢', 'Leve'] : kcal < 200 ? ['🟡', 'Moderado'] : ['🔴', 'Calórico'];
}

/* Normaliza texto removendo acentos para busca instantânea */
function normStr(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/* Busca inteligente + estimativa automática ao digitar o nome do alimento (ex.: "amendoim", "amendoim 50g", "2 ovos") */
function autoCalcFood(rawInput, customGrams, sourceList) {
  const list = sourceList && sourceList.length ? sourceList : FOODS_SEED;
  const raw = String(rawInput || '').trim();
  if (!raw) return null;

  // Extrai quantidade digitada junto ao nome (ex.: "amendoim 50g", "150g frango", "2 ovos")
  let detectedGrams = null;
  let detectedUnits = null;
  let clean = raw;

  const mGrams = raw.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gramas|ml)\b/i);
  if (mGrams) {
    detectedGrams = parseFloat(mGrams[1].replace(',', '.'));
    clean = raw.replace(mGrams[0], ' ').trim();
  } else {
    const mUnits = raw.match(/^(\d+(?:[.,]\d+)?)\s+(.+)/);
    if (mUnits && parseFloat(mUnits[1]) <= 20) {
      detectedUnits = parseFloat(mUnits[1].replace(',', '.'));
      clean = mUnits[2].trim();
    }
  }

  const q = normStr(clean || raw);
  if (!q) return null;

  // 1) Busca exata, por prefixo de palavra ou por inclusão
  let best = list.find(x => normStr(x.name) === q)
    || list.find(x => normStr(x.name).startsWith(q))
    || list.find(x => normStr(x.name).split(/[\s()/,-]+/).some(w => w.startsWith(q)))
    || list.find(x => normStr(x.name).includes(q));

  // Plural simples (ex.: "ovos" -> "ovo", "bananas" -> "banana")
  if (!best && q.endsWith('s') && q.length > 3) {
    const sing = q.slice(0, -1);
    best = list.find(x => normStr(x.name).startsWith(sing) || normStr(x.name).includes(sing));
  }

  // 2) Se ainda não achou na tabela, estima automaticamente pela família de alimentos
  let isEstimated = false;
  if (!best) {
    isEstimated = true;
    best = estimateUnknownFood(clean || raw);
  }

  const grams = customGrams > 0
    ? +customGrams
    : detectedGrams > 0
      ? detectedGrams
      : detectedUnits > 0
        ? Math.round(detectedUnits * (best.port || 100))
        : (best.port || 100);

  const factor = grams / 100;
  return {
    food: best,
    isEstimated,
    grams,
    kcal: Math.round(best.kcal * factor),
    p: +(best.p * factor).toFixed(1),
    c: +(best.c * factor).toFixed(1),
    g: +(best.g * factor).toFixed(1),
    badge: foodBadge(best.kcal),
  };
}

/* Estimador inteligente caso o usuário digite um alimento fora da lista padrão */
function estimateUnknownFood(name) {
  const n = normStr(name);
  if (/castanha|nozes|amendo|pistache|macadamia|avela|semente|gergelim/.test(n))
    return { id: 'est', name, cat: 'O', kcal: 580, p: 20, c: 18, g: 50, port: 30 };
  if (/azeite|oleo|manteiga|margarina|banha/.test(n))
    return { id: 'est', name, cat: 'O', kcal: 750, p: 0.5, c: 0.5, g: 83, port: 13 };
  if (/frango|peru|peixe|tilapia|merluza|bacalhau|atum|camarao/.test(n))
    return { id: 'est', name, cat: 'P', kcal: 155, p: 28, c: 0, g: 4, port: 120 };
  if (/carne|boi|bife|alcatra|patinho|maminha|fraldinha|picanha|porco|suino|hamburguer/.test(n))
    return { id: 'est', name, cat: 'P', kcal: 235, p: 28, c: 1, g: 13, port: 120 };
  if (/ovo|omelete/.test(n))
    return { id: 'est', name, cat: 'P', kcal: 155, p: 13, c: 1.1, g: 11, port: 50 };
  if (/bolo|chocolate|brigadeiro|doce|biscoito|bolacha|sorvete|tort|pudim|nutella|acucar|balas?/.test(n))
    return { id: 'est', name, cat: 'D', kcal: 395, p: 5, c: 58, g: 16, port: 60 };
  if (/pizza|lasanha|pastel|coxinha|empada|salgado|esfiha|quibe|frit/.test(n))
    return { id: 'est', name, cat: 'D', kcal: 285, p: 10, c: 32, g: 13, port: 100 };
  if (/pao|torrada|tapioca|cuscuz|aveia|cereal|granola|biscoito/.test(n))
    return { id: 'est', name, cat: 'C', kcal: 280, p: 8, c: 54, g: 3.5, port: 50 };
  if (/arroz|macarrao|massa|nhoque|batata|mandioca|aipim|inhame|feijao|lentilha|grao/.test(n))
    return { id: 'est', name, cat: 'C', kcal: 125, p: 4, c: 25, g: 0.8, port: 120 };
  if (/queijo|requeijao|iogurte|leite|coalhada/.test(n))
    return { id: 'est', name, cat: 'L', kcal: 220, p: 14, c: 4, g: 16, port: 50 };
  if (/salada|alface|tomate|brocolis|couve|legume|verdura|pepino|abobrinha|cenoura/.test(n))
    return { id: 'est', name, cat: 'V', kcal: 28, p: 1.8, c: 5, g: 0.3, port: 100 };
  if (/suco|refrigerante|vitamina|shake|bebida|cerveja|vinho/.test(n))
    return { id: 'est', name, cat: 'B', kcal: 55, p: 0.8, c: 12, g: 0.2, port: 200 };
  if (/fruta|maca|banana|uva|manga|pera|morango|abacaxi|melancia|laranja/.test(n))
    return { id: 'est', name, cat: 'F', kcal: 58, p: 0.8, c: 14, g: 0.3, port: 120 };
  return { id: 'est', name, cat: 'C', kcal: 160, p: 7, c: 22, g: 5, port: 100 };
}

/* Perfis de pratos brasileiros para estimativa visual local quando sem IA externa */
const MEAL_PRESETS = [
  {
    key: 'pf',
    label: 'Prato feito brasileiro (arroz, feijão, proteína e salada)',
    items: [
      { name: 'Arroz branco cozido', grams: 130, kcal: 166, p: 3.3, c: 36.4, g: 0.3 },
      { name: 'Feijão carioca cozido', grams: 100, kcal: 76, p: 4.8, c: 14, g: 0.5 },
      { name: 'Peito de frango grelhado', grams: 130, kcal: 207, p: 41.6, c: 0, g: 3.9 },
      { name: 'Salada mista (folhas, tomate, cenoura)', grams: 90, kcal: 22, p: 1.1, c: 4.1, g: 0.3 },
    ],
  },
  {
    key: 'fit',
    label: 'Refeição proteica / fitness (proteína, batata-doce e vegetais)',
    items: [
      { name: 'Peito de frango grelhado', grams: 150, kcal: 239, p: 48, c: 0, g: 4.5 },
      { name: 'Batata-doce cozida', grams: 140, kcal: 120, p: 2.2, c: 28, g: 0.1 },
      { name: 'Brócolis cozido', grams: 90, kcal: 31, p: 2.5, c: 6.3, g: 0.4 },
    ],
  },
  {
    key: 'carne',
    label: 'Refeição com carne bovina, arroz e acompanhamentos',
    items: [
      { name: 'Patinho grelhado', grams: 140, kcal: 307, p: 50.4, c: 0, g: 9.8 },
      { name: 'Arroz branco cozido', grams: 120, kcal: 154, p: 3, c: 33.6, g: 0.2 },
      { name: 'Feijão carioca cozido', grams: 90, kcal: 68, p: 4.3, c: 12.6, g: 0.5 },
      { name: 'Farofa pronta / mandioca', grams: 25, kcal: 102, p: 0.6, c: 20, g: 2.3 },
    ],
  },
  {
    key: 'lanche',
    label: 'Café da manhã / lanche (pão com ovos e café)',
    items: [
      { name: 'Pão integral', grams: 50, kcal: 127, p: 5, c: 21.5, g: 1.8 },
      { name: 'Ovo mexido / frito', grams: 100, kcal: 196, p: 13, c: 1.2, g: 15 },
      { name: 'Banana', grams: 100, kcal: 89, p: 1.1, c: 23, g: 0.3 },
    ],
  },
  {
    key: 'massa',
    label: 'Prato de massa / macarrão com proteína',
    items: [
      { name: 'Macarrão cozido', grams: 180, kcal: 284, p: 10.4, c: 55.8, g: 1.6 },
      { name: 'Carne moída refogada', grams: 110, kcal: 233, p: 28.6, c: 0, g: 13.2 },
    ],
  },
];

/* Analisa cores predominantes da foto do prato para escolher a estimativa inicial quando offline/sem chave */
function analyzePlateImageLocal(imgEl) {
  try {
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    let green = 0, warm = 0, dark = 0, light = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > r * 1.12 && g > b * 1.15) green++;
      else if (r > 150 && g > 100 && b < 110) warm++;
      else if (r < 95 && g < 80 && b < 75) dark++;
      else if (r > 185 && g > 180 && b > 165) light++;
    }
    const tot = d.length / 4;
    if (green / tot > 0.16) return MEAL_PRESETS[1];
    if (dark / tot > 0.28) return MEAL_PRESETS[2];
    if (warm / tot > 0.32 && light / tot < 0.15) return MEAL_PRESETS[4];
    if (light / tot > 0.42) return MEAL_PRESETS[3];
  } catch { }
  return MEAL_PRESETS[0];
}
