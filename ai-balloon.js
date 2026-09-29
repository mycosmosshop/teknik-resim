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
    let mi = 0, son = 0; const ham = []; const hatalar = [];
    const buyuk = W * H >= 14e6; const kareOlcu = new Map();    // 1. geçiş kare başına bulunan ölçü sayısı
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
function aiDogrulaEslesir(beklenen, okunan) {
    const n = s => { const m = /[0-9]+(?:[.,][0-9]+)?/.exec(String(s || '')); return m ? m[0].replace(',', '.') : ''; };   // ilk sayı grubu ("80 ±20" → 80)
    const a = n(beklenen), b = n(okunan);
    if (!a || !b) return false;
    // önek kabul: eğik/küçük yazıda model bazen "0.1"i "0." diye kesik okuyor (ölçüldü) — yanlış kutuda bambaşka sayı çıkar
    return a === b || a.startsWith(b) || a.endsWith(b);   // kısmi kutu (dikey "417"de "17") sonek olarak da kabul
}
function aiKolajYerlesim(n, HW = 300, HH = 180, COLS = 4) {   // hücre büyütüldü: eğik küçük "0.1" 240×140'ta kesik okunuyordu
    const rows = Math.ceil(n / COLS);
    return { W: COLS * HW, H: rows * HH, hucre: Array.from({ length: n }, (_, i) => ({ x: (i % COLS) * HW, y: Math.floor(i / COLS) * HH, w: HW, h: HH })) };
}
async function aiKolajDogrula(kaynak, adaylar, ayar, ilerleme) {
    const okunan = new Map(); const PARTI = 15; let son = 0;
    for (let p = 0; p < adaylar.length; p += PARTI) {
        if (AI_BALON.iptal) break;
        const grup = adaylar.slice(p, p + PARTI); const L = aiKolajYerlesim(grup.length);
        const c = document.createElement('canvas'); c.width = L.W; c.height = L.H; const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, L.W, L.H); g.strokeStyle = '#888'; g.fillStyle = '#000'; g.font = 'bold 14px Arial';
        grup.forEach(({ k }, i) => {
            const h = L.hucre[i], pad = 6, sx = Math.max(0, k.x - pad), sy = Math.max(0, k.y - pad), sw = k.width + 2 * pad, sh = k.height + 2 * pad;
            const s = Math.min(4, (h.w - 30) / sw, (h.h - 30) / sh), dw = Math.max(1, sw * s), dh = Math.max(1, sh * s);
            g.drawImage(kaynak, sx, sy, sw, sh, h.x + (h.w - dw) / 2, h.y + (h.h - dh) / 2, dw, dh);
            g.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1); g.fillText(String(i), h.x + 4, h.y + 16);
        });
        ilerleme(Math.min(p + PARTI, adaylar.length), adaylar.length);
        const istem = 'Bu görüntü bir kolaj: ' + grup.length + ' hücre var, her hücrenin sol üst köşesinde hücre numarası (0\'dan başlar) yazar. Her hücrede bir teknik resimden kırpılmış ÖLÇÜ YAZISI olması beklenir (48, R5, 12.5, ø8, 0.1 gibi; yazı yan yatmış ya da eğik olabilir). Her hücre için hücrede okunan ölçü metnini döndür. Hücrede okunabilir bir sayı YOKSA (yalnız çizgi, ok ucu, daire, boşluk) değer olarak "" yaz. Yalnız JSON dizisi: [{"i":0,"deger":"48"}, ...]';
        const bekle = AI_BALON.KADANS_MS - (Date.now() - son); if (son && bekle > 0) await aiUyu(bekle); son = Date.now();
        let metin = null;
        try { metin = await aiGemini(c.toDataURL('image/png').split(',')[1], ayar.model, ayar.key, istem); }
        catch (e) { if (e.status === 429 || e.status >= 500) { await aiUyu(aiBeklemeSn(e.body, 8) * 1000); try { metin = await aiGemini(c.toDataURL('image/png').split(',')[1], ayar.model, ayar.key, istem); } catch (e2) { metin = null; } } }
        if (metin === null) continue;                         // doğrulanamadı → bu parti olduğu gibi kabul
        for (const x of aiCozumle(metin)) { const i = +x.i; if (i >= 0 && i < grup.length) okunan.set(grup[i], String(x.deger == null ? '' : x.deger).trim()); }
    }
    return okunan;   // aday → okunan metin (doğrulanamayan adaylar Map'te yok)
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
        // kolaj doğrulaması: kutu kırpıntısı modele geri okutulur; boş ya da beklenenle uyuşmayan kutu elenir
        const dogrulanacak = kutular.filter(x => x.k);
        const okunan = await aiKolajDogrula(kaynak, dogrulanacak, ayar, (i, n) => aiDurum('🤖 Kutular doğrulanıyor: ' + i + '/' + n));
        const elenen = [];
        for (const x of dogrulanacak) { if (okunan.has(x) && !aiDogrulaEslesir(x.o.deger, okunan.get(x))) { elenen.push(x.o.deger + (okunan.get(x) ? ' (kutuda "' + okunan.get(x) + '" okundu)' : ' (kutuda yazı yok)')); x.k = null; } }
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
        const ozet = '✓ ' + eklenen + ' ölçü balonlandı (' + kare + ' kare)' + (hayalet ? ' · ' + hayalet + ' okuma kutu bulunamadığı/doğrulanamadığı için atıldı' : '') + (elenen.length ? ' · ELENEN: ' + elenen.join(', ') + ' — bunları elle balonlayın' : '') + (cakisan ? ' · ' + cakisan + ' zaten balonluydu' : '') + (hatalar.length ? ' · HATA: ' + hatalar.join(', ') : '') + ' — Ölçü tablosundan kontrol edin.';
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
