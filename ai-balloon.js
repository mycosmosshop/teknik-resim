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
    ISTEM: "Bu bir teknik resmin bir bölümü. Görevin BOYUTSAL ÖLÇÜLERİ okumak.\nSADECE ölçü çizgisine bağlı sayıları listele.\nLİSTELEME: daire içindeki referans/pozisyon numaraları, sayfa çerçevesi pafta numaraları, standart kodları (VW 10500, DIN 1451, TL 1010, ISO 845 gibi), not cümlelerinin içindeki sayılar, tablo hücreleri, antet/başlık bloğu, revizyon tablosu.\nÖLÇÜLER 90 DERECE DÖNDÜRÜLMÜŞ (DİKEY) DE YAZILIR: yandan görünüşlerde ve dar alanlarda sayı yan yatar. Bunları da oku, atlama.\nYARIÇAP VE ÇAP ÖLÇÜLERİNİ DE LİSTELE: R15, R50, ø8 gibi. Öneki (R ya da ø) mutlaka koru — \"R15\" yaz, \"15\" değil. Yarıçaplar genelde küçük ve EĞİK yazılır, kavis okuyla gösterilir; kösede ya da çizimin kenarinda kalanları da atlama.\nGENEL TOLERANS TABLOSUNU LİSTELEME: \">400 \" ile başlayan aralık-tolerans satırları ve açı toleransı ölçü DEĞİLDİR; o tablodaki 400, 120, 30, 6, 2.0, 1.6, 0.6, 0.3 gibi sayıları yazma.\nÖLÇEK NOTUNU ASLA LİSTELEME: \"1:5\", \"1:1\", \"2:1\" gibi oranlar ve bunların yanındaki görünüş/detay adları ölçü DEĞİLDİR; oranın tek bir rakamını da (1 ya da 5) ölçü diye yazma. Aynı şekilde kağıt formatı (A1, A3), tarih (31.07.2025), sayfa no ve ağırlık (63g) ölçü değildir.\nGEOMETRİK TOLERANS ÇERÇEVELERİNİ DE LİSTELE (konum ⌖ 0.1, profil ⌓ 0.5, düzlemsellik gibi): değer olarak çerçevedeki sayıyı yaz (\"0.1\"), datum harfini yazma. Ölçü çizgisine bağlı bir sayının yanındaki ± tolerans ise ayrı bir ölçü değildir.\nOndalık ayracı NOKTA yaz. Çap işaretini ø, yarıçapı R olarak koru.\nHer ölçü için: {\"deger\": \"48\", \"x\": 123, \"y\": 456}\nx,y = ölçü YAZISININ bu görüntüdeki piksel merkezi (sol üst köşe 0,0).\nYalnız JSON dizisi döndür, başka hiçbir şey yazma.",
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

async function aiGemini(b64, model, key, istem = AI_BALON.ISTEM) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
    const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: istem }, { inline_data: { mime_type: 'image/png', data: b64 } }] }],
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

// Modele sor — TÜM okumalar (kareler, kutu doğrulama, güvenlik ağı) buradan: 429'da sıradaki yedek modele geçilir (günlük kota
//   MODEL başına), 429/5xx'te sunucunun dediği kadar beklenir. Ölçüldü: kolaj okuması tek modelde iki denemede vazgeçiyordu;
//   kota dolunca güvenlik ağı sessizce devre dışı kaldı ("40 ±0.1" tamamlanmadı). 400/403 fırlatılır; yanıt yoksa null.
async function aiSor(b64, ayar, istem) {
    const modeller = [ayar.model, ...AI_BALON.MODELLER.filter(m => m !== ayar.model)];
    for (let deneme = 0; deneme < AI_BALON.DENEME + modeller.length; deneme++) {
        const mi = Math.min(AI_BALON.mi || 0, modeller.length - 1);
        try { return await aiGemini(b64, modeller[mi], ayar.key, istem); }
        catch (e) {
            if (e.status === 429 && mi < modeller.length - 1) { AI_BALON.mi = mi + 1; continue; }
            // son modelde de GÜNLÜK kota → beklemek saatler sürer (ücretsiz katmanda model başına 500/gün); takılmış görünmesin
            if (e.status === 429 && /PerDay/i.test(e.body || '')) { const k = new Error('Günlük okuma kotası doldu'); k.status = 429; k.kota = true; throw k; }
            if (e.status === 429 || e.status >= 500) { await aiUyu(aiBeklemeSn(e.body, 5 * (deneme + 1)) * 1000); continue; }
            throw e;
        }
    }
    return null;
}

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
    // TEKRAR GEÇİŞİ: aynı kareler ikinci kez okunur, sonuçlar BİRLEŞTİRİLİR. Ölçüldü (Python'da da, burada da): model aynı
    //   kareyi iki okumada farklı kapsıyor — ikinci çalıştırmada 21 / R5 / 0.1 düşmüştü. Kapsam şansa bırakılmaz; maliyet 2×.
    return out.concat(out.map(k => ({ ...k, tekrar: true })));
}

// Sayfa ÇERÇEVESİ şeridindeki tek karakterli okumalar (pafta bölge numaraları 1–8, harfleri A–F) ölçü değildir — istem
//   uyarısına rağmen "4" ve "6" balonlandı (ölçüldü). Kenar %4,5 şeridi + tek karakter → atılır; "300" gibi çok haneli kalır.
function aiCerceveDisi(o, W, H) {
    const tek = String(o.deger).trim().length <= 1;
    const kenar = o.y < H * 0.045 || o.y > H * 0.955 || o.x < W * 0.03 || o.x > W * 0.97;
    return !(tek && kenar);
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

// Bir 1400 px karenin 700 px / 2× alt kareleri (örtüşmeli): büyük görüntüde ölçü YOĞUN karelerde ikinci bakış.
//   Ölçüldü (kullanıcı çizimi): delik grubu çevresindeki dikey "15" ve küçük tolerans değerleri tek bakışta atlanıyordu;
//   tüm görüntüyü 2× okumak 100 istek ederdi, yoğun karelerde 4'er alt kare ~30 istek.
function aiAltKareler(k, kare = 700, ortusme = 0) {   // örtüşmesiz: 4 alt kare (120 px örtüşme 9 kare ediyordu, kota)
    const out = [];
    for (let y0 = k.y0; y0 < k.y1; y0 += kare - ortusme) for (let x0 = k.x0; x0 < k.x1; x0 += kare - ortusme) {
        const x1 = Math.min(x0 + kare, k.x1), y1 = Math.min(y0 + kare, k.y1);
        if (x1 - x0 < 200 || y1 - y0 < 200) continue;
        out.push({ x0, y0, x1, y1, olcek: 2 });
    }
    return out;
}

async function aiKareleriOku(kaynak, W, H, ayar, ilerleme) {
    const kareler = aiTumKareler(W, H);
    const modeller = [ayar.model, ...AI_BALON.MODELLER.filter(m => m !== ayar.model)];
    let son = 0; const ham = []; const hatalar = [];
    const buyuk = W * H >= 14e6; const kareOlcu = new Map();    // 1. geçiş kare başına bulunan ölçü sayısı
    for (let i = 0; i < kareler.length; i++) {
        if (AI_BALON.iptal) break;
        const k = kareler[i], w = k.x1 - k.x0, h = k.y1 - k.y0, s = k.olcek || 1;
        ilerleme(i + 1, kareler.length, modeller[Math.min(AI_BALON.mi || 0, modeller.length - 1)]);
        const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(kaynak, k.x0, k.y0, w, h, 0, 0, c.width, c.height);   // 2. geçiş: 2× büyütme
        const b64 = c.toDataURL('image/png').split(',')[1];
        const bekle = AI_BALON.KADANS_MS - (Date.now() - son); if (son && bekle > 0) await aiUyu(bekle); son = Date.now();
        let metin = null;
        try { metin = await aiSor(b64, ayar, AI_BALON.ISTEM); son = Date.now(); }
        catch (e) {
            if (e.kota) { hatalar.push('günlük okuma kotası doldu — birkaç saat sonra tekrar deneyin'); break; }
            hatalar.push('kare ' + (i + 1) + ': ' + (e.status || e.message));      // 400/403: anahtar/model sorunu
        }
        if (metin === null) { if (!hatalar.length || hatalar[hatalar.length - 1].indexOf('kare ' + (i + 1)) < 0) hatalar.push('kare ' + (i + 1) + ': yanıt yok'); continue; }
        const bulunan = aiKareCoz(aiCozumle(metin), k, W, H); ham.push(...bulunan);
        if (buyuk && k.olcek === 1) { kareOlcu.set(k, bulunan.length); if (bulunan.length >= 3) { const alt = aiAltKareler(k).map(a => ({ ...a, olcek2: true })); if (!kareler.some(q => q.olcek2 && q.x0 === alt[0].x0 && q.y0 === alt[0].y0)) kareler.push(...alt); } }
    }
    return { olculer: aiTekille(ham.filter(o => aiCerceveDisi(o, W, H)), Math.max(90, Math.round(W / 35))), hatalar, kare: kareler.length };   // tekil eşiği çözünürlükle: 2× alt geçişte aynı ölçü ~100 px sapabiliyor (6FA)
}

// Model konumunun (mx,my) yakınındaki YAZI kutusu — bağlı bileşen (connected component) yöntemi.
//   Projeksiyon yöntemi (v1) yüksek çözünürlükte kırılıyordu (6FA.881.989, 6000 px: pencereye giren çizgi/yay/komşu yazı
//   satır bloklarını birleştiriyor, "21" 128×170, "35" yarım kutu). v2: (0) uzun ince çizgiler maskelenir, yüksek
//   çözünürlükte 1 px açma ile kısa ince çizgi parçaları da silinir; (1) mürekkep bileşenleri bulunur; (2) ince çizgi /
//   büyük yay / içi boş şekil elenir; (3) model konumuna en yakın rakam bileşeninden başlayıp yakın ve benzer boyutlu
//   komşular (yatay ya da dikey) kümelenir; kutu = kümenin sınır kutusu; (4) beklenenden çok geniş kutu kırpılır.
//   gri: Uint8Array (W*H) parlaklık. Dönüş {x,y,width,height} ya da null (konumda yazı yok → hayalet okuma).
function aiYaziKutusu(gri, W, H, mx, my, R = 90, karakter = 0) {
    mx = Math.round(mx); my = Math.round(my);
    const px0 = Math.max(0, mx - R), px1 = Math.min(W, mx + R), py0 = Math.max(0, my - R), py1 = Math.min(H, my + R);
    const pw = px1 - px0, ph = py1 - py0;
    if (pw < 4 || ph < 4) return null;
    // ikili pencere — mürekkep eşiği pencereye uyarlı (soluk tarama / büyütülmüş ince yazı gri kalır)
    let mn = 255; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const v = gri[(py0 + y) * W + px0 + x]; if (v < mn) mn = v; }
    const esik = Math.max(128, Math.min(160, Math.round((mn + 255) / 2)));
    let p = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) p[y * pw + x] = gri[(py0 + y) * W + px0 + x] < esik ? 1 : 0;
    // 0a) pencerenin ≥%20'sini geçen ≤5 px ince yatay/dikey çizgiler maskelenir (ölçü/uzatma çizgileri). Ölçüldü (6FA):
    //   %35'te "21"in altındaki ~%25'lik ölçü çizgisi maskelenmeyip "2"ye yapışıyor, bileşen çizgiyle uzayıp eleniyordu
    //   (kutu tek "1" kaldı). Rakam satırı %20'yi (3 rakam ≈ %14) geçmez; dikey yazı sütunu ince (≤5 px) değildir.
    //   Ölçüt: satırdaki/sütundaki EN UZUN KESİNTİSİZ koyu koşu (rakam satırında koşu bir rakam genişliğini geçmez;
    //   koyu piksel SAYISI ile ölçmek rakam satırlarını da çizgi sanıyordu: 2 rakam × 18 px = tam %20)
    const satK = new Int32Array(ph), sutK = new Int32Array(pw);
    for (let y = 0; y < ph; y++) { let n = 0, en = 0; for (let x = 0; x < pw; x++) { n = p[y * pw + x] ? n + 1 : 0; if (n > en) en = n; } satK[y] = en; }
    for (let x = 0; x < pw; x++) { let n = 0, en = 0; for (let y = 0; y < ph; y++) { n = p[y * pw + x] ? n + 1 : 0; if (n > en) en = n; } sutK[x] = en; }
    const inceMi = (m, n) => { const out = new Uint8Array(n); let a = -1; for (let i = 0; i <= n; i++) { const k = i < n && m[i]; if (k && a < 0) a = i; else if (!k && a >= 0) { if (i - a <= 5) for (let j = a; j < i; j++) out[j] = 1; a = -1; } } return out; };
    const mS = inceMi(satK.map(v => v >= pw * 0.2 ? 1 : 0), ph), mX = inceMi(sutK.map(v => v >= ph * 0.2 ? 1 : 0), pw);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (mS[y] || mX[x]) p[y * pw + x] = 0;
    // (1 px morfolojik açma DENENDİ: 6000 px PDF render'da rakam kalınlığı da 2 px → rakamlar parçalandı; kaldırıldı)
    // 1) bağlı bileşenler (8-komşuluk, yığınla)
    const etiket = new Int32Array(pw * ph); const bil = []; const yigin = new Int32Array(pw * ph);
    for (let s = 0; s < pw * ph; s++) {
        if (!p[s] || etiket[s]) continue;
        const id = bil.length + 1; let top = 0; yigin[top++] = s; etiket[s] = id;
        let x0 = pw, y0 = ph, x1 = -1, y1 = -1, n = 0;
        while (top) {
            const i = yigin[--top]; const x = i % pw, y = (i - x) / pw; n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= pw || yy >= ph) continue;
                const j = yy * pw + xx; if (p[j] && !etiket[j]) { etiket[j] = id; yigin[top++] = j; }
            }
        }
        bil.push({ x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
    }
    if (!bil.length) return null;
    // 2) yazı adayı: ince uzun çizgi değil, pencereyi kaplayan şekil değil, içi boş büyük yay/daire değil
    const aday = bil.filter(b => {
        if (b.w >= R * 1.5 || b.h >= R * 1.5) return false;
        // ince-uzun parçalar (3 px "1" rakamı ile 3 px çizgi kalıntısı) BURADA elenmez: MAN 6984'te "110"/"180"in
        //   "1"i 3 px kalın olduğundan çizgi sanılıp düşüyordu; ayrım kümelemede (yalnız hizalıysa alınır, tohum olamaz)
        const doluluk = b.n / (b.w * b.h);
        if (Math.max(b.w, b.h) > 40 && doluluk < 0.10) return false;
        // rakam boyutunda ama içi boş ince çember = DELİK (6FA'da 38 px delik dairesi "17"nin tohumu oldu); "0" rakamı
        //   kalın yazıldığından doluluğu ≥ 0,35, ince çemberinki ≈ 0,17
        //   (delik dairesi merkez artısıyla bitişik olabilir → 45×53, doluluk ≈ 0,24; "0" rakamı kare değil, 18×26)
        //   Eğik yazılmış "R" harfi de kareye yakın ve seyrek (22×24, ≈0,25) — ayrım BOYUT: tek karakter pencereye göre
        //   küçüktür (R*0.22 = 6000 px'te 31 px; delik 38 px), 20 px sabiti R50/R60/R5'i siliyordu (ölçüldü).
        if (Math.min(b.w, b.h) >= R * 0.22 && Math.abs(b.w - b.h) <= 10 && doluluk < 0.36) return false;   // 4 px kalın çember ≈ 0,33
        return b.w >= 2 && b.h >= 2;
    });
    if (!aday.length) return null;
    const mx0 = mx - px0, my0 = my - py0;
    const uzak = b => Math.hypot((b.x0 + b.x1) / 2 - mx0, (b.y0 + b.y1) / 2 - my0);
    // 3) tohum: model konumuna en yakın, iki yönde de ≥5 px bileşen ("1" rakamı ile 4 px'lik çizgi parçası ayırt
    //   edilemez → ikisi de tohum olamaz; "1" komşu olarak kümeye girer); kümeleme: yakın + benzer boyut
    //   Tohum tercihi RAKAM BENZERİ bileşen (doluluk ≥ 0,28): delik dairesi maskeyle çeyrek yaylara bölünüyor (18×18,
    //   doluluk 0,2) ve model konumuna daha yakın olduğundan tohum oluyordu ("17" kutusu delik oldu — ölçüldü).
    const dol = b => b.n / (b.w * b.h);
    const boyutlu = aday.filter(b => b.h >= 5 && b.w >= 5).sort((a, b) => uzak(a) - uzak(b));
    // tohum: yakındaki (≤ R*0,5) rakamsı adaylardan EN BÜYÜĞÜ — en yakını almak eğik "0.1"de NOKTAYI (6×5) tohum yapıp
    //   6×5'lik kutu üretiyordu (ölçüldü); nokta/virgül (max kenar < R*0,08) tohum olamaz
    const rakamsi = boyutlu.filter(b => dol(b) >= 0.28 && Math.max(b.w, b.h) >= R * 0.08);
    const yakinR = rakamsi.filter(b => uzak(b) <= R * 0.5).sort((a, b) => b.w * b.h - a.w * a.h);
    const tohum = yakinR[0] || ((rakamsi.length && uzak(rakamsi[0]) <= R * 0.8) ? rakamsi[0] : boyutlu[0]);
    if (!tohum || uzak(tohum) > R * 0.8) return null;
    const kume = [tohum]; const alindi = new Set(kume); let degisti = true;
    while (degisti) {
        degisti = false;
        for (const b of aday) {
            if (alindi.has(b)) continue;
            for (const k of kume) {
                // iki boyutlu yakınlık: bbox'lar arası boşluk (x ve y) — eğik yazılmış yarıçaplarda (R50, R60 ~45°)
                //   ardışık karakterler dikey örtüşmez, satır kuralı yalnız "R"yi alıyordu (6FA'da ölçüldü)
                const bX = Math.max(0, b.x0 - k.x1, k.x0 - b.x1), bY = Math.max(0, b.y0 - k.y1, k.y0 - b.y1);
                // boyut kıyası ve mesafe TOHUMA göre (kümedeki son üyeye değil): MAN 6984'te yazının üstündeki referans
                //   balonu dairesi (47×33) "benzer" sayılıp köprü oldu, komşu yazılar zincirleme birleşti (113×180)
                const kb = Math.max(tohum.h, tohum.w), bb = Math.max(b.h, b.w);
                const benzer = bb >= kb * 0.5 && bb <= kb * 1.5;                                     // karakter boyutları yakın
                const kucuk = bb <= kb * 0.45;                                                       // nokta / virgül
                const yakin = Math.hypot(bX, bY) <= kb * 0.6;                                        // rakam arası boşluk ≤ 0,6 h
                // ince parça ("1" rakamı ya da 4–5 px'lik çizgi kalıntısı) yalnız kümeyle HİZALIYSA alınır: "1" yazıyla
                //   aynı satırda/sütunda tam örtüşür, yazının altındaki çizgi parçası örtüşmez ("21" 43×63 olmuştu)
                const oY = Math.min(k.y1, b.y1) - Math.max(k.y0, b.y0), oX = Math.min(k.x1, b.x1) - Math.max(k.x0, b.x0);
                const ince = Math.min(b.w, b.h) <= 5 && Math.max(b.w, b.h) >= Math.min(b.w, b.h) * 3;
                const hizali = oY >= 0.7 * Math.min(k.h, b.h) || oX >= 0.7 * Math.min(k.w, b.w);
                if (ince && !hizali) continue;
                // (delik çeyreği elemesi KALDIRILDI: eğik ince "1" de kareye yakın ve seyrek (20×17, 0,20) — "0.1"in 1'i
                //   düşüyordu; delik parçaları zaten tohum olamıyor ve 0,6h mesafe kısıtıyla kümeye girmiyor)
                if ((benzer && yakin) || (kucuk && Math.hypot(bX, bY) <= kb * 0.5)) { kume.push(b); alindi.add(b); degisti = true; break; }
            }
        }
    }
    let x0 = Math.min(...kume.map(b => b.x0)), y0 = Math.min(...kume.map(b => b.y0));
    let x1 = Math.max(...kume.map(b => b.x1)) + 1, y1 = Math.max(...kume.map(b => b.y1)) + 1;
    const h = y1 - y0;
    // 4) kalın çizgi rakama bitişikse bileşen uzar: beklenen genişliğin 1,6 katını aşan yatay kutu model konumu etrafında kırpılır
    if (karakter > 0 && h < (x1 - x0) * 1.2) {
        const beklenen = Math.round(h * 0.75 * karakter + h * 0.6);
        if (x1 - x0 > beklenen * 1.6) { const c = Math.min(Math.max(mx0, x0 + beklenen / 2), x1 - beklenen / 2); x0 = Math.round(c - beklenen / 2); x1 = Math.round(c + beklenen / 2); }
    }
    const w = x1 - x0;
    if (w < 4 || h < 4) return null;
    return { x: px0 + x0, y: py0 + y0, width: w, height: h };
}

function aiGriVeri(kaynak) {
    const W = kaynak.width, H = kaynak.height, d = kaynak.getContext('2d').getImageData(0, 0, W, H).data, g = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    return g;
}

// ── KUTU DOĞRULAMA (kolaj): bulunan kutu kırpıntıları tek görüntüde (5 sütun × N satır, hücre numaralı) modele geri
//    okutulur. Ölçüldü (6FA): model 1. geçişte "15"in konumunu ~300 px yanlış verdi, kutu ok ucuna oturdu ("R10" okundu);
//    "21" kutusu "15.1"i sarmıştı. Okunan değer beklenenle uyuşmayan ya da boş dönen kutu ELENİR (yanlış balon, eksik
//    balondan kötüdür); elenenler bildirimde listelenir. Maliyet: 15 kutuda 1 istek.
const aiAdetsiz = s => String(s || '').replace(/^\s*\d+\s*[x×X]\s*/, '');   // adet öneki: "3x ø6" → "ø6"
function aiDogrulaEslesir(beklenen, okunan) {
    const n = s => { const m = /[0-9]+(?:[.,][0-9]+)?/.exec(String(s || '')); return m ? m[0].replace(',', '.') : ''; };   // ilk sayı grubu ("80 ±20" → 80)
    const sik = s => String(s || '').replace(/\s+/g, '').replace(/,/g, '.');
    // kutu yalnız TOLERANSI ya da adet önekinden sonrasını sardı: okuma doğru, kutu eksik ("50 ±0.5"→"±0.5", "3x ø6"→"ø6";
    //   sentetik sınavda 6 çizimde 5 doğru okuma bu yüzden elendi). Kutu güvenlik ağında yazının tamamına genişler.
    if (/^\s*[±+]/.test(okunan)) return sik(beklenen).includes(sik(okunan)) || n(beklenen) === n(okunan);   // "40" ↔ "±40" (6FA "190 ±40")
    const a = n(aiAdetsiz(beklenen)), b = n(aiAdetsiz(okunan));
    if (!a || !b) return false;
    // önek kabul: eğik/küçük yazıda model bazen "0.1"i "0." diye kesik okuyor (ölçüldü) — yanlış kutuda bambaşka sayı çıkar
    return a === b || a.startsWith(b) || a.endsWith(b);   // kısmi kutu (dikey "417"de "17") sonek olarak da kabul
}
function aiKolajYerlesim(n, HW = 300, HH = 180, COLS = 4) {   // hücre büyütüldü: eğik küçük "0.1" 240×140'ta kesik okunuyordu
    const rows = Math.ceil(n / COLS);
    return { W: COLS * HW, H: rows * HH, hucre: Array.from({ length: n }, (_, i) => ({ x: (i % COLS) * HW, y: Math.floor(i / COLS) * HH, w: HW, h: HH })) };
}
async function aiKolajDogrula(kaynak, adaylar, ayar, ilerleme, secenek = {}) {   // secenek: {pay, cerceve, istem} (güvenlik ağı)
    const okunan = new Map(); const PARTI = 15; let son = 0;
    for (let p = 0; p < adaylar.length; p += PARTI) {
        if (AI_BALON.iptal) break;
        const grup = adaylar.slice(p, p + PARTI); const L = aiKolajYerlesim(grup.length);
        const c = document.createElement('canvas'); c.width = L.W; c.height = L.H; const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, L.W, L.H); g.strokeStyle = '#888'; g.fillStyle = '#000'; g.font = 'bold 14px Arial';
        grup.forEach(({ k }, i) => {
            const h = L.hucre[i], pad = secenek.pay || 6, sx = Math.max(0, k.x - pad), sy = Math.max(0, k.y - pad), sw = k.width + 2 * pad, sh = k.height + 2 * pad;
            const s = Math.min(4, (h.w - 30) / sw, (h.h - 30) / sh), dw = Math.max(1, sw * s), dh = Math.max(1, sh * s);
            g.drawImage(kaynak, sx, sy, sw, sh, h.x + (h.w - dw) / 2, h.y + (h.h - dh) / 2, dw, dh);
            if (secenek.cerceve) { const c = secenek.cerceve; g.strokeStyle = '#e00'; g.lineWidth = 2; g.strokeRect(h.x + (h.w - dw) / 2 + (k.x - c - sx) * s, h.y + (h.h - dh) / 2 + (k.y - c - sy) * s, (k.width + 2 * c) * s, (k.height + 2 * c) * s); g.strokeStyle = '#888'; g.lineWidth = 1; }
            g.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1); g.fillText(String(i), h.x + 4, h.y + 16);
        });
        ilerleme(Math.min(p + PARTI, adaylar.length), adaylar.length);
        const istem = secenek.istem || 'Bu görüntü bir kolaj: ' + grup.length + ' hücre var, her hücrenin sol üst köşesinde hücre numarası (0\'dan başlar) yazar. Her hücrede bir teknik resimden kırpılmış ÖLÇÜ YAZISI olması beklenir (48, R5, 12.5, ø8, 0.1 gibi; yazı yan yatmış ya da eğik olabilir). Her hücre için hücrede okunan ölçü metnini döndür. Hücrede okunabilir bir sayı YOKSA (yalnız çizgi, ok ucu, daire, boşluk) değer olarak "" yaz. Yalnız JSON dizisi: [{"i":0,"deger":"48"}, ...]';
        const bekle = AI_BALON.KADANS_MS - (Date.now() - son); if (son && bekle > 0) await aiUyu(bekle); son = Date.now();
        let metin = null;
        try { metin = await aiSor(c.toDataURL('image/png').split(',')[1], ayar, istem); son = Date.now(); } catch (e) { metin = null; }
        if (metin === null) continue;                         // doğrulanamadı → bu parti olduğu gibi kabul
        for (const x of aiCozumle(metin)) { const i = +x.i; if (i >= 0 && i < grup.length) okunan.set(grup[i], String(x.deger == null ? '' : x.deger).trim()); }
    }
    return okunan;   // aday → okunan metin (doğrulanamayan adaylar Map'te yok)
}

// ── YAZI GRUPLARI (yapay zekâdan bağımsız) ──────────────────────────────────────────────────────────────────────
//   Çizimdeki her "yazı benzeri" karakter grubunu piksel düzeyinde bulur (güvenlik ağının temeli).
//   gri: Uint8Array (W*H) parlaklık; b: {x0,y0,x1,y1} tarama bölgesi; h: karakter yüksekliği (piksel).
//   Dönüş: [{x,y,width,height,n,cx,cy,kh,cz}] — n: karakter bileşeni sayısı, kh: karakter yüksekliği, cz: çizgi yakınlığı.
function aiMetinGruplari(gri, W, H, b, h) {
    const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0)), x1 = Math.min(W, Math.ceil(b.x1)), y1 = Math.min(H, Math.ceil(b.y1));
    const pw = x1 - x0, ph = y1 - y0; if (pw < 8 || ph < 8) return [];
    const p = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++) { const o = (y0 + y) * W + x0; for (let x = 0; x < pw; x++) p[y * pw + x] = gri[o + x] < 150 ? 1 : 0; }
    // 1) uzun yatay/dikey koşular çizgidir (ölçü, uzatma, kenar çizgileri): ~2,2 karakterden uzun koşu silinir
    const L = Math.max(12, Math.round(2.2 * h)), sil = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++) { let a = -1; for (let x = 0; x <= pw; x++) { const k = x < pw && p[y * pw + x]; if (k && a < 0) a = x; else if (!k && a >= 0) { if (x - a > L) for (let j = a; j < x; j++) sil[y * pw + j] = 1; a = -1; } } }
    for (let x = 0; x < pw; x++) { let a = -1; for (let y = 0; y <= ph; y++) { const k = y < ph && p[y * pw + x]; if (k && a < 0) a = y; else if (!k && a >= 0) { if (y - a > L) for (let j = a; j < y; j++) sil[j * pw + x] = 1; a = -1; } } }
    for (let i = 0; i < p.length; i++) if (sil[i]) p[i] = 0;
    // 2) bağlı bileşenler (8-komşuluk)
    const et = new Int32Array(pw * ph), yig = new Int32Array(pw * ph), bil = [];
    for (let s = 0; s < p.length; s++) {
        if (!p[s] || et[s]) continue;
        const id = bil.length + 1; let top = 0; yig[top++] = s; et[s] = id;
        let bx0 = pw, by0 = ph, bx1 = -1, by1 = -1, n = 0;
        while (top) {
            const i = yig[--top], x = i % pw, y = (i - x) / pw; n++;
            if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
            for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= ph) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= pw) continue; const j = yy * pw + xx; if (p[j] && !et[j]) { et[j] = id; yig[top++] = j; } } }
        }
        bil.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, n });
    }
    // 3) karakter benzeri bileşen: uzun kenar 0,45h–1,5h; içi boş yuvarlak (delik çemberi) ve kalın blok değil
    //   ÇİZGİ maskesi = silinen uzun koşular + karakterden büyük bileşenler (eğik ölçü/kılavuz çizgisi, yay): ölçü yazısının
    //   yanında hep çizgi vardır, not cümlesinde/işaret tablosunda yoktur (grup.cz)
    const kar = [], nokta = [], buyuk = new Uint8Array(bil.length + 1);
    for (let i = 0; i < bil.length; i++) { const c = bil[i]; if (Math.max(c.x1 - c.x0, c.y1 - c.y0) + 1 > 1.5 * h) buyuk[i + 1] = 1; }
    for (let i = 0; i < sil.length; i++) if (et[i] && buyuk[et[i]]) sil[i] = 1;
    // İÇ BOŞLUKLAR (kenara değmeyen arka plan adacıkları, piksel sayılarıyla): delik ile yazıyı ayırır. Eksen artılı delik
    //   çemberinde 4 boşluk; düz çemberde tek ve kutunun büyük kısmı kadar boşluk. Rakam/harfte 0–2 küçük boşluk. Kare + seyrek
    //   ölçütü tek başına yetmiyordu: birbirine değen "34" (18×20) delik+artı, 45° eğik "R" çember sanılıp atılıyordu.
    const bosluklar = c => {
        const w = c.x1 - c.x0 + 1, hh = c.y1 - c.y0 + 1, z = new Uint8Array(w * hh), yig = [], out = [];
        const dolu = (x, y) => p[(c.y0 + y) * pw + c.x0 + x];
        const doldur = (sx, sy) => { let n = 0; yig.push(sy * w + sx); z[sy * w + sx] = 1; let kenar = false;
            while (yig.length) { const i = yig.pop(), x = i % w, y = (i - x) / w; n++; if (!x || !y || x === w - 1 || y === hh - 1) kenar = true;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= hh) continue; const j = yy * w + xx; if (!z[j] && !dolu(xx, yy)) { z[j] = 1; yig.push(j); } } }
            return kenar ? -1 : n; };
        for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (!z[y * w + x] && !dolu(x, y)) { const n = doldur(x, y); if (n > 0) out.push(n); }
        return out;
    };
    for (const c of bil) {
        const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, mx = Math.max(bw, bh), mn = Math.min(bw, bh), dol = c.n / (bw * bh);
        // ondalık nokta / virgül: karakter değil ama iki yanındaki rakamları bağlar (eksen çizgisinin noktaları daha küçük)
        if (mx >= 0.12 * h && mx < 0.45 * h && mn / mx > 0.3 && dol > 0.45) { nokta.push({ x: c.x0 + x0, y: c.y0 + y0, w: bw, h: bh }); continue; }
        if (mx < 0.45 * h || mx > 1.5 * h) continue;
        let bos = null;                                                     // iç boşluklar yalnız kareye yakın iri bileşende hesaplanır
        if (mn / mx > 0.8 && mx > 0.75 * h) bos = bosluklar(c);
        if (mn / mx > 0.85 && dol < 0.3 && mx > 0.8 * h && Math.max(0, ...bos) >= 0.35 * bw * bh) continue;   // düz çember (delik) — "0" oval, "R" boşluğu küçük
        if (bos && bos.length >= 3) continue;                               // eksen artılı delik çemberi (artı 4 boşluk açar)
        if (dol > 0.75 && mn > 0.4 * h) continue;                           // dolu blok (ok ucu grubu, işaret)
        kar.push({ x: c.x0 + x0, y: c.y0 + y0, w: bw, h: bh, cx: (c.x0 + c.x1) / 2 + x0, cy: (c.y0 + c.y1) / 2 + y0, m: mx });
    }
    // 4) gruplama: merkezler arası ≤ 1,25 × karakter boyu ve boyları benzer → aynı kelime (yatay/dikey/çapraz yöne bakmaz)
    const ata = kar.map((_, i) => i), bul = i => { while (ata[i] !== i) i = ata[i] = ata[ata[i]]; return i; };
    const sira = kar.map((_, i) => i).sort((a, c) => kar[a].cx - kar[c].cx);
    for (let ii = 0; ii < sira.length; ii++) {
        const a = kar[sira[ii]];
        for (let jj = ii + 1; jj < sira.length; jj++) {
            const c = kar[sira[jj]]; if (c.cx - a.cx > 1.6 * h) break;
            const m = Math.max(a.m, c.m); if (Math.min(a.m, c.m) / m <= 0.45) continue;
            // kutu boşlukları: ondalık nokta silinince "12" ile "5" arası ~0,45h açılıyor (merkez ölçütü ikiye bölüyordu)
            const gx = Math.max(0, c.x - (a.x + a.w), a.x - (c.x + c.w)), gy = Math.max(0, c.y - (a.y + a.h), a.y - (c.y + c.h));
            const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y), ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
            const genis = k => k.w > k.h * 1.1, uzun = k => k.h > k.w * 1.1;      // yan yatmış karakter geniş, düz karakter uzun
            const yatay = oy >= 0.5 * Math.min(a.h, c.h) && gx <= 0.7 * m && !(genis(a) && genis(c));   // yan yana dikey yazı sütunları birleşmez
            const dikey = ox >= 0.5 * Math.min(a.w, c.w) && gy <= 0.7 * m && !(uzun(a) && uzun(c));   // alt alta yatay satırlar birleşmez
            const egik = Math.max(gx, gy) <= 0.35 * m;
            if (yatay || dikey || egik) ata[bul(sira[ii])] = bul(sira[jj]);
        }
    }
    // NOKTA KÖPRÜSÜ: aynı noktaya ≤ 0,35h yakın iki karakter aynı sayıdır ("12.5", eğik "0.1", dikey "15.05", "0,05") — yöne
    //   bakmaz. Ölçüldü: 5NA'daki iki eğik "0.1" nokta silinince "0" | "1" diye bölünüyordu.
    for (const d of nokta) {
        const yak = []; for (let i = 0; i < kar.length; i++) { const k = kar[i];
            if (Math.max(0, k.x - (d.x + d.w), d.x - (k.x + k.w)) <= 0.35 * h && Math.max(0, k.y - (d.y + d.h), d.y - (k.y + k.h)) <= 0.35 * h) yak.push(i); }
        for (let i = 1; i < yak.length; i++) ata[bul(yak[i])] = bul(yak[0]);
    }
    const gr = new Map();
    kar.forEach((k, i) => { const r = bul(i); if (!gr.has(r)) gr.set(r, []); gr.get(r).push(k); });
    // tek bileşenli grup: ince (ok ucu, çizgi kalıntısı, tek "1") ya da kareye yakın iri (delik + eksen artısı) → yazı değil
    const tekYazi = k => Math.min(k.w, k.h) > 0.4 * k.m;          // (delik + artı artık boşluk sayısıyla yukarıda ayıklanıyor)
    const kutu = ks => { const x = Math.min(...ks.map(k => k.x)), y = Math.min(...ks.map(k => k.y)); return { x, y, x1: Math.max(...ks.map(k => k.x + k.w)), y1: Math.max(...ks.map(k => k.y + k.h)), kh: Math.max(...ks.map(k => k.m)) };   // en büyük karakter: "±" parçaları ortancayı düşürüp "±0"ı "120"den koparıyordu
    };
    // 5) kelimeler SATIRA birleşir (okuma yönünde ≤ 1 karakter boşluk): "Pos" + "2" → "Pos 2" (tek başına "2" ölçü sanılıyordu),
    //   "80" + "±20" → "80 ±20". Yön karakter biçiminden: düz yazıda karakter uzun, yan yatmışta geniş — yan yana dikey yazı
    //   sütunları ("35" | "60", MAN 6984) ve alt alta satırlar ("355" / "365") birleşmez
    // yön: uzun karakter çoğunluktaysa yatay yazı, geniş çoğunluktaysa dikey; EŞİTLİKTE grubun şekli. ">=" eşitliği yataya
    //   veriyordu: dikey "±0" ("±" uzun, "0" geniş) yatay sayılıp "120" ile birleşmedi, ağ "2"yi okuyup "0.2" balonladı (sınav 4)
    //   Oyu yalnız ASIL karakterler (en büyüğün %75'i) verir: döndürülmüş "+" / "±" çizgisi küçük ve yönü yanıltıyordu
    const aiYazYonu = ks => { const m = Math.max(...ks.map(k => k.m)), b0 = ks.filter(k => k.m >= 0.75 * m), u = b0.filter(k => k.h > k.w).length, g = b0.filter(k => k.w > k.h).length;
        if (u !== g) return u > g ? 'y' : 'd'; const b = kutu(ks); return b.y1 - b.y > b.x1 - b.x ? 'd' : 'y'; };
    const kel = [...gr.values()].filter(ks => ks.length > 1 || tekYazi(ks[0])).map(ks => ({ ks, ...kutu(ks), yon: aiYazYonu(ks) }));
    const ata2 = kel.map((_, i) => i), bul2 = i => { while (ata2[i] !== i) i = ata2[i] = ata2[ata2[i]]; return i; };
    for (let i = 0; i < kel.length; i++) for (let j = i + 1; j < kel.length; j++) {
        const a = kel[i], c = kel[j]; if (a.yon !== c.yon || Math.min(a.kh, c.kh) / Math.max(a.kh, c.kh) < 0.7) continue;
        const bos = a.yon === 'y' ? Math.max(c.x - a.x1, a.x - c.x1) : Math.max(c.y - a.y1, a.y - c.y1);
        const ort = a.yon === 'y' ? Math.min(a.y1, c.y1) - Math.max(a.y, c.y) : Math.min(a.x1, c.x1) - Math.max(a.x, c.x);
        const dar = a.yon === 'y' ? Math.min(a.y1 - a.y, c.y1 - c.y) : Math.min(a.x1 - a.x, c.x1 - c.x);
        if (ort >= 0.5 * dar && bos <= 1.6 * Math.max(a.kh, c.kh)) ata2[bul2(i)] = bul2(j);   // sabit aralıklı yazıda boşluk ~1,3h ("4x Ø6" ikiye bölünüyordu)
    }
    const sat = new Map(); kel.forEach((k, i) => { const r = bul2(i); if (!sat.has(r)) sat.set(r, []); sat.get(r).push(...k.ks); });
    return [...sat.values()].map(ks => {
        const { x: gx0, y: gy0, x1: gx1, y1: gy1, kh } = kutu(ks);
        // çizgi mürekkebi: grubun 2h çevresindeki maske pikseli / h. 1h dardı: yazı–ölçü çizgisi arası 0,8h olan çizimde çizgi
        //   halkanın 1 px dışında kaldı, gerçek ölçü "not" sayıldı (sentetik sınav, 30 çizimde 3 vaka)
        let cz = 0; const ex0 = Math.max(0, gx0 - x0 - 2 * h), ex1 = Math.min(pw, gx1 - x0 + 2 * h), ey0 = Math.max(0, gy0 - y0 - 2 * h), ey1 = Math.min(ph, gy1 - y0 + 2 * h);
        for (let y = Math.floor(ey0); y < ey1; y++) for (let x = Math.floor(ex0); x < ex1; x++) cz += sil[y * pw + x];
        // TABLO HÜCRESİ: üstte ve altta 2,5h içinde (yüksek satırlı genel tolerans tablosu), solda ve sağda 8h içinde (sütun geniş olabilir) yazıyı boydan boya geçen çizgi (MAN 6984 POS
        //   tablosundaki 4/3/2/1 ölçü sanılıyordu). Ölçü yazısının dört yanı birden kapalı olmaz.
        const lx0 = gx0 - x0, lx1 = gx1 - x0, ly0 = gy0 - y0, ly1 = gy1 - y0;
        const satir = (y) => { let n = 0; for (let x = lx0; x < lx1; x++) n += sil[y * pw + x]; return n >= 0.8 * (lx1 - lx0); };
        const sutun = (x) => { let n = 0; for (let y = ly0; y < ly1; y++) n += sil[y * pw + x]; return n >= 0.8 * (ly1 - ly0); };
        const ara = (a, b, f) => { const ad = a < b ? 1 : -1; for (let i = a; i !== b; i += ad) if (f(i)) return true; return false; };
        const tablo = ara(ly0 - 1, Math.max(-1, Math.floor(ly0 - 2.5 * h) - 1), satir) && ara(ly1, Math.min(ph, Math.ceil(ly1 + 2.5 * h)), satir) &&
            ara(lx0 - 1, Math.max(-1, Math.floor(lx0 - 8 * h) - 1), sutun) && ara(lx1, Math.min(pw, Math.ceil(lx1 + 8 * h)), sutun);
        return { x: gx0, y: gy0, width: gx1 - gx0, height: gy1 - gy0, n: ks.length, cx: (gx0 + gx1) / 2, cy: (gy0 + gy1) / 2, kh, cz: Math.round(cz / h * 10) / 10, tablo };
    });
}

// Büyük görüntüde parça parça (tek seferde 6622×4677 ≈ 300 MB etiket dizisi eder); örtüşme şeridi 6h — grup merkezi
//   parçanın kendi alanındaysa alınır (iki parçada birden sayılmaz)
async function aiGruplariBul(kaynak, KW, KH, b, h) {
    const T = 2048, O = Math.ceil(6 * h), out = [];
    for (let y = b.y0; y < b.y1; y += T) for (let x = b.x0; x < b.x1; x += T) {
        const tx0 = Math.max(0, x - O), ty0 = Math.max(0, y - O), tx1 = Math.min(KW, x + T + O), ty1 = Math.min(KH, y + T + O);
        const c = document.createElement('canvas'); c.width = tx1 - tx0; c.height = ty1 - ty0;
        c.getContext('2d').drawImage(kaynak, tx0, ty0, c.width, c.height, 0, 0, c.width, c.height);
        for (const g of aiMetinGruplari(aiGriVeri(c), c.width, c.height, { x0: 0, y0: 0, x1: c.width, y1: c.height }, h)) {
            const cx = g.cx + tx0, cy = g.cy + ty0;
            if (cx < x || cx >= x + T || cy < y || cy >= y + T) continue;
            out.push({ ...g, x: g.x + tx0, y: g.y + ty0, cx, cy });
        }
        await aiUyu(0);                                   // arayüz donmasın
    }
    return out;
}

// Tablo hücresi mi: kapalı hücre tek başına yetmez (geometrik tolerans çerçevesi "0.05" ve iki çizgi arasındaki "80" de kapalı);
//   aynı sütunda 10 karakter boyu içinde en az 3 kapalı hücre → parça listesi / antet (parça listesinde ince "1" rakamları
//   grup sayılmadığından komşu satır zinciri kopuyordu, sentetik sınav 3)
function aiTabloda(g, gr) {
    return g.tablo && gr.filter(o => o !== g && o.tablo && o.x < g.x + g.width && o.x + o.width > g.x && Math.abs(o.cy - g.cy) <= 10 * g.kh).length >= 2;
}

// Okunan metin ölçü yazısı mı: 48, 0.1, R5, ø8, 4x ø11, M8x1.25, 1×45°, 80 ±20, 27 +0.2/-0.1, ø60 H7
//   (standart kodu "VW 10500", ölçek "2:1", format "A3", ağırlık "63g", tek başına "0" ölçü değildir)
function aiOlcuMetniMi(s) {
    const t = String(s || '').replace(/\s+/g, '').replace(/,/g, '.');
    if (/\.\d{4,}/.test(t) || /\d{6,}/.test(t)) return false;                       // parça / standart no ("04.89239-2644")
    const ar = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(t);                        // "0.5-6", "120-400": tablo aralığı
    if (ar && +ar[2] >= 1) return false;                                                //   (tolerans "-0.2" 1'den küçüktür)
    return /^(\d+[x×X])?(SR|R|Ø|ø|⌀|M)?\d+(\.\d+)?([x×X]\d+(\.\d+)?)?°?(±\d+(\.\d+)?|[+\-]\d+(\.\d+)?([+\-/]+\d+(\.\d+)?)?)?([A-Za-z]{1,2}\d{1,2})?$/.test(t) && /[1-9]/.test(t);
}

// GÜVENLİK AĞI — kapsam modele bırakılmaz. Ölçüldü: aynı çizim (5NA) bir çalıştırmada 23/23, ötekinde dikey "15" ve
//   eğik "0.1" eksik; 6FA'da not cümlesindeki 410/420/30/3 balonlandı, "190 ±40"ın yalnız "±40"ı kutulanıp elendi.
//   (1) yanında hiç çizgi olmayan grup (cz = 0) NOT/işaret tablosu yazısıdır → model okusa da balonlanmaz;
//   (2) kabul kutusu daha büyük bir grubun parçasıysa ("80 ±20"nin "80"i) grup bütün olarak yeniden okunur;
//   (3) hiçbir kutuyla örtüşmeyen, çizgi yanındaki, ölçülere yakın gruplar yakın plan okutulur; ölçüyse balonlanır.
//   kutular: [{o,k}] (k kaynak pikseli, null = elenmiş); mevcut: kullanıcının var olan balon kutuları (kaynak pikseli)
async function aiGuvenlikAgi(kaynak, KW, KH, kutular, mevcut, ayar, ilerleme) {
    const kab = kutular.filter(x => x.k), sonuc = { yeni: [], not: 0, genis: 0, aday: 0, teyitsiz: 0 };
    if (kab.length < 3) return sonuc;                     // ölçü bulunmamış çizimde yazı boyu bilinmez
    const hs = kab.map(x => Math.min(x.k.width, x.k.height)).sort((a, c) => a - c), h = hs[hs.length >> 1];
    // TÜM SAYFA taranır. Eskiden yalnız kabul kutularının 12h çevresi taranıyordu: model bir görünüşün (ayrı parça, yan görünüş
    //   kalınlığı) bütün ölçülerini kaçırınca o görünüş ağın da dışında kalıyordu (sentetik sınavda "80 ±0.2", "2.5", "50").
    //   Not cümlesi / tablo sütunu / pafta kenarı kendi kurallarıyla dışarıda.
    const b = { x0: 0, y0: 0, x1: KW, y1: KH };
    const gr = await aiGruplariBul(kaynak, KW, KH, b, h);
    const merkezde = (g, k) => { const cx = k.x + k.width / 2, cy = k.y + k.height / 2; return cx >= g.x - 3 && cx <= g.x + g.width + 3 && cy >= g.y - 3 && cy <= g.y + g.height + 3; };
    const karakter = s => (String(s).match(/[0-9A-Za-zØø⌀±×]/g) || []).length;
    const tekrar = [];
    for (const x of kab) {
        const g = gr.find(g => merkezde(g, x.k)); if (!g) continue;
        if (g.cz === 0 && g.n >= 5) { x.k = null; x.not = true; sonuc.not++; continue; }   // not = çizgisiz CÜMLE; çizgisiz tek ölçü silinmez
        // grupta değerden fazla karakter var (tolerans / adet öneki okunmamış) → yeniden oku. Alan şartına bağlıydı; kutu yazının
        //   tamamını sardığında "40 ±1" yalnız "40" kaldı (sentetik sınav)
        if (g.n > karakter(x.o.deger)) tekrar.push({ x, k: g });
        else if (g.width * g.height > 1.5 * x.k.width * x.k.height) x.k = { x: g.x, y: g.y, width: g.width, height: g.height };   // değer tam, kutu eksikti → genişlet
    }
    const pay = 0.5 * h, kes = (g, k) => g.x < k.x + k.width + pay && g.x + g.width > k.x - pay && g.y < k.y + k.height + pay && g.y + g.height > k.y - pay;
    const kenar = g => g.n <= 1 && (g.cy < KH * 0.045 || g.cy > KH * 0.955 || g.cx < KW * 0.03 || g.cx > KW * 0.97);   // pafta no / harfi
    const kapsayan = kab.filter(x => x.k).map(x => x.k).concat(mevcut);
    const yeni = gr.filter(g => g.cz > 0 && !aiTabloda(g, gr) && g.n <= 8 && !kenar(g) && !kapsayan.some(k => kes(g, k))).map(g => ({ k: g }));
    sonuc.aday = yeni.length;
    if (!tekrar.length && !yeni.length) return sonuc;
    const istem = 'Bu görüntü bir kolaj: her hücrenin sol üst köşesinde hücre numarası (0\'dan başlar) yazar. Her hücrede bir teknik resimden kesit ve KIRMIZI ÇERÇEVE var. Çerçevenin içindeki (ona taşan) yazının TAMAMINI oku; yazı yan yatmış ya da eğik olabilir. Yazı bir ÖLÇÜ DEĞERİ ise (ölçü çizgisine, oka ya da kılavuz çizgisine bağlı sayı: 48, 0.1, R5, ø8, 12.5, 4x ø11, 1x45°, 80 ±20, 27 +0.2/-0.1, ø60 H7, geometrik tolerans çerçevesindeki sayı) aynen yaz; toleransı da dahil et. Ölçü DEĞİLSE "" yaz: kelime, not cümlesi, tablo ya da antet yazısı, standart kodu (VW 10500, DIN 1451), daire içindeki referans/pozisyon numarası, pafta harf/numarası, ölçek (2:1), yalnız ok ucu, çizgi, delik ya da boşluk. Yalnız JSON dizisi: [{"i":0,"deger":"48"}, ...]';
    const hepsi = tekrar.concat(yeni);
    const okunan = await aiKolajDogrula(kaynak, hepsi, ayar, ilerleme, { pay: Math.round(1.5 * h), cerceve: Math.round(0.25 * h), istem });
    const sayi = s => String(s).replace(/\s+/g, '').replace(/,/g, '.').toLowerCase();
    for (const t of tekrar) {
        const m = okunan.get(t); if (!m || !aiOlcuMetniMi(m)) continue;
        if (sayi(m).length > sayi(t.x.o.deger).length && sayi(m).includes(sayi(t.x.o.deger).replace(/^[rø⌀]/, ''))) { t.x.o = { ...t.x.o, deger: m }; t.x.k = { x: t.k.x, y: t.k.y, width: t.k.width, height: t.k.height }; sonuc.genis++; }
    }
    const bulunan = [];
    for (const y of yeni) {
        const m = okunan.get(y); if (!m || !aiOlcuMetniMi(m) || !aiCerceveDisi({ deger: m, x: y.k.cx, y: y.k.cy }, KW, KH)) continue;
        // bölünmüş yazı (eğik "0.1"in "0" ve "1" parçası) yakın planda ikisi de aynı değeri okur → tek balon, kutular birleşir
        const es = bulunan.find(b => sayi(b.o.deger) === sayi(m) && Math.hypot(b.o.x - y.k.cx, b.o.y - y.k.cy) <= 2.5 * h);
        if (es) { const k = es.k, x0 = Math.min(k.x, y.k.x), y0 = Math.min(k.y, y.k.y); es.k = { x: x0, y: y0, width: Math.max(k.x + k.width, y.k.x + y.k.width) - x0, height: Math.max(k.y + k.height, y.k.y + y.k.height) - y0 }; continue; }
        bulunan.push({ o: { deger: m.trim(), x: y.k.cx, y: y.k.cy, ag: true }, k: { x: y.k.x, y: y.k.y, width: y.k.width, height: y.k.height } });
    }
    // TEYİT (3. katman): yakın planda ölçü çıkan yeni aday, bağlamsız dar kesitle bir daha okunur; uyuşmazsa atılır.
    //   Ölçüldü (6FA): bağlamlı okumada "16"nın ok uçları "6" / "1" / "7" diye okunup balonlandı. Tek karakterde tam eşitlik.
    const teyit = bulunan.length ? await aiKolajDogrula(kaynak, bulunan, ayar, ilerleme) : new Map();
    for (const x of bulunan) {
        if (!teyit.has(x)) x.o.kontrol = true;                                              // teyit edilemedi (kota / ağ) → turuncu
        else { const m2 = teyit.get(x); if (karakter(x.o.deger) <= 1 ? sayi(m2) !== sayi(x.o.deger) : !aiDogrulaEslesir(x.o.deger, m2)) {
            if (!aiOlcuMetniMi(m2)) { sonuc.teyitsiz++; continue; }                         // ikinci okuma ölçü değil (ok ucu, çizgi) → at
            x.o.kontrol = true; } }                                                         // iki okuma farklı ölçü → turuncu, kullanıcı karar versin
        sonuc.yeni.push(x);
    }
    return sonuc;
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
    // 12 sn sonra kapan; metinle değil sayaçla karşılaştır (EN'de çeviri katmanı metni değiştiriyor, eşitlik hiç tutmuyordu)
    const no = String((+el.dataset.no || 0) + 1); el.dataset.no = no;
    el.style.cursor = tip ? 'pointer' : ''; el.onclick = tip ? () => { el.style.display = 'none'; } : null;
    if (tip === 'ok' || tip === 'err') setTimeout(() => { if (el.dataset.no === no) el.style.display = 'none'; }, 12000);
}

// Ana akış: çizimi oku → mürekkep kutusuna hizala → balon + tablo satırı → Hizala
async function autoBalloonAI() {
    if (!imageLoaded || !currentImage) { alert('Önce bir teknik resim yükleyin.'); return; }
    const ayar = aiAyar();
    if (!ayar.key) { alert('Gemini API anahtarı girilmemiş.\n\n⚙️ API sayfasında "Gemini (Otomatik Balonlama)" kartına anahtarı yazıp kaydedin.'); window.open('api-setup.html', '_blank'); return; }
    if (annotations.length && !confirm('Mevcut ' + annotations.length + ' balon korunur, otomatik bulunanlar üstüne eklenir. Devam?')) return;
    const btn = document.getElementById('autoBalloonBtn'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Okunuyor…'; }
    AI_BALON.iptal = false; AI_BALON.mi = 0; showLoading(true);
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
        // kolaj doğrulaması: kutu kırpıntısı modele geri okutulur; boş ya da beklenenle uyuşmayan kutu elenir
        const dogrulanacak = kutular.filter(x => x.k);
        const okunan = await aiKolajDogrula(kaynak, dogrulanacak, ayar, (i, n) => aiDurum('🤖 Kutular doğrulanıyor: ' + i + '/' + n));
        const elenen = [];
        for (const x of dogrulanacak) {
            const m = okunan.get(x), on = s => (/^\s*(SR|R|M|[Øø⌀])/i.exec(aiAdetsiz(s)) || [''])[0].trim().toUpperCase().replace(/[ø⌀]/i, 'Ø');
            if (m && aiOlcuMetniMi(m) && on(m) && on(m) !== on(x.o.deger) && aiDogrulaEslesir(x.o.deger, m)) x.o = { ...x.o, deger: m.trim() };   // 6FA: "R5" kutusu "15" okunmuştu
        }
        // doğrulama isteği yanıtsız kaldıysa (kota / ağ) okuma kabul edilir ama TURUNCU işaretlenir — sınavda kota anında ok ucuna
        //   "63", "20"nin üstüne "27" balonu böyle sessizce girmişti
        for (const x of dogrulanacak) if (!okunan.has(x)) x.o = { ...x.o, kontrol: true };
        for (const x of dogrulanacak) { if (okunan.has(x) && !aiDogrulaEslesir(x.o.deger, okunan.get(x))) { elenen.push(x.o.deger + (okunan.get(x) ? ' (kutuda "' + okunan.get(x) + '" okundu)' : ' (kutuda yazı yok)')); x.k = null; } }
        // aynı değerin küçük 'hayalet' kutusu (ok ucu / çizgi parçası): aynı değerde çok daha büyük bir kutu varsa ele
        const kAlan = k => k.width * k.height, kDeg = o => String(o.deger).replace(/\s+/g, '').toLowerCase();
        for (const x of kutular) if (x.k) for (const y of kutular) if (y !== x && y.k && kDeg(y.o) === kDeg(x.o) && kAlan(x.k) < 0.35 * kAlan(y.k)) { x.k = null; break; }
        // parça okuma: '1×45°' içinden ayrıca '1' okunmuşsa (kutusu, değeri onunla başlayan kutunun yarıdan fazla içinde) ele
        const kKes = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        for (const x of kutular) if (x.k) for (const y of kutular) if (y !== x && y.k && kDeg(y.o) !== kDeg(x.o) && kDeg(y.o).startsWith(kDeg(x.o)) && kKes(x.k, y.k) > 0.5 * kAlan(x.k)) { x.k = null; break; }
        // GÜVENLİK AĞI: not sayısını ele, parça kutuyu bütün yazıya genişlet, balonsuz kalan ölçüleri yakın plan okut
        const mevcut = annotations.map(a => ({ x: a.rect.x / oran, y: a.rect.y / oran, width: a.rect.width / oran, height: a.rect.height / oran }));
        let ag = { yeni: [], not: 0, genis: 0, aday: 0 };
        try { ag = await aiGuvenlikAgi(kaynak, KW, KH, kutular, mevcut, ayar, (i, n) => aiDurum('🔎 Güvenlik taraması: ' + i + '/' + n)); } catch (e) { console.error('güvenlik ağı', e); }
        kutular.push(...ag.yeni);
        const agNo = s => String(s).replace(/\s+/g, '').replace(/,/g, '.').toLowerCase();   // ağın kurtardığı ELENEN okuma artık listelenmez
        const elenenKalan = elenen.filter(e => !ag.yeni.some(y => agNo(y.o.deger).includes(agNo(e.split(' (')[0]))));
        for (const { o, k: ko, not } of kutular) {
            if (!ko) { if (!not) hayalet++; continue; }
            const k = { x: ko.x * oran, y: ko.y * oran, width: ko.width * oran, height: ko.height * oran };   // canvas uzayı
            if (annotations.some(a => Math.abs(a.rect.x - k.x) < 12 && Math.abs(a.rect.y - k.y) < 12)) { cakisan++; continue; }   // aynı kutuda balon var
            const p = parseToleranceFromText(o.deger);
            const ann = {
                id: Date.now() + eklenen, number: balloonCounter + eklenen,
                rect: { x: Math.max(0, k.x - 3), y: Math.max(0, k.y - 3), width: k.width + 6, height: k.height + 6 },
                balloon: { x: k.x + k.width + 50, y: k.y - 20 },
                balloonShape: currentBalloonShape, balloonColor: o.kontrol ? '#e67e22' : currentBalloonColor, lineColor: currentLineColor, textColor: currentTextColor,
                fillType: currentFillType, balloonSize: currentBalloonSize, balloonTextSize: currentBalloonTextSize, fontFamily: currentFontFamily,
                dimension: (p && p.dimension) || o.deger, lowerTolerance: (p && p.lowerTolerance) || '', upperTolerance: (p && p.upperTolerance) || '',
                aiOkuma: true, aiAg: !!o.ag, aiKontrol: !!o.kontrol
            };
            if (!ann.lowerTolerance && !ann.upperTolerance) applyDefaultTolerances(ann);
            annotations.push(ann); addTableRow(ann); eklenen++;
        }
        balloonCounter += eklenen;
        if (eklenen) autoAlignBalloons();      // kullanıcı isteği: otomatik balonlamadan sonra hizala + yeniden numarala
        redrawCanvas();
        const kontrolSay = annotations.filter(a => a.aiKontrol).length;
        const ozet = '✓ ' + eklenen + ' ölçü balonlandı (' + kare + ' kare)' + (kontrolSay ? ' · ' + kontrolSay + ' TURUNCU balon doğrulanamadı — kontrol edin' : '') + (ag.yeni.length ? ' · güvenlik taraması +' + ag.yeni.length + ' ölçü buldu' : '') + (ag.genis ? ' · ' + ag.genis + ' ölçü toleransıyla tamamlandı' : '') + (ag.not ? ' · ' + ag.not + ' not sayısı atlandı' : '') + (hayalet ? ' · ' + hayalet + ' okuma kutu bulunamadığı/doğrulanamadığı için atıldı' : '') + (elenenKalan.length ? ' · ELENEN: ' + elenenKalan.join(', ') + ' — bunları elle balonlayın' : '') + (cakisan ? ' · ' + cakisan + ' zaten balonluydu' : '') + (hatalar.length ? ' · HATA: ' + hatalar.join(', ') : '') + ' — Ölçü tablosundan kontrol edin.';
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
