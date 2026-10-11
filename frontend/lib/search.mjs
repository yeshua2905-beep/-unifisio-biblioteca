export const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const searchable=s=>normalize(s)
 .replace(/\b(?:[a-z]\.){2,}(?:[a-z]\.?)?/g,s=>s.replace(/\./g,''))
 .replace(/\bvisa\s*[- ]\s*([ap])\b/g,'visa$1')
 .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const groups=[
 ['lca','acl','ligamento cruzado anterior','anterior cruciate ligament'],
 ['lcp','pcl','ligamento cruzado posterior','posterior cruciate ligament'],
 ['ptj','atj','tka','tkr','protese total de joelho','artroplastia total de joelho'],
 ['ptq','atq','tha','thr','protese total de quadril','artroplastia total de quadril'],
 ['manguito','mr','manguito rotador','rotator cuff'],
 ['lombar','lombalgia','dor lombar'],['forca','fortalecer','fortalecimento'],
 ['retorno','volta','voltar'],['corrida','correr','corredor'],
 ['amplitude','adm','mobilidade','amplitude de movimento'],['dinamometria','dinamometro'],
 ['visap','visa p'],['visaa','visa a'],
 ['ccf','ckc','cadeia cinetica fechada'],['cca','okc','cadeia cinetica aberta'],
 ['hsr','heavy slow resistance','resistencia lenta pesada'],
 ['slap','superior labrum anterior posterior','lesao labral superior'],
 ['dtm','disfuncao temporomandibular'],['emg','eletromiografia'],
 ['eva','escala visual analogica'],['ikdc','international knee documentation committee'],
 ['acl rsi','aclrsi','acl return to sport after injury']
].map(group=>group.map(searchable));
export function matchesQuery(material,query){
 const text=searchable([material.title,material.summary,material.reference,material.category,material.kind].join(' '));
 const words=text.split(' '), terms=searchable(query).split(' ').filter(Boolean);
 return terms.every(term=>{
  // Expand complete aliases and partially typed acronyms, without matching inside unrelated words.
  const exact=groups.find(g=>g.includes(term));
  const partial=term.length>=2?groups.filter(g=>g.some(alias=>!alias.includes(' ')&&alias.length<=5&&alias.startsWith(term))).flat():[];
  const aliases=exact||(partial.length?partial:[term]);
  return words.some(word=>word.startsWith(term)) || aliases.some(alias=>alias.includes(' ')?` ${text} `.includes(` ${alias} `):words.includes(alias));
 });
}
