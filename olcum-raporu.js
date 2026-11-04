// Ölçüm raporu (F.063 / VDA ilk numune): balonlu ölçüler kullanıcının Excel şablonunun İKİNCİ sekmesine yazılır.
// Şablonda imza ve kişi bilgisi var, depo herkese açık: şablon koda/depoya girmez, kullanıcı seçer, yalnız tarayıcısında durur.
// Tarayıcıda biçimi koruyarak yalnız .xlsx yazılabilir (JSZip ile XML'e değer yazılır; biçim, kapak, görsel, formül aynen kalır).
const OR_SABLON_KEY = 'teknikresim_olcum_sablon';

function orKolon(c) { let n = 0; for (const h of c) n = n * 26 + h.charCodeAt(0) - 64; return n; }
function orXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// "285"→285 (sayı), "Ø27.5"→"Ø27,5", "40 ±0.1"→40 (tolerans kendi sütununda)
function orNominal(d) {
    const s = String(d == null ? '' : d).split('±')[0].trim();
    if (/^\d+(?:[.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
    return s.replace(/(\d)\.(\d)/g, '$1,$2');
}
// -1.2 / +1.2 → "± 1,2 mm"; +0.5 / -0.2 → "+0,5 / -0,2 mm"
function orTolerans(alt, ust) {
    const say = x => { const t = String(x == null ? '' : x).trim().replace(',', '.'); return t === '' ? NaN : parseFloat(t); };
    const yaz = v => String(Math.abs(v)).replace('.', ',');
    const a = say(alt), u = say(ust);
    if (isNaN(a) && isNaN(u)) return '';
    if (a === -u && u !== 0) return '± ' + yaz(u) + ' mm';
    const isaretli = v => (v > 0 ? '+' : v < 0 ? '-' : '') + yaz(v);
    return [u, a].filter(v => !isNaN(v)).map(isaretli).join(' / ') + ' mm';
}
// Ölçü sınırları: nominal + alt/üst tolerans (tolerans yoksa o sınır yok). Ondalık gürültüsü atılır (285-1.2 = 283.8)
function orSinirlar(boyut, alt, ust) {
    const say = x => { const t = String(x == null ? '' : x).trim().replace(',', '.'); return t === '' ? NaN : parseFloat(t); };
    const n = nominalDeger(boyut), kes = v => parseFloat(v.toFixed(6));
    if (isNaN(n)) return {};
    return { alt: isNaN(say(alt)) ? null : kes(n + say(alt)), ust: isNaN(say(ust)) ? null : kes(n + say(ust)) };
}
// Toleransı seçili standarttan farklı mı. Standardın karşılığı yoksa (Ra, çok küçük ölçü) ya da ölçüde tolerans yoksa uyarı yok.
function orStandartDisi(o, standart) {
    if (!standart) return false;
    const say = x => { const t = String(x == null ? '' : x).trim().replace(',', '.'); return t === '' ? NaN : parseFloat(t); };
    const b = standart(o.dimension) || {};
    const a = say(o.lowerTolerance), u = say(o.upperTolerance), ba = say(b.alt), bu = say(b.ust);
    if ((isNaN(a) && isNaN(u)) || (isNaN(ba) && isNaN(bu))) return false;
    const farkli = (x, y) => (isNaN(x) !== isNaN(y)) || (!isNaN(x) && Math.abs(x - y) > 1e-9);
    return farkli(a, ba) || farkli(u, bu);
}
// Seçilen çizimler → tablo satırları: Ref numarasına göre, çizim no grubun ilk satırında
function orSatirlar(cizimler, standart) {
    const enKucuk = c => Math.min(...c.olculer.map(o => Number(o.number)));
    const satirlar = [];
    cizimler.filter(c => c.olculer.length).sort((x, y) => enKucuk(x) - enKucuk(y)).forEach(c => {
        [...c.olculer].sort((x, y) => Number(x.number) - Number(y.number)).forEach((o, i) => {
            satirlar.push({ ref: Number(o.number), cizim: i === 0 ? (c.ad || '') : '', nominal: orNominal(o.dimension), tolerans: orTolerans(o.lowerTolerance, o.upperTolerance),
                sinir: orSinirlar(o.dimension, o.lowerTolerance, o.upperTolerance), standartDisi: orStandartDisi(o, standart) });
        });
    });
    return satirlar;
}
// Aynı Ref numarası birden çok çizimde varsa: rapor iki kez aynı numarayı gösterir, kullanıcı uyarılır
function orCakisanNumaralar(cizimler) {
    const gorulen = new Set(), cakisan = new Set();
    cizimler.forEach(c => new Set(c.olculer.map(o => Number(o.number))).forEach(n => { (gorulen.has(n) ? cakisan : gorulen).add(n); }));
    return [...cakisan].sort((a, b) => a - b);
}

// L sütunundaki ölçüm metninden sayı: "Ø27,5", "R5", 27.5 hepsi okunur; Excel diline bağlı değil
function orOlcumSayisi(hucre) {
    let m = hucre + '&""';
    [['.', ','], ['Ø', ''], ['ø', ''], ['R', ''], ['M', ''], [' ', '']].forEach(([a, b]) => { m = 'SUBSTITUTE(' + m + ',"' + a + '","' + b + '")'; });
    return '_xlfn.NUMBERVALUE(' + m + ',",",".")';
}
// Kırmızı işaret koşullu biçimle: ölçüm girilince Excel'de anında yanar, ölçüm düzeltilince söner
function orKosullar(veri, ilk, dxf) {
    let sira = 1;
    const kural = (ref, formul) => '<conditionalFormatting sqref="' + ref + '"><cfRule type="expression" dxfId="' + dxf + '" priority="' + (sira++) + '"><formula>' + orXml(formul) + '</formula></cfRule></conditionalFormatting>';
    return veri.map((v, i) => {
        const r = ilk + i, sinir = v.sinir || {}, kos = [];
        const sayi = orOlcumSayisi('L' + r);
        if (sinir.alt != null) kos.push(sayi + '<' + sinir.alt);
        if (sinir.ust != null) kos.push(sayi + '>' + sinir.ust);
        let x = '';
        if (kos.length) x += kural('L' + r + ':N' + r, 'IFERROR(AND(L' + r + '<>"",OR(' + kos.join(',') + ')),FALSE)');
        if (v.standartDisi) x += kural('F' + r, 'F' + r + '="' + v.tolerans + '"');   // Excel'de tolerans düzeltilince söner
        return x;
    }).join('');
}

async function orDoldur(JSZipSinif, sablon, cizimler, standart) {
    const zip = await JSZipSinif.loadAsync(sablon);
    const oku = p => { const f = zip.file(p); if (!f) throw new Error('Şablonda eksik parça: ' + p); return f.async('string'); };

    // İkinci sekmenin dosyası
    let wb = await oku('xl/workbook.xml');
    const wbRels = await oku('xl/_rels/workbook.xml.rels');
    const sekmeler = [...wb.matchAll(/<sheet\b[^>]*?r:id="([^"]+)"/g)].map(m => m[1]);
    if (sekmeler.length < 2) throw new Error('Şablonda ikinci sekme yok.');
    const hedefi = id => new RegExp('<Relationship\\b[^>]*\\bId="' + id + '"[^>]*>').exec(wbRels)[0].match(/Target="([^"]+)"/)[1];
    const sekmeYol = 'xl/' + hedefi(sekmeler[1]).replace(/^\/?xl\//, '');
    let xml = await oku(sekmeYol);

    // Ortak metinler (tablonun başı ve sonu metinden bulunur)
    const ortak = zip.file('xl/sharedStrings.xml') ? [...(await oku('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)]
        .map(m => [...m[1].matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map(t => t[1]).join('')) : [];
    const SATIR = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, HUCRE = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
    const satirNo = r => parseInt(/\br="(\d+)"/.exec(r)[1]);
    const bMetni = r => { const c = (r.match(HUCRE) || []).find(h => /\br="B\d+"/.test(h)); if (!c || !/t="s"/.test(c)) return '';
        const v = /<v>(\d+)<\/v>/.exec(c); return v ? ortak[+v[1]] || '' : ''; };

    const satirlar = xml.match(SATIR) || [];
    const baslik = satirlar.find(r => /^Nr\.?\s*$/.test(bMetni(r)));
    const ilk = baslik ? satirNo(baslik) + 1 : 0;
    const altBolum = satirlar.find(r => satirNo(r) >= ilk && /onay/i.test(bMetni(r)));
    if (!baslik || !altBolum) throw new Error('İkinci sekmede ölçü tablosu bulunamadı ("Nr." başlığı / "Onay" alt bölümü).');
    const son = satirNo(altBolum) - 1;                 // tablonun son satırı (alt çerçeveli)

    const veri = orSatirlar(cizimler, standart);
    const ek = Math.max(0, veri.length - (son - ilk + 1));

    // Sığmazsa: son satırın üstüne orta satırın biçimiyle satır açılır, altındaki her şey aşağı kayar.
    // ponytail: aynı sekme içi formül başvuruları kaydırılmaz; F.063'te alt bölümde yalnız kapak! başvurusu var.
    const kaydirSatir = n => (n >= son ? n + ek : n);
    const kaydirRef = s => s.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (m, k, n) => k + kaydirSatir(parseInt(n)));
    const satirTasi = (r, yeni) => r.replace(/(<row\b[^>]*?\br=")\d+"/, '$1' + yeni + '"').replace(/(<c\b[^>]*?\br="[A-Z]+)\d+"/g, '$1' + yeni + '"');
    if (ek) {
        const orta = satirlar.find(r => satirNo(r) === son - 1);
        const yeniler = Array.from({ length: ek }, (_, i) => satirTasi(orta, son + i)).join('');
        let eklendi = false;
        xml = xml.replace(SATIR, r => { const n = satirNo(r); if (n < son) return r;
            const t = satirTasi(r, n + ek); if (eklendi) return t; eklendi = true; return yeniler + t; });
        xml = xml.replace(/<(mergeCell|hyperlink|dimension)\b[^>]*?\bref="[^"]+"/g, m => m.replace(/ref="([^"]+)"/, (a, v) => 'ref="' + kaydirRef(v) + '"'));
        xml = xml.replace(/\bsqref="[^"]+"/g, m => m.replace(/sqref="([^"]+)"/, (a, v) => 'sqref="' + kaydirRef(v) + '"'));
        // Print_Area ve görseller (imza) de kayar
        wb = wb.replace(new RegExp('(<definedName\\b[^>]*localSheetId="1"[^>]*>)([^<]*)(</definedName>)', 'g'), (m, a, v, z) => a + v.replace(/\$([A-Z]+)\$(\d+)/g, (x, k, n) => '$' + k + '$' + kaydirSatir(parseInt(n))) + z);
        const relYol = sekmeYol.replace(/([^/]+)$/, '_rels/$1.rels');
        if (zip.file(relYol)) {
            const rels = await oku(relYol);
            for (const m of rels.matchAll(/Target="([^"]*drawings\/[^"]+\.xml)"/g)) {
                const p = 'xl/' + m[1].replace(/^(\.\.\/|\/xl\/)/, '');
                zip.file(p, (await oku(p)).replace(/<xdr:row>(\d+)<\/xdr:row>/g, (a, n) => '<xdr:row>' + (kaydirSatir(parseInt(n) + 1) - 1) + '</xdr:row>'));
            }
        }
    }

    // Tablo satırları: eski değerler silinir (biçim kalır), yenileri yazılır. Ölçümler (L, M, N) ve uygun/uygun değil boş kalır.
    const hucre = (ref, s, deger) => {
        const st = s ? ' s="' + s + '"' : '';
        if (deger === '' || deger == null) return '<c r="' + ref + '"' + st + '/>';
        if (typeof deger === 'number') return '<c r="' + ref + '"' + st + '><v>' + deger + '</v></c>';
        return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + orXml(deger) + '</t></is></c>';
    };
    xml = xml.replace(SATIR, r => {
        const n = satirNo(r);
        if (n < ilk || n > son + ek) return r;
        const v = veri[n - ilk] || {}, yaz = { B: v.ref, D: v.cizim, E: v.nominal, F: v.tolerans };
        const acilis = /<row\b[^>]*?\/?>/.exec(r)[0].replace(/\/>$/, '>');
        const mevcut = {};
        (r.match(HUCRE) || []).forEach(c => { const k = /\br="([A-Z]+)\d+"/.exec(c)[1], s = /\bs="(\d+)"/.exec(c); mevcut[k] = s ? s[1] : ''; });
        Object.keys(yaz).forEach(k => { if (!(k in mevcut)) mevcut[k] = ''; });
        const govde = Object.keys(mevcut).sort((a, b) => orKolon(a) - orKolon(b)).map(k => hucre(k + n, mevcut[k], yaz[k])).join('');
        return acilis + govde + '</row>';
    });
    // Ölçüm sütunu başlıkları (üç ölçüm: L, M, N)
    [['L', '1. Ölçüm'], ['M', '2. Ölçüm'], ['N', '3. Ölçüm']].forEach(([k, b]) => {
        xml = xml.replace(new RegExp('<c r="' + k + (ilk - 1) + '"( s="\\d+")?/>'), (m, st) => hucre(k + (ilk - 1), st ? /\d+/.exec(st)[0] : '', b));
    });
    // Koşullu biçim: önceki rapordan kalan tablo kuralları silinir (rapor şablon olarak seçilmiş olabilir), yenileri eklenir
    xml = xml.replace(/<conditionalFormatting\b[^>]*\bsqref="([A-Z]+)(\d+)[^"]*"[^>]*>[\s\S]*?<\/conditionalFormatting>/g, (m, k, r) => (+r >= ilk && +r <= son + ek ? '' : m));
    let stil = await oku('xl/styles.xml');
    const dxfSayi = /<dxfs\b[^>]*count="(\d+)"/.exec(stil), dxf = dxfSayi ? +dxfSayi[1] : 0;
    const kirmizi = '<dxf><font><b/><color rgb="FFFFFFFF"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/><bgColor rgb="FFFF0000"/></patternFill></fill></dxf>';
    stil = /<dxfs\b[^>]*\/>/.test(stil) ? stil.replace(/<dxfs\b[^>]*\/>/, '<dxfs count="1">' + kirmizi + '</dxfs>')
        : /<dxfs\b/.test(stil) ? stil.replace(/<dxfs\b[^>]*>/, '<dxfs count="' + (dxf + 1) + '">').replace('</dxfs>', kirmizi + '</dxfs>')
        : stil.replace('</cellStyles>', '</cellStyles><dxfs count="1">' + kirmizi + '</dxfs>');
    zip.file('xl/styles.xml', stil);
    const kosullar = orKosullar(veri, ilk, dxf);
    const yer = /<(dataValidations|hyperlinks|printOptions|pageMargins)\b/.exec(xml);
    if (kosullar) xml = yer ? xml.slice(0, yer.index) + kosullar + xml.slice(yer.index) : xml.replace('</worksheet>', kosullar + '</worksheet>');
    zip.file(sekmeYol, xml);

    // Formül sırası dosyası satır kayınca bozuk sayılır: silinir, Excel kendisi kurar; kapak bağlantıları açılışta hesaplanır
    if (zip.file('xl/calcChain.xml')) {
        zip.remove('xl/calcChain.xml');
        zip.file('[Content_Types].xml', (await oku('[Content_Types].xml')).replace(/<Override\b[^>]*calcChain[^>]*\/>/, ''));
        zip.file('xl/_rels/workbook.xml.rels', wbRels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, ''));
    }
    wb = /<calcPr\b/.test(wb) ? wb.replace(/<calcPr\b([^>]*?)\/>/, (m, a) => '<calcPr' + a.replace(/\s*fullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"/>')
        : wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/workbook.xml', wb);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── Arayüz ──
function orSablonOku() {
    try { return JSON.parse(localStorage.getItem(OR_SABLON_KEY)); } catch (e) { return null; }
}
function orBase64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function orBaytlar(b64) { const s = atob(b64), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

// Seçili standardın bu ölçü için toleransı: ölçü eklerken kullanılan kuralın aynısı
function orStandartTolerans(boyut) {
    const b = { dimension: boyut };
    applyDefaultTolerances(b);
    return { alt: b.lowerTolerance, ust: b.upperTolerance };
}

function orPencereAc() {
    const eski = document.getElementById('olcumRaporuModal'); if (eski) eski.remove();
    const cizimler = [];
    if (annotations.length) cizimler.push({ ad: window.__cizimAdi || '', olculer: annotations, secili: true, kaynak: 'Açık çizim' });

    const m = document.createElement('div');
    m.id = 'olcumRaporuModal'; m.className = 'modal show';
    m.innerHTML = `<div class="modal-content" style="max-width:620px">
        <h3>📋 Ölçüm Raporu</h3>
        <div class="modal-body">
            <div style="font-weight:bold;margin-bottom:4px">Excel şablonu</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
                <span id="orSablonAd" style="flex:1"></span>
                <label class="btn btn-info" style="margin:0;cursor:pointer;padding:5px 10px;font-size:12px">Şablon seç
                    <input type="file" id="orSablonDosya" accept=".xlsx" style="display:none"></label>
            </div>
            <div style="font-weight:bold;margin-bottom:4px">Rapora girecek çizimler</div>
            <div id="orListe" style="margin-bottom:8px"></div>
            <label class="btn btn-info" style="margin:0;cursor:pointer;padding:5px 10px;font-size:12px">➕ JSON kayıttan çizim ekle
                <input type="file" id="orJson" accept=".json" multiple style="display:none"></label>
            <div id="orStandart" style="margin-top:10px;font-size:12px"></div>
            <div id="orUyari" style="color:#c0392b;font-weight:bold;margin-top:6px"></div>
        </div>
        <div class="modal-buttons">
            <button id="orOlustur" class="btn btn-success">Raporu oluştur</button>
            <button id="orVazgec" class="btn btn-secondary">Vazgeç</button>
        </div></div>`;
    document.body.appendChild(m);
    const $ = id => document.getElementById(id);

    const seciliCizimler = () => cizimler.filter(c => c.secili);
    function ciz() {
        const s = orSablonOku();
        $('orSablonAd').textContent = s ? s.ad : 'Şablon seçilmedi (.xlsx, bir kez seçilir, bu tarayıcıda kalır)';
        const liste = $('orListe'); liste.innerHTML = '';
        if (!cizimler.length) liste.textContent = 'Henüz çizim yok. Balon ekleyin ya da JSON kayıt seçin.';
        cizimler.forEach(c => {
            const nolar = c.olculer.map(o => Number(o.number));
            const satir = document.createElement('div');
            satir.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:5px';
            const kutu = document.createElement('input'); kutu.type = 'checkbox'; kutu.checked = c.secili;
            kutu.onchange = () => { c.secili = kutu.checked; uyar(); };
            const ad = document.createElement('input'); ad.type = 'text'; ad.placeholder = 'Çizim no'; ad.value = c.ad; ad.style.cssText = 'flex:1;padding:4px;width:auto';
            ad.oninput = () => { c.ad = ad.value; };
            const bilgi = document.createElement('span'); bilgi.style.cssText = 'font-size:12px;white-space:nowrap';
            bilgi.textContent = c.kaynak + ' · ' + (nolar.length ? Math.min(...nolar) + '–' + Math.max(...nolar) + ' (' + nolar.length + ' ölçü)' : 'ölçü yok');
            satir.append(kutu, ad, bilgi); liste.appendChild(satir);
        });
        uyar();
    }
    function uyar() {
        updateActiveSystemText();
        const ad = document.getElementById('activeSystemText');
        const disi = orSatirlar(seciliCizimler(), orStandartTolerans).filter(v => v.standartDisi).length;
        $('orStandart').textContent = 'Tolerans kontrolü: ' + (ad ? ad.textContent : 'seçili standart') + (disi ? ' — ' + disi + ' ölçünün toleransı farklı, raporda kırmızı yanacak' : ' — hepsi uygun');
        const c = orCakisanNumaralar(seciliCizimler());
        $('orUyari').textContent = c.length ? 'Seçili çizimlerde aynı balon numarası var: ' + c.slice(0, 10).join(', ') + (c.length > 10 ? '…' : '') + '. Sonraki çizimin Başlangıç numarasını değiştirip kaydedin.' : '';
    }

    $('orVazgec').onclick = () => m.remove();
    $('orSablonDosya').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
            const buf = await f.arrayBuffer();
            await orDoldur(JSZip, buf, []);      // şablon uygun mu: hata varsa kaydetmeden söyler
            localStorage.setItem(OR_SABLON_KEY, JSON.stringify({ ad: f.name, veri: orBase64(buf) }));
            ciz();
        } catch (err) { alert('Şablon kullanılamadı: ' + err.message); }
    };
    $('orJson').onchange = async e => {
        for (const f of e.target.files) {
            try {
                const d = JSON.parse(await f.text());
                if (!Array.isArray(d.annotations)) throw new Error('balon kaydı yok');
                const dosyaAdi = f.name.replace(/\.[^.]+$/, '');
                cizimler.push({ ad: d.cizimAdi || (/^(teknik-resim-yedek|drawing-backup)-/.test(dosyaAdi) ? '' : dosyaAdi), secili: true, kaynak: f.name.length > 24 ? f.name.slice(0, 22) + '…' : f.name,
                    olculer: d.annotations.map(a => ({ number: a.number || a.id, dimension: a.dimension, lowerTolerance: a.lowerTolerance, upperTolerance: a.upperTolerance })) });
            } catch (err) { alert(f.name + ' okunamadı: ' + err.message); }
        }
        e.target.value = ''; ciz();
    };
    $('orOlustur').onclick = async () => {
        const s = orSablonOku();
        if (!s) { alert('Önce Excel şablonunu seçin.'); return; }
        const secili = seciliCizimler();
        if (!secili.some(c => c.olculer.length)) { alert('Seçili çizimde ölçü yok.'); return; }
        try {
            const cikti = await orDoldur(JSZip, orBaytlar(s.veri), secili, orStandartTolerans);
            const url = URL.createObjectURL(new Blob([cikti], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const a = document.createElement('a'); a.href = url;
            a.download = s.ad.replace(/\.xlsx$/i, '') + ' - olcum ' + new Date().toISOString().slice(0, 10) + '.xlsx';
            a.click(); URL.revokeObjectURL(url);
            m.remove();
            showNotification('📋 Ölçüm raporu indirildi', 'success');
        } catch (err) { console.error(err); alert('Rapor oluşturulamadı: ' + err.message); }
    };
    ciz();
}

document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('olcumRaporuBtn');
    if (b) b.addEventListener('click', orPencereAc);
});
