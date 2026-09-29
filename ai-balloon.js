// ═══════════════════════════════════════════════════════════════════════════
//  OTOMATİK BALONLAMA — Gemini görme modeli (manuel dikdörtgen çizimi aynen kalır)
//  Kaynak mantık: KaliteKontrol/ai_okuyucu.py + balonla.py'de ÖLÇÜLEREK bulunan kurallar:
//   · çizim 1400 px karelere (200 px örtüşme) bölünür; model küçük yazıyı tam karede okuyamıyor
//   · model konumu 0–1000 NORMALİZE verir (ham piksel sanmak ~280 px kaydırıyordu)
//   · model NE olduğunu bilir, NEREDE olduğunu kabaca; balon konumun yakınındaki MÜREKKEP kutusuna oturur
//   · konumda mürekkep yoksa "hayalet okuma" → SESSİZCE ATILIR (yanlış balon, eksik balondan kötüdür)
//   · işaretli değer ("+0.2", "-0.2") tolerans metnidir, ölçü değil
//  Anahtar: ⚙️ API sayfasında (localStorage ocr_gemini_key) — kaynak koda yazılmaz.
// ═══════════════════════════════════════════════════════════════════════════
const AI_BALON = {
    KARE: 1400, ORTUSME: 200, KADANS_MS: 3000, DENEME: 4,
    // İKİ GEÇİŞ: 1) 1400 px kareler — büyük/orta ölçüler; 2) 700 px kareler 2× BÜYÜTÜLEREK gönderilir — delik grubu
    //   çevresindeki 12/13/5/R1 gibi küçük yazılar tek geçişte okunmuyordu (6FA.881.989'da ölçüldü). Aynı ölçü iki
    //   geçişte de gelirse tekilleştirme (90 px) teke indirir. Maliyet: A3 çizimde 6 + 24 = 30 istek (~1,5 dk).
    GECISLER: [{ kare: 1400, ortusme: 200, olcek: 1 }, { kare: 700, ortusme: 120, olcek: 2 }],
    MODELLER: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3-flash-preview'],
    ISTEM: "Bu bir teknik resmin bir bölümü. Görevin BOYUTSAL ÖLÇÜLERİ okumak.\nSADECE ölçü çizgisine bağlı sayıları listele.\nLİSTELEME: daire içindeki referans/pozisyon numaraları, sayfa çerçevesi pafta numaraları, standart kodları (VW 10500, DIN 1451, TL 1010, ISO 845 gibi), not cümlelerinin içindeki sayılar, tablo hücreleri, antet/başlık bloğu, revizyon tablosu.\nÖLÇÜLER 90 DERECE DÖNDÜRÜLMÜŞ (DİKEY) DE YAZILIR: yandan görünüşlerde ve dar alanlarda sayı yan yatar. Bunları da oku, atlama.\nYARIÇAP VE ÇAP ÖLÇÜLERİNİ DE LİSTELE: R15, R50, ø8 gibi. Öneki (R ya da ø) mutlaka koru — \"R15\" yaz, \"15\" değil. Yarıçaplar genelde küçük ve EĞİK yazılır, kavis okuyla gösterilir; kösede ya da çizimin kenarinda kalanları da atlama.\nGENEL TOLERANS TABLOSUNU LİSTELEME: \">400 \" ile başlayan aralık-tolerans satırları ve açı toleransı ölçü DEĞİLDİR; o tablodaki 400, 120, 30, 6, 2.0, 1.6, 0.6, 0.3 gibi sayıları yazma.\nÖLÇEK NOTUNU ASLA LİSTELEME: \"1:5\", \"1:1\", \"2:1\" gibi oranlar ve bunların yanındaki görünüş/detay adları ölçü DEĞİLDİR; oranın tek bir rakamını da (1 ya da 5) ölçü diye yazma. Aynı şekilde kağıt formatı (A1, A3), tarih (31.07.2025), sayfa no ve ağırlık (63g) ölçü değildir.\nGEOMETRİK TOLERANS ÇERÇEVESİNDEKİ DEĞERLERİ LİSTELEME: konum/düzlemsellik/profil çerçevelerindeki 0.1, 0.5 gibi sayılar ve datum harfleri ölçü DEĞİLDİR (6FA.881.989'da üç kez balonlanmıştı).\nOndalık ayracı NOKTA yaz. Çap işaretini ø, yarıçapı R olarak koru.\nHer ölçü için: {\"deger\": \"48\", \"x\": 123, \"y\": 456}\nx,y = ölçü YAZISININ bu görüntüdeki piksel merkezi (sol üst köşe 0,0).\nYalnız JSON dizisi döndür, başka hiçbir şey yazma.",
    iptal: false
};

function aiAyar() {
    return {
        enabled: localStorage.getItem('ocr_gemini_enabled') === 'true',
        key: (localStorage.getItem('ocr_gemini_key') || '').trim(),
        model: (localStorage.getItem('ocr_gemini_model') || '').trim() || AI_BALON.MODELLER[0]
    };
}

// Model çıktısındaki JSON dizisini ayıkla (kod bloğu içinde de gelebilir)
function aiCozumle(metin) {
    const g = /\[[\s\S]*\]/.exec(metin || '');
    if (!g) return [];
    try { const v = JSON.parse(g[0]); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

// Örtüşen karelerden gelen aynı ölçüyü teke indir
function aiTekille(liste, esik = 90) {
    const temiz = [];
    for (const s of liste) {
        if (temiz.some(t => t.deger === s.deger && Math.abs(t.x - s.x) < esik && Math.abs(t.y - s.y) < esik)) continue;
        temiz.push(s);
    }
    return temiz;
}

async function aiGemini(b64, model, key) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
    const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: AI_BALON.ISTEM }, { inline_data: { mime_type: 'image/png', data: b64 } }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: 'application/json' }
        })
    });
    if (!r.ok) { const body = await r.text(); const e = new Error('HTTP ' + r.status); e.status = r.status; e.body = body; throw e; }
    const d = await r.json();
    return (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts || []).map(p => p.text || '').join('');
}

// 429 gövdesindeki "retry in 7.6s" / retryDelay süresi (sn) — körü körüne beklemek yerine sunucunun dediği
function aiBeklemeSn(body, varsayilan) {
    let g = /retry in ([\d.]+)s/.exec(body || ''); if (g) return Math.min(+g[1] + 1.5, 60);
    g = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body || ''); return g ? Math.min(+g[1] + 1.5, 60) : varsayilan;
}
const aiUyu = ms => new Promise(r => setTimeout(r, ms));

// Kare listesi (test edilebilir, saf): [{x0,y0,x1,y1}]
function aiKareler(W, H, kare = AI_BALON.KARE, ortusme = AI_BALON.ORTUSME) {
    const out = [];
    for (let y0 = 0; y0 < H; y0 += kare - ortusme) for (let x0 = 0; x0 < W; x0 += kare - ortusme) {
        const x1 = Math.min(x0 + kare, W), y1 = Math.min(y0 + kare, H);
        if (x1 - x0 < 200 || y1 - y0 < 200) continue;
        out.push({ x0, y0, x1, y1 });
    }
    return out;
}

// Bir karenin ham çıktısını GLOBAL piksele çevir (saf): model x,y 0–1000 normalize
function aiKareCoz(liste, k, W, H) {
    const out = [];
    for (const o of liste) {
        let d = String(o && o.deger != null ? o.deger : '').trim().replace(/^([RrøØ⌀])\s+/, '$1');   // "R 50" → "R50"
        if (!d || '+-±'.includes(d[0])) continue;                          // tolerans metni ("+0.2", "±20" — 6FA'da ölçüldü)
        const x = (+o.x) / 1000 * (k.x1 - k.x0) + k.x0, y = (+o.y) / 1000 * (k.y1 - k.y0) + k.y0;
        if (isFinite(x) && isFinite(y) && x >= 0 && x < W && y >= 0 && y < H) out.push({ deger: d, x, y });
    }
    return out;
}

// Tüm kareleri okut → [{deger,x,y}] (kaynak canvas pikseli). Kota/hız sınırı: kadans + 429'da yedek model
// Tüm geçişlerin kareleri (saf): [{x0,y0,x1,y1,olcek}]. Büyük (yüksek çözünürlüklü, ≥14 MP) görüntüde 1400 px
//   kare zaten küçük yazıyı okur; 2× geçişi yalnız küçük görüntülerde (kare sayısı ve kota patlamasın: A1 6000 px'te
//   ikinci geçiş 100 istek olurdu).
function aiTumKareler(W, H, gecisler = AI_BALON.GECISLER) {
    const out = [], buyuk = W * H >= 14e6;
    for (const g of gecisler) { if (buyuk && g.olcek > 1) continue; for (const k of aiKareler(W, H, g.kare, g.ortusme)) out.push({ ...k, olcek: g.olcek }); }
    return out;
}

// OKUMA KAYNAĞI — canvas değil, EN YÜKSEK çözünürlük: uygulama canvas'ı 4000×3000'e küçültüyor (6FA.881.989 TIFF
//   6622 px → %60; PDF 2× render → sınıra kırpılıyor), küçük ölçü yazıları (12/13/5/R1) o küçültmede okunmaz oluyordu.
//   PDF: sayfa ~6000 px genişliğe yeniden çizilir; TIFF/PNG: yüklenen görüntünün doğal boyutu.
async function aiKaynakHazirla() {
    const page = window.__aiPdfPage;
    if (page) {
        const v1 = page.getViewport({ scale: 1 }); const scale = Math.min(4, Math.max(1, 6000 / v1.width));
        const vp = page.getViewport({ scale }); const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        return { kaynak: c, KW: c.width, KH: c.height, ad: 'PDF ' + c.width + '×' + c.height };
    }
    const KW = currentImage.naturalWidth || currentImage.width, KH = currentImage.naturalHeight || currentImage.height;
    return { kaynak: currentImage, KW, KH, ad: 'görüntü ' + KW + '×' + KH };
}

// Kaynak (orijinal çözünürlük) üzerinde, model konumu etrafındaki pencereyi kesip mürekkep kutusunu bulur;
//   kutu ORİJİNAL piksel döner. R: pencere yarıçapı (orijinal piksel).
function aiPencereKutusu(kaynak, KW, KH, mx, my, R, karakter) {
    const x0 = Math.max(0, Math.round(mx - R)), y0 = Math.max(0, Math.round(my - R));
    const x1 = Math.min(KW, Math.round(mx + R)), y1 = Math.min(KH, Math.round(my + R));
    if (x1 - x0 < 4 || y1 - y0 < 4) return null;
    const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0;
    c.getContext('2d').drawImage(kaynak, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    const k = aiYaziKutusu(aiGriVeri(c), c.width, c.height, mx - x0, my - y0, R, karakter);
    return k ? { x: k.x + x0, y: k.y + y0, width: k.width, height: k.height } : null;
}

async function aiKareleriOku(kaynak, W, H, ayar, ilerleme) {
    const kareler = aiTumKareler(W, H);
    const modeller = [ayar.model, ...AI_BALON.MODELLER.filter(m => m !== ayar.model)];
    let mi = 0, son = 0; const ham = []; const hatalar = [];
    for (let i = 0; i < kareler.length; i++) {
        if (AI_BALON.iptal) break;
        const k = kareler[i], w = k.x1 - k.x0, h = k.y1 - k.y0, s = k.olcek || 1;
        ilerleme(i + 1, kareler.length, modeller[mi]);
        const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(kaynak, k.x0, k.y0, w, h, 0, 0, c.width, c.height);   // 2. geçiş: 2× büyütme
        const b64 = c.toDataURL('image/png').split(',')[1];
        const bekle = AI_BALON.KADANS_MS - (Date.now() - son); if (son && bekle > 0) await aiUyu(bekle); son = Date.now();
        let metin = null;
        for (let deneme = 0; deneme < AI_BALON.DENEME && metin === null; deneme++) {
            try { metin = await aiGemini(b64, modeller[mi], ayar.key); }
            catch (e) {
                if (e.status === 429 && mi < modeller.length - 1) { mi++; continue; }          // günlük kota MODEL başına: yedek modele geç
                if (e.status === 429 || e.status >= 500) { await aiUyu(aiBeklemeSn(e.body, 5 * (deneme + 1)) * 1000); son = Date.now(); continue; }
                hatalar.push('kare ' + (i + 1) + ': ' + (e.status || e.message)); break;      // 400/403: anahtar/model sorunu
            }
        }
        if (metin === null) { if (!hatalar.length || hatalar[hatalar.length - 1].indexOf('kare ' + (i + 1)) < 0) hatalar.push('kare ' + (i + 1) + ': yanıt yok'); continue; }
        ham.push(...aiKareCoz(aiCozumle(metin), k, W, H));
    }
    return { olculer: aiTekille(ham), hatalar, kare: kareler.length };
}

// Model konumunun (mx,my) yakınındaki MÜREKKEP kutusu — saf geometri, kesin konum. Yoksa null (hayalet).
// gri: Uint8Array (W*H) parlaklık; koyu = < 128
function aiYaziKutusu(gri, W, H, mx, my, R = 90, karakter = 0) {
    mx = Math.round(mx); my = Math.round(my);
    const px0 = Math.max(0, mx - R), px1 = Math.min(W, mx + R), py0 = Math.max(0, my - R), py1 = Math.min(H, my + R);
    if (px1 - px0 < 4 || py1 - py0 < 4) return null;
    const pw = px1 - px0, ph = py1 - py0;
    // 0) ÖLÇÜ ÇİZGİLERİNİ MASKELE: pencere kopyasında, pencereyi boydan boya geçen ince yatay/dikey çizgiler beyazlanır.
    //    Ölçüldü (MAN 6984): dikey ölçü çizgisi her satırı "koyu" yapıp dikey yazılmış 62/210/250'yi tek dev blokta
    //    eritiyor (→ hayalet sanılıp atıldı); yatay çizgi de "40" kutusunu 173 px'e uzatıyordu.
    // mürekkep eşiği pencereye uyarlı: soluk tarama / büyütülmüş ince yazı gri kalır (ölçüldü: 2× büyütülmüş "270"
    //   hiç <128 piksel vermedi); pencerenin en koyu pikseline göre 128–160 arası eşik
    let mn = 255; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const v = gri[(py0 + y) * W + px0 + x]; if (v < mn) mn = v; }
    const esik = Math.max(128, Math.min(160, Math.round((mn + 255) / 2)));
    const p = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) p[y * pw + x] = gri[(py0 + y) * W + px0 + x] < esik ? 1 : 0;
    const satT = new Int32Array(ph), sutT = new Int32Array(pw);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (p[y * pw + x]) { satT[y]++; sutT[x]++; }
    const cizgiSat = new Uint8Array(ph), cizgiSut = new Uint8Array(pw);
    //    %35: yazının yanından başlayıp pencerenin yarısını geçmeyen çizgi de maskelenir; rakam satırı/sütunu bu kadar
    //    uzun koyu şerit üretmez (3 rakam ≈ 45 px < 63), dikey yazı sütunları ise ince (≤5 px) olmadığı için korunur
    for (let y = 0; y < ph; y++) if (satT[y] >= pw * 0.35) cizgiSat[y] = 1;
    for (let x = 0; x < pw; x++) if (sutT[x] >= ph * 0.35) cizgiSut[x] = 1;
    // yalnız İNCE (≤5 px) şeritler çizgidir; kalın koyu bant (dolu şekil) yazı olmasa da maskelenmez
    const inceMi = (m, n) => { const out = new Uint8Array(n); let a = -1; for (let i = 0; i <= n; i++) { const k = i < n && m[i]; if (k && a < 0) a = i; else if (!k && a >= 0) { if (i - a <= 5) for (let j = a; j < i; j++) out[j] = 1; a = -1; } } return out; };
    const mS = inceMi(cizgiSat, ph), mX = inceMi(cizgiSut, pw);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (mS[y] || mX[x]) p[y * pw + x] = 0;
    // 1) satır projeksiyonu: koyu piksel sayısı; ince yatay çizgi (≤4 satır) yazı değildir
    const sat = new Int32Array(ph);
    for (let y = 0; y < ph; y++) { let n = 0; for (let x = 0; x < pw; x++) if (p[y * pw + x]) n++; sat[y] = n; }
    const bloklar = []; let a = -1;
    for (let i = 0; i <= sat.length; i++) {
        const koyu = i < sat.length && sat[i] > 0;
        if (koyu && a < 0) a = i; else if (!koyu && a >= 0) { bloklar.push([a, i - 1]); a = -1; }
    }
    // Blok birleştirme: ≤2 satır boşluk (kopuk rakam parçaları) YA DA boşluğun tamamı maskelenmiş çizgi satırı ise
    //   (rakamın ortasından geçen çizgi maskelenince rakam ikiye bölünüyordu). Çizgi dışı boşluklar (yazı ile
    //   ölçü çizgisi arası) birleştirilmez — MAN 6984'te "270" altındaki oklarla 95 px'e büyümüştü.
    const maskeli = (a, b) => { for (let y = a; y <= b; y++) if (!mS[y]) return false; return true; };
    const bir = []; for (const b of bloklar) { const son = bir.length ? bir[bir.length - 1] : null; if (son && (b[0] - son[1] <= 3 || maskeli(son[1] + 1, b[0] - 1))) son[1] = b[1]; else bir.push(b.slice()); }
    const aday = bir.filter(b => b[1] - b[0] + 1 >= 6 && b[1] - b[0] + 1 <= R * 1.35);   // yazı yüksekliği pencereyle orantılı
    if (!aday.length) return null;
    const my0 = my - py0;
    const sb = aday.reduce((en, b) => { const d = my0 < b[0] ? b[0] - my0 : my0 > b[1] ? my0 - b[1] : 0; return d < en.d ? { b, d } : en; }, { b: null, d: Infinity });
    if (!sb.b || sb.d > R * 0.45) return null;      // model sapması pencereyle orantılı (90 px → 40)
    const y0 = py0 + sb.b[0], y1 = py0 + sb.b[1] + 1;
    // 2) sütun projeksiyonu (yalnız o satır bloğunda); mx'e en yakın koyu sütun bloğu, ≤ yükseklik*0.6 boşlukları birleştir (rakam araları)
    const sut = new Int32Array(pw);
    for (let x = 0; x < pw; x++) { let n = 0; for (let y = y0 - py0; y < y1 - py0; y++) if (p[y * pw + x]) n++; sut[x] = n; }
    // İNCE YATAY ÇİZGİ SÜTUNLARI BOŞLUK SAYILIR: satır bloğu içinde yalnız 1–2 piksel koyu olan sütun rakam değil,
    //   yazının yanından başlayan ölçü çizgisidir (pencerenin %60'ını geçmediği için 0. adımda maskelenmemiş olabilir).
    //   Ölçüldü (MAN 6984): "40" kutusu çizgiyle birleşip 173 px olmuştu; rakam sütunlarında koyu sayısı ≥ 3.
    const esikSut = Math.max(2, Math.round((y1 - y0) * 0.12));
    const sb2 = []; a = -1;
    for (let i = 0; i <= sut.length; i++) { const koyu = i < sut.length && sut[i] > esikSut; if (koyu && a < 0) a = i; else if (!koyu && a >= 0) { sb2.push([a, i - 1]); a = -1; } }
    if (!sb2.length) return null;
    // rakam arası boşluk yüksekliğin yarısına kadar çıkabiliyor (MAN 6984 "270": 14 px / 35 px; %35 eşiği "270"i
    // tek rakama böldü). Yazının yanındaki referans balonu dairesi bu eşikle kutuya karışabilir — kabul: kutu
    // yalnız görsel çerçeve, balon numarası/değeri etkilenmez.
    const bosluk = Math.max(5, Math.round((y1 - y0) * 0.5));
    const bir2 = []; for (const b of sb2) { if (bir2.length && b[0] - bir2[bir2.length - 1][1] <= bosluk) bir2[bir2.length - 1][1] = b[1]; else bir2.push(b.slice()); }
    const mx0 = mx - px0;
    const sx = bir2.reduce((en, b) => { const d = mx0 < b[0] ? b[0] - mx0 : mx0 > b[1] ? mx0 - b[1] : 0; return d < en.d ? { b, d } : en; }, { b: null, d: Infinity });
    if (!sx.b || sx.d > R * 0.67) return null;      // (90 px → 60)
    let x0 = px0 + sx.b[0], x1 = px0 + sx.b[1] + 1;
    const h = y1 - y0;
    // Kutu, yazının beklenen genişliğinden ÇOK büyükse (kalın ölçü/uzatma çizgisi rakamlara bitişik: MAN 6984'te
    // "40" 116 px olmuştu) model konumu etrafında beklenen genişliğe kırpılır. Yatay yazı: beklenen = karakter × 0,75h;
    // dikey (döndürülmüş) yazı: genişlik tek rakam yüksekliği ≈ h / karakter.
    if (karakter > 0) {
        const yatay = h < (x1 - x0) * 1.2;
        const beklenen = Math.round(yatay ? h * 0.75 * karakter + h * 0.6 : (h / karakter) * 1.1 + 4);
        if (x1 - x0 > beklenen * 1.6) { const c = Math.min(Math.max(mx, x0 + beklenen / 2), x1 - beklenen / 2); x0 = Math.round(c - beklenen / 2); x1 = Math.round(c + beklenen / 2); }
    }
    const w = x1 - x0;
    if (w < 6 || w > R * 3.6 || h < 6) return null;
    return { x: x0, y: y0, width: w, height: h };
}

function aiGriVeri(kaynak) {
    const W = kaynak.width, H = kaynak.height, d = kaynak.getContext('2d').getImageData(0, 0, W, H).data, g = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    return g;
}

function aiDurum(msg, tip) {
    let el = document.getElementById('aiBalonDurum');
    if (!el) { el = document.createElement('div'); el.id = 'aiBalonDurum'; el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#2c3e50;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:80vw'; document.body.appendChild(el); }
    el.style.background = tip === 'err' ? '#c0392b' : tip === 'ok' ? '#27ae60' : '#2c3e50';
    el.textContent = msg; el.style.display = msg ? 'block' : 'none';
    if (!tip && msg) {   // okuma sürerken: Durdur — o ana kadar bulunanlarla devam eder
        const a = document.createElement('a'); a.href = '#'; a.textContent = ' ■ Durdur'; a.style.cssText = 'color:#ffb3b3;margin-left:12px;font-weight:600';
        a.onclick = e => { e.preventDefault(); AI_BALON.iptal = true; a.textContent = ' durduruluyor…'; }; el.appendChild(a);
    }
    if (tip === 'ok' || tip === 'err') setTimeout(() => { if (el.textContent === msg) el.style.display = 'none'; }, 12000);
}

// Ana akış: çizimi oku → mürekkep kutusuna hizala → balon + tablo satırı → Hizala
async function autoBalloonAI() {
    if (!imageLoaded || !currentImage) { alert('Önce bir teknik resim yükleyin.'); return; }
    const ayar = aiAyar();
    if (!ayar.key) { alert('Gemini API anahtarı girilmemiş.\n\n⚙️ API sayfasında "Gemini (Otomatik Balonlama)" kartına anahtarı yazıp kaydedin.'); window.open('api-setup.html', '_blank'); return; }
    if (annotations.length && !confirm('Mevcut ' + annotations.length + ' balon korunur, otomatik bulunanlar üstüne eklenir. Devam?')) return;
    const btn = document.getElementById('autoBalloonBtn'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Okunuyor…'; }
    AI_BALON.iptal = false; showLoading(true);
    try {
        // okuma kaynağı: en yüksek çözünürlük (PDF yeniden çizim / görüntünün doğal boyutu); balonlar canvas uzayında
        aiDurum('🤖 Çizim hazırlanıyor…');
        const { kaynak, KW, KH, ad } = await aiKaynakHazirla();
        const oran = canvas.width / KW;                       // orijinal piksel → canvas pikseli
        const { olculer, hatalar, kare } = await aiKareleriOku(kaynak, KW, KH, ayar, (i, n, m) => aiDurum('🤖 Gemini okuyor: kare ' + i + '/' + n + ' (' + m + ', ' + ad + ')'));
        let eklenen = 0, hayalet = 0, cakisan = 0;
        // Bir çizimde farklı yazı boyutları olabilir (MAN 6984: 26 ve 42 px) — medyana göre "anormal kutu" kırpma
        //   denendi, büyük fontlu doğru kutuları da kırptı; o yüzden kutu yalnız kendi geometrisiyle belirlenir.
        const R = Math.round(90 / Math.min(1, oran));          // pencere yarıçapı: canvas'ta 90 px'e denk gelen orijinal piksel
        const kutular = olculer.map(o => ({ o, k: aiPencereKutusu(kaynak, KW, KH, o.x, o.y, R, String(o.deger).length) }));
        for (const { o, k: ko } of kutular) {
            if (!ko) { hayalet++; continue; }
            const k = { x: ko.x * oran, y: ko.y * oran, width: ko.width * oran, height: ko.height * oran };   // canvas uzayı
            if (annotations.some(a => Math.abs(a.rect.x - k.x) < 12 && Math.abs(a.rect.y - k.y) < 12)) { cakisan++; continue; }   // aynı kutuda balon var
            const p = parseToleranceFromText(o.deger);
            const ann = {
                id: Date.now() + eklenen, number: balloonCounter + eklenen,
                rect: { x: Math.max(0, k.x - 3), y: Math.max(0, k.y - 3), width: k.width + 6, height: k.height + 6 },
                balloon: { x: k.x + k.width + 50, y: k.y - 20 },
                balloonShape: currentBalloonShape, balloonColor: currentBalloonColor, lineColor: currentLineColor, textColor: currentTextColor,
                fillType: currentFillType, balloonSize: currentBalloonSize, balloonTextSize: currentBalloonTextSize, fontFamily: currentFontFamily,
                dimension: (p && p.dimension) || o.deger, lowerTolerance: (p && p.lowerTolerance) || '', upperTolerance: (p && p.upperTolerance) || '',
                aiOkuma: true
            };
            if (!ann.lowerTolerance && !ann.upperTolerance) applyDefaultTolerances(ann);
            annotations.push(ann); addTableRow(ann); eklenen++;
        }
        balloonCounter += eklenen;
        if (eklenen) autoAlignBalloons();      // kullanıcı isteği: otomatik balonlamadan sonra hizala + yeniden numarala
        redrawCanvas();
        const ozet = '✓ ' + eklenen + ' ölçü balonlandı (' + kare + ' kare)' + (hayalet ? ' · ' + hayalet + ' okuma mürekkep bulunamadığı için atıldı' : '') + (cakisan ? ' · ' + cakisan + ' zaten balonluydu' : '') + (hatalar.length ? ' · HATA: ' + hatalar.join(', ') : '') + ' — Ölçü tablosundan kontrol edin.';
        aiDurum(ozet, hatalar.length ? 'err' : 'ok'); showNotification(ozet, 'success');
        if (!eklenen && !hatalar.length) alert('Gemini bu çizimde ölçü çizgisine bağlı sayı bulamadı. Manuel balonlama ile devam edebilirsiniz.');
        if (hatalar.length) alert('Okuma hataları:\n' + hatalar.join('\n') + '\n\n400/403: API anahtarı ya da model adı hatalı (⚙️ API). 429: kota — biraz sonra tekrar deneyin.');
    } catch (e) {
        console.error(e); aiDurum('Otomatik balonlama hatası: ' + e.message, 'err');
    } finally {
        showLoading(false); if (btn) { btn.disabled = false; btn.textContent = '🤖 Otomatik Balonla'; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('autoBalloonBtn'); if (b) b.addEventListener('click', autoBalloonAI);
});
