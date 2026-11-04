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
const F = new Function('localStorage', 'document', js + '\nreturn {AI_BALON, aiKareler, aiTumKareler, aiAltKareler, aiCerceveDisi, aiDogrulaEslesir, aiKolajYerlesim, aiKareCoz, aiTekille, aiCozumle, aiYaziKutusu, aiBeklemeSn, aiMetinGruplari, aiOlcuMetniMi, aiSor};')(sandbox.localStorage, sandbox.document);

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
assert((/style\.css\?v=([^"]+)"/.exec(html) || [])[1] === vApp[1], 'style.css ?v= de aynı olmalı: yoksa tarayıcı eski stille açılır');
assert(!html.includes('draggable-toolbar') && html.includes('id="ustCubuk"') && html.includes('id="yanPanel"'), 'sabit düzen');
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
// 7b) Başlangıç numarası: gerçek gövdelerle ✓ / Uygula / yeniden numarala / hizala / silme sonrası / JSON yükleme
{ const app = fs.readFileSync(__dirname + '/app.js', 'utf8');
  const govde = ad => { const i = app.indexOf('function ' + ad + '('); assert(i >= 0, ad); return app.slice(i, app.indexOf('\n}', i) + 2); };
  const yeni = (numaralar, bas, yon = 'none') => {
    const girdi = { value: String(bas), addEventListener() { } };
    const ctx = new Function('girdi', 'numaralar', 'yon', `
      let currentBalloonShape, currentBalloonColor, currentLineColor, currentTextColor, currentFillType, currentBalloonSize, currentBalloonTextSize, currentFontFamily; let baslangicElle = false, balloonCounter = 1, textAnnotations = [], currentImage = null, imageLoaded = false, sonBildirim = '', tablo = 0;
      let annotations = numaralar.map((n, i) => ({ id: i + 1, number: n, rect: { x: 100 * i, y: 50, width: 40, height: 20 }, balloon: { x: 100 * i, y: 10 } }));
      const canvas = { width: 800, height: 600 }, autoNumberDirectionSelect = { value: yon };
      const document = { getElementById: id => id === 'startNumberInput' ? girdi : id === 'tableBody' ? { innerHTML: '' } : {} };
      const showNotification = m => { sonBildirim = m; }, redrawCanvas = () => { }, rebuildTable = () => { tablo++; }, addTableRow = () => { }, fitToScreen = () => { }, alert = m => { throw new Error(m); };
      const console = { log() { }, warn() { }, error(e) { throw e; } }; const window = {};
      class FileReader { readAsText(f) { this.onload({ target: { result: f } }); } }
      ${govde('balonBaslangicNo')}\n${govde('balonlariKaydir')}\n${govde('setStartNumber')}\n${govde('applyAutoNumbering')}\n${govde('renumberAnnotations')}
      ${app.slice(app.indexOf('const BALON_AYARLARI'), app.indexOf('\n];', app.indexOf('const BALON_AYARLARI')) + 3)}\n${govde('balonAyarindanEtkilenir')}\n${govde('balonAyarlariniKayittanAl')}\n${govde('balonSaatYonuSirala')}\n${govde('balonlarHizali')}\n${govde('balonYay')}\n${govde('autoAlignBalloons')}\n${govde('loadBackupFile')}
      return { setStartNumber, applyAutoNumbering, renumberAnnotations, autoAlignBalloons, loadBackupFile, secili: () => { baslangicElle = true; },
        no: () => annotations.map(a => a.number), sayac: () => balloonCounter, tablo: () => tablo };`)(girdi, numaralar, yon);
    ctx.girdi = girdi; return ctx;
  };
  let c = yeni([7, 8, 9], 21); c.setStartNumber();
  assert.deepStrictEqual(c.no(), [21, 22, 23], '✓ balonları kaydırmalı'); assert.strictEqual(c.sayac(), 24, 'sonraki balon'); assert.strictEqual(c.tablo(), 1, 'tablo yenilenmeli');
  c = yeni([1, 2, 5], 10); c.setStartNumber(); assert.deepStrictEqual(c.no(), [10, 11, 14], 'elle verilen aralık korunur');
  c = yeni([], 21); c.setStartNumber(); assert.strictEqual(c.sayac(), 21, 'boşken sonraki balon');
  c = yeni([7, 8, 9], 21); c.applyAutoNumbering(); assert.deepStrictEqual(c.no(), [21, 22, 23], 'yönsüz Uygula da kaydırmalı');
  c = yeni([3, 1, 2], 21, 'left-right'); c.applyAutoNumbering(); assert.deepStrictEqual(c.no(), [21, 22, 23], 'sıralama yeni başlangıçtan');
  c = yeni([30, 31, 32], 21, 'left-right'); c.applyAutoNumbering(); assert.deepStrictEqual(c.no(), [21, 22, 23], 'başlangıç küçülünce de');
  c = yeni([1, 2, 3], 21); c.renumberAnnotations(); assert.deepStrictEqual(c.no(), [21, 22, 23], 'yeniden numarala');
  c = yeni([22, 23], 21); c.renumberAnnotations(); assert.deepStrictEqual(c.no(), [21, 22], 'ilk balon silinince başlangıç kaymamalı');
  c = yeni([1, 2, 3], 21); c.autoAlignBalloons(); assert.deepStrictEqual(c.no().slice().sort((a, b) => a - b), [21, 22, 23], 'hizala');
  const kayit = JSON.stringify({ balloonCounter: 4, annotations: [{ id: 1, number: 1, rect: {} }, { id: 2, number: '2', rect: {} }, { id: 3, number: 3, rect: {} }] });
  c = yeni([], 21); c.secili(); c.loadBackupFile(kayit); assert.deepStrictEqual(c.no(), [21, 22, 23], 'seçili başlangıçla JSON'); assert.strictEqual(c.sayac(), 24);
  c = yeni([], 1); c.loadBackupFile(kayit); assert.deepStrictEqual(c.no(), [1, '2', 3], 'seçim yoksa kayıt aynen');
  const kayit40 = JSON.stringify({ balloonCounter: 42, annotations: [{ id: 1, number: 40, rect: {} }, { id: 2, number: 41, rect: {} }] });
  c = yeni([], 1); c.loadBackupFile(kayit40); assert.strictEqual(c.girdi.value, 40, 'kutu kaydın başlangıcını göstermeli'); assert.deepStrictEqual(c.no(), [40, 41]);
  c.renumberAnnotations(); assert.deepStrictEqual(c.no(), [40, 41], 'kayıt 1\'e çekilmemeli');
  c.girdi.value = '100'; c.applyAutoNumbering(); assert.deepStrictEqual(c.no(), [100, 101], 'yüklenen kayıtta Uygula');
  assert(app.replace(/\r\n/g, '\n').includes("addEventListener('change', () => {\n        baslangicElle = true;"), 'kutu değişimi seçim sayılmalı');
}
// 7c) Balon ayarları sonradan değişir: kutu → çizilmiş balonlar; varsayılana dön; JSON kutuları eşitler; turuncu balon korunur
{ const app = fs.readFileSync(__dirname + '/app.js', 'utf8');
  const govde = ad => { const i = app.indexOf('function ' + ad + '('); assert(i >= 0, ad); return app.slice(i, app.indexOf('\n}', i) + 2); };
  const tablo = app.slice(app.indexOf('const BALON_AYARLARI'), app.indexOf('\n];', app.indexOf('const BALON_AYARLARI')) + 3);
  const tek = ad => { const i = app.indexOf('function ' + ad + '('); return app.slice(i, app.indexOf('\n', i)); };
  const ort = new Function(`
    let currentFillType = 'empty', currentBalloonShape = 'square', currentBalloonColor = 'x', currentBalloonSize = 9, currentBalloonTextSize = 9, currentLineColor = 'x', currentTextColor = 'x', currentTextSize = 9, currentTextBox = 'x', currentFontFamily = 'x';
    let currentMetinRengi = 'x'; let textAnnotations = [{ color: '#ffffff', fontSize: 9, hasBox: false, fontFamily: 'x' }]; let annotations = [{ fillType: 'empty', balloonColor: '#e74c3c' }, { fillType: 'empty', balloonColor: '#e67e22', aiKontrol: true }], baslangicElle = true, balloonCounter = 3, ciz = 0;
    const redrawCanvas = () => { ciz++; }, showNotification = () => { }, console = { log() { } };
    const kutu = {}, document = { getElementById: id => (kutu[id] = kutu[id] || { value: '' }) };
    ${tablo}\n${tek('balonAyarDegeri')}\n${tek('balonAyarindanEtkilenir')}\n${govde('balonAyarUygula')}\n${govde('balonAyarlariniKayittanAl')}\n${govde('resetToDefaults')}
    return { resetToDefaults, balonAyarUygula, balonAyarlariniKayittanAl, ayar: alan => BALON_AYARLARI.find(a => a.alan === alan), ayar2: id => BALON_AYARLARI.find(a => a.id === id), an: () => annotations, yukle: l => { annotations = l; }, metinler: () => textAnnotations, metinYukle: l => { textAnnotations = l; }, metinRengi: () => currentMetinRengi,
      dolgu: () => currentFillType, renk: () => currentBalloonColor, yazi: () => currentTextColor, boyut: () => currentBalloonSize, ciz: () => ciz, kutu, deger: balonAyarDegeri };`)();
  assert.strictEqual(new Set(['balloonShape','balloonColor','lineColor','textColor','fillType','balloonSize','balloonTextSize','fontFamily'].map(a => !!ort.ayar(a))).size, 1, 'tüm ayarlar tabloda');
  for (const a of ['balloonShape', 'lineColor', 'textColor', 'fontFamily', 'balloonSize', 'balloonTextSize', 'fillType']) { ort.balonAyarUygula(ort.ayar(a), 'Y'); assert(ort.an().every(b => b[a] === 'Y'), a + ' çizilmiş balonlara uygulanmalı'); }
  ort.balonAyarUygula(ort.ayar('balloonColor'), '#2ecc71');
  assert.deepStrictEqual(ort.an().map(b => b.balloonColor), ['#2ecc71', '#e67e22'], 'renk uygulanır, turuncu kontrol balonu korunur'); assert.strictEqual(ort.renk(), '#2ecc71');
  assert.strictEqual(ort.deger(ort.ayar('balloonSize'), { value: '33' }), 33); assert.strictEqual(ort.deger(ort.ayar('balloonSize'), { value: '' }), 20, 'boş boyut varsayılana');
  const c0 = ort.ciz(); ort.resetToDefaults();
  assert.strictEqual(ort.dolgu(), 'filled', 'varsayılana dön: değer de dolu'); assert.strictEqual(ort.kutu.fillTypeSelect.value, 'filled');
  assert.strictEqual(ort.yazi(), '#ffffff'); assert.strictEqual(ort.kutu.textColorSelect.value, '#ffffff', 'yazı kutusu gerçek rengi göstermeli');
  assert.strictEqual(ort.boyut(), 20); assert(ort.an().every(b => b.fillType === 'filled' && b.balloonSize === 20), 'balonlar da döner'); assert(ort.ciz() > c0, 'yeniden çizim');
  assert.strictEqual(ort.an()[1].balloonColor, '#e67e22', 'varsayılana dönüşte de turuncu kalır');
  // JSON: tek tip değer kutuya gelir, karışık olan kutuyu değiştirmez
  ort.yukle([{ fillType: 'empty', balloonSize: 25, lineColor: 'a' }, { fillType: 'empty', balloonSize: 25, lineColor: 'b' }]);
  ort.kutu.lineColorSelect.value = 'k'; ort.balonAyarlariniKayittanAl();
  assert.strictEqual(ort.kutu.fillTypeSelect.value, 'empty'); assert.strictEqual(ort.dolgu(), 'empty'); assert.strictEqual(ort.boyut(), 25); assert.strictEqual(ort.kutu.lineColorSelect.value, 'k', 'karışık değer kutuyu değiştirmez');
  // Metin: renk/boyut/kutu/stil çizilmiş metne de uygulanır; numara rengi metni, metin rengi balonu etkilemez
  const m0 = ort.metinler()[0], b0 = ort.an()[0]; const numara = b0.textColor;
  ort.balonAyarUygula(ort.ayar2('metinRenkSelect'), '#e74c3c'); assert.strictEqual(m0.color, '#e74c3c', 'metin rengi metne'); assert.strictEqual(b0.textColor, numara, 'metin rengi balona geçmemeli'); assert.strictEqual(ort.metinRengi(), '#e74c3c');
  ort.balonAyarUygula(ort.ayar('textColor'), '#000000'); assert.strictEqual(m0.color, '#e74c3c', 'numara rengi metni değiştirmemeli');
  ort.balonAyarUygula(ort.ayar2('textSizeInput'), 30); assert.strictEqual(m0.fontSize, 30);
  ort.balonAyarUygula(ort.ayar2('textBoxSelect'), 'box'); assert.strictEqual(m0.hasBox, true, 'kutu seçimi');
  ort.balonAyarUygula(ort.ayar('fontFamily'), 'Verdana'); assert.strictEqual(m0.fontFamily, 'Verdana', 'stil metne de'); assert.strictEqual(b0.fontFamily, 'Verdana');
  ort.yukle([]); ort.metinYukle([{ color: '#3498db', fontSize: 22, hasBox: true, fontFamily: 'Arial' }]); ort.kutu.fontFamilySelect.value = 'k'; ort.balonAyarlariniKayittanAl();
  assert.strictEqual(ort.kutu.metinRenkSelect.value, '#3498db', 'JSON metin rengi kutuya'); assert.strictEqual(ort.kutu.textBoxSelect.value, 'box'); assert.strictEqual(ort.kutu.textSizeInput.value, 22);
  ort.resetToDefaults(); assert.strictEqual(ort.kutu.metinRenkSelect.value, '#000000'); assert.strictEqual(ort.metinler()[0].color, '#000000', 'varsayılan metin siyah'); assert.strictEqual(ort.metinler()[0].hasBox, false);
  assert(app.includes('color: currentMetinRengi,') && !/color: currentTextColor/.test(app), 'yeni metin beyaz numara rengini almamalı');
  assert(html.includes('id="metinRenkSelect"'), 'metin rengi kutusu');
  const i = html.indexOf('id="textColorSelect"'); assert(html.slice(i, html.indexOf('</select>', i)).includes('value="#ffffff" selected'), 'yazı kutusu varsayılanı Beyaz');
}
// 7e) Metin seçme/silme: kutu metni tıklanan yerde bulunur, üst üste en üstteki; silince seçim kalkar; geri al tanımlı değişken kullanır
{ const app = fs.readFileSync(__dirname + '/app.js', 'utf8');
  const govde = ad => { const i = app.indexOf('function ' + ad + '('); assert(i >= 0, ad); return app.slice(i, app.indexOf('\n}', i) + 2); };
  const o = new Function(`let textAnnotations = [{ isBoxText: true, x: 10, y: 10, width: 100, height: 30, text: 'A', fontSize: 16 }, { isBoxText: true, x: 50, y: 20, width: 100, height: 30, text: 'B', fontSize: 16 }, { x: 300, y: 300, text: 'eski', fontSize: 20 }];
    let seciliMetin = textAnnotations[1], hoveredTextBox = textAnnotations[1], ciz = 0;
    const ctx = { measureText: () => ({ width: 40 }) }, redrawCanvas = () => { ciz++; }, showNotification = () => { };
    ${govde('metinAlani')}\n${govde('metinBul')}\n${govde('metniSil')}
    return { metinBul, metniSil, liste: () => textAnnotations.map(t => t.text), secili: () => seciliMetin, hover: () => hoveredTextBox, ciz: () => ciz };`)();
  assert.strictEqual(o.metinBul(20, 20).text, 'A'); assert.strictEqual(o.metinBul(60, 25).text, 'B', 'üst üste en üstteki'); assert.strictEqual(o.metinBul(320, 310).text, 'eski', 'eski tek satır metin'); assert.strictEqual(o.metinBul(500, 500), null);
  o.metniSil(o.metinBul(60, 25)); assert.deepStrictEqual(o.liste(), ['A', 'eski']); assert.strictEqual(o.secili(), null); assert.strictEqual(o.hover(), null); assert.strictEqual(o.ciz(), 1, 'yeniden çizim');
  assert(!/\btextBoxes\b/.test(app), 'geri al tanımsız değişken kullanmamalı');
  assert(app.includes('if (isTextMode && !tiklananMetin)') && app.includes("e.key !== 'Delete'"), 'seçim + Delete kablolaması');
}
// 7d) Renkli çizim: saf yeşil yazı mürekkep sayılır, griler değişmez; yakında siyah çizgi varken de kutu bulunur
{ const i = js.indexOf('function aiGriVeri('); const griVeri = new Function(js.slice(i, js.indexOf('\n}', i) + 2) + '\nreturn aiGriVeri;')();
  const piksel = [[0, 255, 0], [255, 255, 0], [255, 0, 0], [120, 120, 120], [255, 255, 255]];
  const d = new Uint8ClampedArray(piksel.flatMap(p => [...p, 255]));
  assert.deepStrictEqual([...griVeri({ width: 5, height: 1, getContext: () => ({ getImageData: () => ({ data: d }) }) })], [0, 0, 0, 120, 255], 'en koyu kanal');
  // Yazı: 3 rakam (saf yeşil → griVeri 0), altında siyah parça çizgisi. Eski parlaklıkla (150) eşik 128'di, kutu çıkmıyordu
  const W = 180, H = 180, g = new Uint8Array(W * H).fill(255), kutu = griVeri_ => F.aiYaziKutusu(griVeri_, W, H, 90, 90, 90, 3);
  const rakam = (x0, v) => { for (let y = 80; y < 100; y++) for (let x = x0; x < x0 + 12; x++) if (y < 83 || y > 96 || x < x0 + 3 || x > x0 + 8) g[y * W + x] = v; };
  for (let x = 0; x < W; x++) g[150 * W + x] = 0;
  [68, 84, 100].forEach(x => rakam(x, 150)); assert.strictEqual(kutu(g), null, 'parlaklık 150 mürekkep değil (eski hata)');
  [68, 84, 100].forEach(x => rakam(x, 0)); const k = kutu(g); assert(k && k.x <= 68 && k.x + k.width >= 112 && k.y <= 80 && k.y + k.height >= 100 && k.y + k.height < 140, 'yeşil yazı kutusu: ' + JSON.stringify(k));
}
// 8) Ctrl+tekerlek zoom: adim hareketle orantili ve sinirli (tek event en cok ~%16) — sabit x1.1 katlanmasi kalkti
{ const app = fs.readFileSync(__dirname + '/app.js', 'utf8'); const i = app.indexOf("canvas.addEventListener('wheel'"); const g = app.slice(i, app.indexOf('}, { passive: false });', i));
  assert(!g.includes('? 0.9 : 1.1') && g.includes('Math.exp(') && g.includes('deltaMode'), 'zoom adimi orantili olmali');
  const f = new Function('deltaY', 'deltaMode', 'const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1); return Math.exp(-Math.max(-60, Math.min(60, px)) * 0.0025);');
  assert(f(1000, 0) > 0.85 && f(-1000, 0) < 1.17, 'tek event siniri'); assert(Math.abs(f(4, 0) - 0.99) < 0.01, 'kucuk hareket kucuk adim'); }
// 9) kolaj dogrulama: beklenen/okunan eslesmesi (sayi kismi; R/± onekleri atilir; kisa onek kabul) + kolaj yerlesimi
assert(F.aiDogrulaEslesir('R 50','R50') && F.aiDogrulaEslesir('80 ±20','80') && F.aiDogrulaEslesir('40','±40') && F.aiDogrulaEslesir('12,5','12.5'), 'eslesmeli');
// kutu yalnız toleransı / adet önekinden sonrasını sardı: okuma doğru, elenmemeli (sentetik sınav); yanlış kutu yine elenir
assert(F.aiDogrulaEslesir('3x ø6','ø6') && F.aiDogrulaEslesir('50 ±0.5','±0.5') && !F.aiDogrulaEslesir('2','±0.2') && !F.aiDogrulaEslesir('38','30'), 'adet öneki / tolerans kutusu');
assert(!F.aiDogrulaEslesir('15','R10') && !F.aiDogrulaEslesir('21','15.1') && !F.aiDogrulaEslesir('0.1','') && F.aiDogrulaEslesir('0.1','0.') && F.aiDogrulaEslesir('15','1') && F.aiDogrulaEslesir('417','17'), 'eslesmemeli (yanlis kutu / bos); kesik okuma (onek) kabul');
{ const L = F.aiKolajYerlesim(12); assert(L.W === 1200 && L.H === 540 && L.hucre.length === 12 && L.hucre[7].x === 900 && L.hucre[7].y === 180); }
assert(js.includes('aiKolajDogrula(kaynak, dogrulanacak') && js.includes('ELENEN: '), 'dogrulama akisa bagli degil');
// 10) Sıfırla düğmesi: Fit yanında, clearAll'a bağlı; clearAll onay sorar, fileName yoksa hata vermez, PDF sayfasını bırakır
{ const app = fs.readFileSync(__dirname + '/app.js', 'utf8');
  assert(html.includes('id="resetAllBtn"') && html.indexOf('id="zoomResetBtn"') < html.indexOf('id="resetAllBtn"'), 'Sıfırla düğmesi Fit yanında olmalı');
  assert(app.includes("resetAllBtn.addEventListener('click', clearAll)"), "düğme clearAll'a bağlı değil");
  const i = app.indexOf('function clearAll()'); const g = app.slice(i, app.indexOf(String.fromCharCode(10) + '}', i));
  assert(g.includes("confirm('TÜM VERİLERİ") && g.includes("if (fn) fn.textContent") && g.includes('window.__aiPdfPage = null') && g.includes('lines = []'), 'clearAll: onay / fileName güvenliği / PDF ve çizgi sıfırlama'); }
// GÜVENLİK AĞI — yazı grupları: "12.5" (nokta silinince 0,46h boşluk) TEK grup; 1,55h altındaki satır AYRI grup;
//   üstünde ölçü çizgisi olan grup cz > 0, çizgiden 2h'ten uzak (not) grup cz = 0; ok ucu gibi ince tek parça grup değil
{ const W = 400, H = 300, g = new Uint8Array(W * H).fill(255), h = 26;
  const kutu = (x, y, w, hh, t = 3) => { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) if (xx < x + t || xx >= x + w - t || yy < y + t || yy >= y + hh - t) g[yy * W + xx] = 0; };
  const dolu = (x, y, w, hh) => { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = 0; };
  kutu(100, 100, 16, 26); kutu(120, 100, 16, 26); kutu(148, 100, 16, 26);        // "12" + "5" (arada nokta yeri)
  kutu(100, 140, 16, 26); kutu(120, 140, 16, 26);                                // alt satır (merkezler 40 px = 1,55h)
  kutu(100, 240, 16, 26); kutu(120, 240, 16, 26);                                // çizgiden uzak satır (not)
  dolu(60, 88, 200, 2);                                                          // üst satırın üstündeki ölçü çizgisi
  dolu(300, 200, 22, 5);                                                         // ok ucu benzeri ince parça
  const gr = F.aiMetinGruplari(g, W, H, { x0: 0, y0: 0, x1: W, y1: H }, h).sort((a, b) => a.y - b.y);
  assert.strictEqual(gr.length, 3, 'grup sayısı: ' + JSON.stringify(gr));
  assert.strictEqual(gr[0].n, 3, '"12.5" tek grup olmalı'); assert.strictEqual(gr[1].n, 2, 'alt satır ayrı grup');
  assert(gr[0].cz > 0 && gr[2].cz === 0, 'çizgi yakınlığı: ' + gr.map(x => x.cz));
  // delik / yazı ayrımı (iç boşluk sayısı): eksen artılı delik çemberi yazı DEĞİL; birbirine değen iki rakam (kareye yakın
  //   tek parça, "34") yazıdır — eskiden "kare + iri" ölçütüyle delik sanılıp atılıyordu
  { const W2 = 200, H2 = 120, g2 = new Uint8Array(W2 * H2).fill(255), set = (x, y) => { g2[y * W2 + x] = 0; };
    for (let a = 0; a < 720; a++) { const t = a * Math.PI / 360; for (const r of [11, 12]) set(Math.round(50 + r * Math.cos(t)), Math.round(50 + r * Math.sin(t))); }
    for (let i = -15; i <= 15; i++) { set(50 + i, 50); set(50, 50 + i); }                                   // eksen artısı
    const kt = (x, y, w, hh) => { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) if (xx < x + 3 || xx >= x + w - 3 || yy < y + 3 || yy >= y + hh - 3) set(xx, yy); };
    kt(120, 40, 12, 26); kt(131, 40, 12, 26);                                                               // değen iki "rakam" (23×26)
    const gg = F.aiMetinGruplari(g2, W2, H2, { x0: 0, y0: 0, x1: W2, y1: H2 }, 26);
    assert(!gg.some(g => g.cx < 80), 'artılı delik yazı sayılmamalı: ' + JSON.stringify(gg));
    assert(gg.some(g => g.cx > 110 && g.cx < 150), 'değen iki rakam yazı sayılmalı: ' + JSON.stringify(gg)); }
  // okunan metin ölçü mü
  for (const s of ['48', '0.1', 'R5', 'ø8', '4x ø11', 'M8x1.25', '1×45°', '80 ±20', '27 +0.2/-0.1', 'Ø60 H7', '12,5']) assert(F.aiOlcuMetniMi(s), 'ölçü sayılmalı: ' + s);
  for (const s of ['VW 10500', '2:1', 'A3', '63g', '0', '', 'Folie', '(420']) assert(!F.aiOlcuMetniMi(s), 'ölçü sayılmamalı: ' + s);
  assert(js.includes('aiGuvenlikAgi(kaynak, KW, KH, kutular, mevcut') && js.includes('kutular.push(...ag.yeni)'), 'güvenlik ağı ana akışa bağlı değil'); }
// güvenlik ağı TÜM sayfayı tarar (yakınlık şartı görünüşü komple kaçırıyordu); doğrulanamayan okuma TURUNCU işaretlenir, sessizce kabul edilmez
{ const ag = js.slice(js.indexOf('async function aiGuvenlikAgi('), js.indexOf('function aiDurum('));
  assert(!/yakin\(g, x\.k\)/.test(ag) && ag.includes('const b = { x0: 0, y0: 0, x1: KW, y1: KH }'), 'güvenlik ağı tüm sayfayı taramalı');
  assert(ag.includes('if (g.n > karakter(x.o.deger)) tekrar.push'), 'tolerans yeniden okuması karakter sayısına bağlı olmalı');
  assert(ag.includes("if (!teyit.has(x)) x.o.kontrol = true") && js.includes("if (!okunan.has(x)) x.o = { ...x.o, kontrol: true }") && js.includes("o.kontrol ? '#e67e22'"), 'doğrulanamayan okuma turuncu olmalı'); }
// aiSor: ilk model 429 (kota) → yedek modele geçer ve sonraki çağrılar da yedekte kalır; 403 fırlatılır (sessiz geçilmez)
(async () => {
  const istek = []; let kod = 429;
  globalThis.fetch = async (u, o) => { const m = (/models\/([^:]+):/.exec(u) || [])[1]; istek.push(m);   // ERP: model adreste (doğrudan Gemini)
    if (m === F.AI_BALON.MODELLER[0] && kod === 429) return { ok: false, status: 429, text: async () => 'quota' };
    if (kod === 403) return { ok: false, status: 403, text: async () => 'yetki' };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) }; };
  const ayar = { model: F.AI_BALON.MODELLER[0], key: 'x' }; F.AI_BALON.mi = 0;
  assert.strictEqual(await F.aiSor('b64', ayar, 'i'), '[]'); assert.deepStrictEqual(istek, F.AI_BALON.MODELLER.slice(0, 2), 'yedek modele geçmeli: ' + istek);
  istek.length = 0; await F.aiSor('b64', ayar, 'i'); assert.deepStrictEqual(istek, [F.AI_BALON.MODELLER[1]], 'sonraki çağrı yedekte kalmalı');
  kod = 403; await assert.rejects(() => F.aiSor('b64', ayar, 'i'), e => e.status === 403);
  // son model de GÜNLÜK kotada → saatlerce beklemeden kota hatası (ücretsiz katman 500/gün; ekran takılmış görünüyordu)
  F.AI_BALON.mi = F.AI_BALON.MODELLER.length - 1; const t0 = Date.now();
  globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","retryDelay":"10957s"}' });
  await assert.rejects(() => F.aiSor('b64', ayar, 'i'), e => e.kota === true); assert(Date.now() - t0 < 1000, 'günlük kotada beklememeli');
  console.log('✔ ai-balloon (ERP): kare/koordinat/tekil/JSON/mürekkep kutusu/kablolama/güvenlik ağı/yedek model — tüm kontroller geçti');
})().catch(e => { console.error(e); process.exit(1); });

