// Otomatik balonlama (ai-balloon.js) — saf parçalar gerçek gövdeyle:
//   node test_ai_balon.cjs
// 1) kare bölme (1400/200 örtüşme), 2) normalize koordinat → global piksel, tolerans metni elenir,
// 3) tekilleştirme, 4) JSON ayıklama, 5) mürekkep kutusu (hayalet okuma → null), 6) sayfa kablolaması, anahtar kaynakta yok
const fs = require('fs'), assert = require('assert');
const js = fs.readFileSync(__dirname + '/ai-balloon.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const api = fs.readFileSync(__dirname + '/api-setup.html', 'utf8');

// gövde: tarayıcı globalleri olmadan saf fonksiyonları yükle
const sandbox = { localStorage: { getItem: () => null }, document: { addEventListener() { } }, fetch: undefined };
const F = new Function('localStorage', 'document', js + '\nreturn {AI_BALON, aiKareler, aiTumKareler, aiAltKareler, aiCerceveDisi, aiDogrulaEslesir, aiKolajYerlesim, aiKareCoz, aiTekille, aiCozumle, aiYaziKutusu, aiBeklemeSn};')(sandbox.localStorage, sandbox.document);

// 0) iki geçiş: 1400 px (6 kare) + 700 px 2× büyütme (24 kare) = 30; ikinci geçiş kareleri olcek 2
const tk = F.aiTumKareler(3318, 2342);
assert.strictEqual(tk.length, 60, 'toplam kare (tekrar dâhil): ' + tk.length); assert.strictEqual(tk.filter(k => k.olcek === 2).length, 48); assert.strictEqual(tk.filter(k => k.tekrar).length, 30);
assert.deepStrictEqual(F.AI_BALON.GECISLER.map(g => g.kare), [1400, 700]);
// büyük (≥14 MP) görüntüde yalnız 1400 geçişi: 6000×4238 → 5×4 = 20 kare, olcek 2 yok
const tb = F.aiTumKareler(6000, 4238);
assert.strictEqual(tb.length, 40, 'büyük görüntü kare (20 + tekrar 20): ' + tb.length); assert(tb.every(k => k.olcek === 1));
// çerçeve şeridi: kenardaki tek karakter atılır, çok haneli ("300") ve iç bölgedeki tek karakter ("5") kalır
assert(!F.aiCerceveDisi({ deger: '4', x: 500, y: 100 }, 6000, 4238) && !F.aiCerceveDisi({ deger: 'B', x: 80, y: 2000 }, 6000, 4238));
assert(F.aiCerceveDisi({ deger: '300', x: 500, y: 100 }, 6000, 4238) && F.aiCerceveDisi({ deger: '5', x: 3000, y: 2000 }, 6000, 4238));
// okuma kaynağı canvas değil: PDF sayfası yeniden çizilir / görüntünün doğal boyutu; app.js sayfayı saklar
assert(js.includes('window.__aiPdfPage') && js.includes('naturalWidth') && js.includes('aiPencereKutusu(kaynak, KW, KH'), 'yüksek çözünürlük kaynağı');
assert(fs.readFileSync(__dirname + '/app.js', 'utf8').includes('window.__aiPdfPage = page;'), 'loadPDF sayfayı saklamalı');

// 1) kareler: 3318×2342 → x: 0,1200,2400 · y: 0,1200 = 6 kare; kenar artığı < 200 px atlanır
let k = F.aiKareler(3318, 2342);
assert.strictEqual(k.length, 6, 'kare sayısı'); assert.deepStrictEqual(k[0], { x0: 0, y0: 0, x1: 1400, y1: 1400 });
assert.deepStrictEqual(k[5], { x0: 2400, y0: 1200, x1: 3318, y1: 2342 });
assert.strictEqual(F.aiKareler(1450, 1000).length, 2, '1450 px: ikinci kare 250 px → dahil'); assert.strictEqual(F.aiKareler(1350, 1000).length, 1, '1350 px: ikinci kare 150 px → atlanır');

// 2) normalize → global; tolerans metni ("+0.2") ve dışarı taşan atılır
const c = F.aiKareCoz([{ deger: '48', x: 500, y: 250 }, { deger: '+0.2', x: 1, y: 1 }, { deger: 'R 15', x: 999, y: 999 }, { deger: '', x: 1, y: 1 }, { deger: '±20', x: 5, y: 5 }], { x0: 1200, y0: 0, x1: 2600, y1: 1400 }, 3318, 2342);
assert.strictEqual(c.length, 2, '±20 ve +0.2 tolerans metni atılmalı'); assert.strictEqual(c[0].x, 1200 + 700); assert.strictEqual(c[0].y, 350); assert.strictEqual(c[1].deger, 'R15', '"R 15" → "R15"');

// 3) tekilleştirme: örtüşen karelerden aynı ölçü 90 px içinde tek
const t = F.aiTekille([{ deger: '48', x: 100, y: 100 }, { deger: '48', x: 150, y: 120 }, { deger: '48', x: 400, y: 100 }, { deger: '50', x: 150, y: 120 }]);
assert.strictEqual(t.length, 3);

// 4) JSON ayıklama (kod bloğu içinde de olur)
assert.deepStrictEqual(F.aiCozumle('```json\n[{"deger":"48","x":1,"y":2}]\n```'), [{ deger: '48', x: 1, y: 2 }]);
assert.deepStrictEqual(F.aiCozumle('yanıt yok'), []); assert.deepStrictEqual(F.aiCozumle('[{bozuk'), []);
assert.strictEqual(F.aiBeklemeSn('Please retry in 7.6s', 5), 9.1); assert.strictEqual(F.aiBeklemeSn('', 5), 5);

// 5) mürekkep kutusu: 400×300 beyaz sayfa, (150..190, 100..124) rakam bloğu (2 rakam, 4 px aralık), altında 140 px'lik ince ölçü çizgisi
const W = 400, H = 300, g = new Uint8Array(W * H).fill(255);
const boya = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * W + x] = 0; };
boya(150, 100, 168, 124); boya(172, 100, 190, 124);   // "48" iki rakam
boya(120, 140, 260, 142);                             // ölçü çizgisi (2 px)
let kutu = F.aiYaziKutusu(g, W, H, 165, 110);
assert.deepStrictEqual(kutu, { x: 150, y: 100, width: 40, height: 24 }, 'kutu rakam bloğuna oturmalı: ' + JSON.stringify(kutu));
kutu = F.aiYaziKutusu(g, W, H, 200, 135);             // model konumu biraz kaymış: yine aynı kutu (çizgi ≤4 px → yazı sayılmaz)
assert.deepStrictEqual(kutu, { x: 150, y: 100, width: 40, height: 24 }, 'kaymış konumda: ' + JSON.stringify(kutu));
assert.strictEqual(F.aiYaziKutusu(g, W, H, 350, 250), null, 'mürekkep yok → hayalet → null');
// dikey (90° döndürülmüş) yazı: 12×40 blok
boya(300, 40, 312, 80); kutu = F.aiYaziKutusu(g, W, H, 306, 60);
assert.deepStrictEqual(kutu, { x: 300, y: 40, width: 12, height: 40 });
// ÖLÇÜ ÇİZGİLERİ (MAN 6984 vakası): yazının ORTASINDAN geçen uzun yatay çizgi + yanından geçen dikey çizgi → kutu yine rakam bloğu
boya(0, 112, W, 114);                                  // yatay ölçü çizgisi "48"in ortasından, pencereyi boydan boya geçer
boya(200, 0, 202, H);                                  // dikey ölçü çizgisi, pencerede her satırı koyu yapar
kutu = F.aiYaziKutusu(g, W, H, 165, 110);
assert.deepStrictEqual(kutu, { x: 150, y: 100, width: 40, height: 24 }, 'çizgiler maskelenmeli: ' + JSON.stringify(kutu));
// yazının SAĞINDAN başlayan yatay ölçü çizgisi (pencerenin %48'i → maskelenmez): kutu çizgiyle BİRLEŞMEMELİ
const g2 = new Uint8Array(W * H).fill(255); const boya2 = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g2[y * W + x] = 0; };
boya2(150, 100, 168, 124); boya2(172, 100, 190, 124); boya2(192, 111, 280, 113);
kutu = F.aiYaziKutusu(g2, W, H, 165, 110);
assert.deepStrictEqual(kutu, { x: 150, y: 100, width: 40, height: 24 }, 'yandan çizgi kutuyu uzatmamalı: ' + JSON.stringify(kutu));
// KALIN (4 px) çizgi rakamlara bitişik → sütun eşiğini geçer, kutu 130 px olur; karakter sayısı verilince beklenen genişliğe kırpılır
const g3 = new Uint8Array(W * H).fill(255); const boya3 = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g3[y * W + x] = 0; };
boya3(150, 100, 168, 124); boya3(172, 100, 190, 124); boya3(190, 110, 280, 114);
kutu = F.aiYaziKutusu(g3, W, H, 168, 112, 90, 2);
assert(kutu && kutu.width <= 60 && kutu.x >= 140 && kutu.x + kutu.width >= 185, 'kalın çizgi: beklenen genişliğe kırpılmalı: ' + JSON.stringify(kutu));
assert.strictEqual(F.aiYaziKutusu(g3, W, H, 168, 112).width, 40, 'kalın çizgi %35 maskesiyle silinir, kutu rakamlar');
// yazı ile ALTINDAKİ ölçü çizgisi arasında 5 satır boşluk (maskelenmemiş): birleşmemeli — kutu yazı kalır
const g6 = new Uint8Array(W * H).fill(255); const boya6 = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g6[y * W + x] = 0; };
boya6(150, 100, 168, 124); boya6(172, 100, 190, 124); boya6(120, 129, 175, 131);      // kısa çizgi (pencerenin %30'u → maskelenmez), 5 satır altta
kutu = F.aiYaziKutusu(g6, W, H, 168, 112, 90, 2);
assert.deepStrictEqual(kutu, { x: 150, y: 100, width: 40, height: 24 }, 'alttaki kısa çizgi birleşmemeli: ' + JSON.stringify(kutu));
// GENİŞ FONT (MAN 6984 "270": 35 px yüksek, rakam arası 14 px): üç rakam TEK kutu olmalı, tek rakama bölünmemeli
const g4 = new Uint8Array(W * H).fill(255); const boya4 = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g4[y * W + x] = 0; };
boya4(100, 60, 124, 95); boya4(138, 60, 162, 95); boya4(176, 60, 200, 95);
kutu = F.aiYaziKutusu(g4, W, H, 150, 78, 90, 3);
assert.deepStrictEqual(kutu, { x: 100, y: 60, width: 100, height: 35 }, 'geniş font 3 rakam tek kutu: ' + JSON.stringify(kutu));
// dikey yazı + sağında bitişik kalın çizgi parçası (esikSut ile boşluk sayılır): kutu dikey yazı kalır
const g5 = new Uint8Array(W * H).fill(255); const boya5 = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g5[y * W + x] = 0; };
boya5(300, 40, 312, 80); boya5(314, 40, 360, 44);
kutu = F.aiYaziKutusu(g5, W, H, 306, 60, 90, 3);
assert(kutu && kutu.x === 300 && kutu.width === 12, 'dikey yazı + çizgi parçası: ' + JSON.stringify(kutu));
// dikey yazı + hemen yanından geçen dikey ölçü çizgisi (pencerede tek dev blok olmamalı)
boya(320, 0, 322, H); kutu = F.aiYaziKutusu(g, W, H, 306, 60);
assert.deepStrictEqual(kutu, { x: 300, y: 40, width: 12, height: 40 }, 'dikey yazı + dikey çizgi: ' + JSON.stringify(kutu));

// 6) kablolama + güvenlik
const iApp = html.search(/<script src="app\.js(\?v=[^"]*)?"><\/script>/), iAi = html.search(/<script src="ai-balloon\.js(\?v=[^"]*)?"><\/script>/);
assert(html.includes('id="autoBalloonBtn"') && iAi > 0, 'düğme/script yok');
assert(iApp > 0 && iApp < iAi, 'ai-balloon.js app.js\'den sonra yüklenmeli');
// önbellek kırıcı: iki script de aynı ?v= sürümünü taşımalı (yayında artırılır)
const vApp = /app\.js\?v=([^"]+)"/.exec(html), vAi = /ai-balloon\.js\?v=([^"]+)"/.exec(html);
assert(vApp && vAi && vApp[1] === vAi[1], 'app.js ve ai-balloon.js ?v= sürümleri aynı olmalı');
assert(api.includes('id="geminiKey"') && api.includes("localStorage.setItem('ocr_gemini_key'") && api.includes("localStorage.getItem('ocr_gemini_key')"), 'API sayfası Gemini kartı');
assert(!/AIza[0-9A-Za-z_-]{20,}/.test(js + html + api), 'kaynakta API anahtarı olmamalı');
assert(js.includes('responseMimeType') && js.includes("'gemini-3.5-flash-lite'") && js.includes('ÖLÇÜLER 90 DERECE'), 'istem/model');
assert(js.includes('autoAlignBalloons()') && js.includes('addTableRow(ann)') && js.includes('applyDefaultTolerances(ann)'), 'balon + tablo + hizalama akışı');
// 6b) yoğun kare alt geçişi: 1400 px kare → 700 px / 2× örtüşmeli 4 alt kare; kenar artığı < 200 px atlanır; istem GT çerçevelerini ister
{ const alt = F.aiAltKareler({ x0: 1200, y0: 0, x1: 2600, y1: 1400 });
  assert.strictEqual(alt.length, 4, 'alt kare: ' + alt.length); assert(alt.every(a => a.olcek === 2 && a.x0 >= 1200 && a.x1 <= 2600));
  assert.strictEqual(F.aiAltKareler({ x0: 4800, y0: 3600, x1: 6000, y1: 4238 }).length, 2, '1200×638 kare: 2 sütun × 1 satır (58 px artık atlanır)');
  assert(js.includes('GEOMETRİK TOLERANS ÇERÇEVELERİNİ DE LİSTELE') && js.includes('bulunan.length >= 3'), 'GT istemi / yoğun kare geçişi');
}
// 7) silince yeniden numarala: tikli seçenek + deleteAnnotation gerçek gövdesi (yön seçili değil → konuma göre, tablo yeniden)
assert(html.includes('id="renumberOnDelete" checked'), 'seçenek yok / tikli değil');
{ const app = fs.readFileSync(__dirname + '/app.js', 'utf8'); const i = app.indexOf('function deleteAnnotation('); const g = app.slice(i, app.indexOf('\n}', i) + 2);
  let numaralandi = 0, tabloKuruldu = 0, cizildi = 0;
  const anns = [{ id: 1, number: 1 }, { id: 2, number: 2 }, { id: 3, number: 3 }];
  const ctx = { annotations: anns, document: { getElementById: id => id === 'renumberOnDelete' ? { checked: true } : id === 'autoNumberDirectionSelect' ? { value: 'none' } : { remove() { } } },
    renumberAnnotations: () => { numaralandi++; ctx.annotations.forEach((a, k) => a.number = k + 1); }, rebuildTable: () => tabloKuruldu++, redrawCanvas: () => cizildi++, applyAutoNumbering: () => { throw new Error('yön seçili değilken çağrılmamalı'); } };
  new Function('annotations', 'document', 'renumberAnnotations', 'rebuildTable', 'redrawCanvas', 'applyAutoNumbering', g.replace('annotations = annotations.filter', 'annotations = this.annotations = annotations.filter').replace('function deleteAnnotation', 'this.deleteAnnotation = function') + '\nthis.deleteAnnotation(2);')
    .call(ctx, ctx.annotations, ctx.document, ctx.renumberAnnotations, ctx.rebuildTable, ctx.redrawCanvas, ctx.applyAutoNumbering);
  assert.deepStrictEqual(ctx.annotations.map(a => a.number), [1, 2], '2 silinince 1,3 → 1,2: ' + JSON.stringify(ctx.annotations));
  assert(numaralandi === 1 && tabloKuruldu === 1 && cizildi === 1, 'numarala + tablo + çizim birer kez');
}
// 8) Ctrl+tekerlek zoom: adim hareketle orantili ve sinirli (tek event en cok ~%16) — sabit x1.1 katlanmasi kalkti
{ const app = fs.readFileSync(__dirname + '/app.js', 'utf8'); const i = app.indexOf("canvas.addEventListener('wheel'"); const g = app.slice(i, app.indexOf('}, { passive: false });', i));
  assert(!g.includes('? 0.9 : 1.1') && g.includes('Math.exp(') && g.includes('deltaMode'), 'zoom adimi orantili olmali');
  const f = new Function('deltaY', 'deltaMode', 'const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1); return Math.exp(-Math.max(-60, Math.min(60, px)) * 0.0025);');
  assert(f(1000, 0) > 0.85 && f(-1000, 0) < 1.17, 'tek event siniri'); assert(Math.abs(f(4, 0) - 0.99) < 0.01, 'kucuk hareket kucuk adim'); }
// 9) kolaj dogrulama: beklenen/okunan eslesmesi (sayi kismi; R/± onekleri atilir; kisa onek kabul) + kolaj yerlesimi
assert(F.aiDogrulaEslesir('R 50','R50') && F.aiDogrulaEslesir('80 ±20','80') && F.aiDogrulaEslesir('40','±40') && F.aiDogrulaEslesir('12,5','12.5'), 'eslesmeli');
assert(!F.aiDogrulaEslesir('15','R10') && !F.aiDogrulaEslesir('21','15.1') && !F.aiDogrulaEslesir('0.1','') && !F.aiDogrulaEslesir('15','1'), 'eslesmemeli (yanlis kutu / bos)');
{ const L = F.aiKolajYerlesim(12); assert(L.W === 1200 && L.H === 420 && L.hucre.length === 12 && L.hucre[7].x === 480 && L.hucre[7].y === 140); }
assert(js.includes('aiKolajDogrula(kaynak, dogrulanacak') && js.includes('ELENEN: '), 'dogrulama akisa bagli degil');
console.log('✔ ai-balloon: kare/koordinat/tekil/JSON/mürekkep kutusu/kablolama — tüm kontroller geçti');
