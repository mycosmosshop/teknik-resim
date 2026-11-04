// Ölçüm raporu (F.063 / VDA ilk numune): balonlu ölçüler kullanıcının Excel şablonunun İKİNCİ sekmesine yazılır.
// Şablonda imza ve kişi bilgisi var, depo herkese açık: şablon koda/depoya girmez, kullanıcı seçer, yalnız tarayıcısında durur.
// Tarayıcıda biçimi koruyarak yalnız .xlsx yazılabilir (JSZip ile XML'e değer yazılır; biçim, kapak, görsel, formül aynen kalır).
const OR_SABLON_KEY = 'teknikresim_olcum_sablon';

function orKolon(c) { let n = 0; for (const h of c) n = n * 26 + h.charCodeAt(0) - 64; return n; }
function orXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// openpyxl Ø'yi &#216; yazar: okurken çözülmezse nominal 216 sanılır
function orXmlCoz(s) { return s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function orSayi(x) { const t = String(x == null ? '' : x).trim().replace(',', '.'); return t === '' ? NaN : parseFloat(t); }

// "285"→285 (sayı), "Ø27.5"→"Ø27,5", "40 ±0.1"→40 (tolerans kendi sütununda)
function orNominal(d) {
    const s = String(d == null ? '' : d).split('±')[0].trim();
    if (/^\d+(?:[.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
    return s.replace(/(\d)\.(\d)/g, '$1,$2');
}
// -1.2 / +1.2 → "± 1,2 mm"; +0.5 / -0.2 → "+0,5 / -0,2 mm"
function orTolerans(alt, ust) {
    const yaz = v => String(Math.abs(v)).replace('.', ',');
    const a = orSayi(alt), u = orSayi(ust);
    if (isNaN(a) && isNaN(u)) return '';
    if (a === -u && u !== 0) return '± ' + yaz(u) + ' mm';
    const isaretli = v => (v > 0 ? '+' : v < 0 ? '-' : '') + yaz(v);
    return [u, a].filter(v => !isNaN(v)).map(isaretli).join(' / ') + ' mm';
}
// Ölçü sınırları: nominal + alt/üst tolerans (tolerans yoksa o sınır yok). Ondalık gürültüsü atılır (285-1.2 = 283.8)
function orSinirlar(boyut, alt, ust) {
    const n = nominalDeger(boyut), kes = v => parseFloat(v.toFixed(6));
    if (isNaN(n)) return {};
    return { alt: isNaN(orSayi(alt)) ? null : kes(n + orSayi(alt)), ust: isNaN(orSayi(ust)) ? null : kes(n + orSayi(ust)) };
}
// Ölçünün toleransı ile sınıf değeri (b: {alt, ust}) karşılaştırması
function orToleransKiyas(o, b) {
    const a = orSayi(o.lowerTolerance), u = orSayi(o.upperTolerance), ba = orSayi((b || {}).alt), bu = orSayi((b || {}).ust);
    const farkli = (x, y) => (isNaN(x) !== isNaN(y)) || (!isNaN(x) && Math.abs(x - y) > 1e-9);
    return { kendisiBos: isNaN(a) && isNaN(u), sinifBos: isNaN(ba) && isNaN(bu), esit: !farkli(a, ba) && !farkli(u, bu) };
}
// Sınıf verildiyse: otomatik gelen tolerans sınıfın değeriyle yazılır. Elle girilen (ya da hiçbir sınıfa uymayan eski kayıt)
//   korunur; sınıftan farklıysa kırmızı. standart: {tolerans(boyut) → {alt, ust}, sinifDegeriMi(o)}
function orToleransKarari(o, standart) {
    const kendi = { alt: o.lowerTolerance, ust: o.upperTolerance, disi: false, sinif: '' };
    if (!standart) return kendi;
    const b = standart.tolerans(o.dimension) || {}, k = orToleransKiyas(o, b), sinif = orTolerans(b.alt, b.ust);
    const elle = o.tolElle || (!k.kendisiBos && !standart.sinifDegeriMi(o));
    if (!elle) return { alt: b.alt, ust: b.ust, disi: false, sinif };
    return { ...kendi, disi: !k.kendisiBos && !k.sinifBos && !k.esit, sinif };
}
// Seçilen çizimler → tablo satırları: Ref numarasına göre, çizim no grubun ilk satırında
function orSatirlar(cizimler, standart) {
    const enKucuk = c => Math.min(...c.olculer.map(o => Number(o.number)));
    const satirlar = [];
    cizimler.filter(c => c.olculer.length).sort((x, y) => enKucuk(x) - enKucuk(y)).forEach(c => {
        [...c.olculer].sort((x, y) => Number(x.number) - Number(y.number)).forEach((o, i) => {
            const t = orToleransKarari(o, standart), b = standart ? standart.tolerans(o.dimension) || {} : {};
            satirlar.push({ ref: Number(o.number), cizim: i === 0 ? (c.ad || '') : '', nominal: orNominal(o.dimension), tolerans: orTolerans(t.alt, t.ust),
                sinir: orSinirlar(o.dimension, t.alt, t.ust), sinifSinir: orSinirlar(o.dimension, b.alt, b.ust), standartDisi: t.disi, sinifToleransi: t.sinif });
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
// Kırmızı işaret koşullu biçimle, tablonun TÜM satırlarına (boşlar dâhil): kurallar E ve F'yi Excel'de canlı okur;
// yeni satıra ölçü girince, nominal ya da tolerans değişince, ölçüm girince anında yanar/söner.
function orSade(h) { return 'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(LOWER(' + h + '&"")," ",""),"mm",""),".",",")'; }
function orSadeMetin(t) { return t.replace(/ /g, '').replace('mm', ''); }
// Canlı kuralın okuyabildiği nominal: 285, Ø27,5, R5. Okuyamadığına ("3x Ø6") rapor anındaki değerle sabit kural yazılır.
function orCanliOkunur(nominal) { return nominal !== '' && /^[ØøRM ]*\d+(?:,\d+)?$/.test(String(nominal).replace('.', ',')); }
function orOlcumKurali(ilk, olcum = 'L' + ilk) {
    const e = '$E' + ilk, f = '$F' + ilk, t = orSade(f), n = orOlcumSayisi(e), v = orOlcumSayisi(olcum);
    const sayi = m => '_xlfn.NUMBERVALUE(' + m + ',",",".")';
    // "±1,2" → +1,2 ve -1,2; "+0,5/-0,2" → iki değer; tek taraf "+0,5" → +0,5 ve 0
    const a = sayi('SUBSTITUTE(IFERROR(LEFT(' + t + ',FIND("/",' + t + ')-1),' + t + '),"±","")');
    const b = 'IF(LEFT(' + t + ',1)="±",-' + a + ',' + sayi('IFERROR(MID(' + t + ',FIND("/",' + t + ')+1,20),"0")') + ')';
    return 'IFERROR(AND(' + olcum + '<>"",' + e + '<>"",' + f + '<>"",OR(ROUND(' + v + '-(' + n + '+MAX(' + a + ',' + b + ')),6)>0,ROUND(' + v + '-(' + n + '+MIN(' + a + ',' + b + ')),6)<0)),FALSE)';
}
// Seçilen sınıfın tablosu formüle gömülür: yeni satırda nominale göre beklenen tolerans bulunur (Ra, 0,5 altı: kontrol yok)
function orToleransKurali(ilk, araliklar) {
    const f = 'F' + ilk, e = '$E' + ilk, n = orOlcumSayisi(e);
    const sirali = [...araliklar].sort((a, b) => a.bas - b.bas), t = orSade(f);
    // Bitişik aralıkta alt sınır yazılmaz: Excel kural sınırı 8192 karakter, nominal formülü uzun
    const farkli = sirali.reduceRight((d, r, i) => {
        const altGerek = i ? sirali[i - 1].son !== r.bas : r.bas > 0.5;
        const sonuc = t + '<>"' + orSadeMetin(r.metin) + '"';
        return 'IF(' + n + '<' + r.son + ',' + (altGerek ? 'IF(' + n + '>=' + r.bas + ',' + sonuc + ',FALSE)' : sonuc) + ',' + d + ')';
    }, 'FALSE');
    return 'IFERROR(AND(' + f + '<>"",' + e + '<>"",' + n + '>=0.5,' + farkli + '),FALSE)';
}
function orKuralYazici(dxf) {
    let sira = 1;
    return (ref, formul) => '<conditionalFormatting sqref="' + ref + '"><cfRule type="expression" dxfId="' + dxf + '" priority="' + (sira++) + '"><formula>' + orXml(formul) + '</formula></cfRule></conditionalFormatting>';
}
function orKosullar(veri, ilk, son, dxf, standart) {
    const kural = orKuralYazici(dxf);
    let x = kural('L' + ilk + ':N' + son, orOlcumKurali(ilk));
    // Excel'de normal yapıştırma hedef hücrenin kuralını siler (makrosuz engellenemez, sayfa koruması da kurtarmıyor).
    // Yapıştırılmayan "uygun değil" sütunu da yanar: ölçüm hücresinin kırmızısı silinse de satırdaki uyarı kalır.
    const uygunDegil = 'OR(' + ['$L', '$M', '$N'].map(k => orOlcumKurali(ilk, k + ilk)).join(',') + ')';
    if (uygunDegil.length < 8000) x += kural('R' + ilk + ':T' + son, uygunDegil);
    if (standart && standart.araliklar && standart.araliklar.length) {
        const f = orToleransKurali(ilk, standart.araliklar);
        if (f.length < 8000) x += kural('F' + ilk + ':F' + son, f);   // sınır aşılırsa Excel dosyayı onarır: canlı tolerans kuralı yazılmaz
    }
    veri.forEach((v, i) => {
        if (orCanliOkunur(v.nominal)) return;
        const r = ilk + i, sinir = v.sinir || {};
        const sabit = h => { const kos = [], sayi = orOlcumSayisi(h);
            if (sinir.alt != null) kos.push(sayi + '<' + sinir.alt);
            if (sinir.ust != null) kos.push(sayi + '>' + sinir.ust);
            return kos.length ? 'IFERROR(AND(' + h + '<>"",OR(' + kos.join(',') + ')),FALSE)' : ''; };
        if (sabit('L' + r)) {
            x += kural('L' + r + ':N' + r, sabit('L' + r));
            x += kural('R' + r + ':T' + r, 'OR(' + ['$L', '$M', '$N'].map(k => sabit(k + r)).join(',') + ')');
        }
        if (v.sinifToleransi) x += kural('F' + r, 'AND(F' + r + '<>"",' + orSade('F' + r) + '<>"' + orSadeMetin(v.sinifToleransi) + '")');
    });
    return x;
}

// ── Ortak: şablon açma, hücre yazma, satır kaydırma, kırmızı biçim, dosyayı kapatma (ölçüm raporu ve kontrol planı) ──
const SATIR = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, HUCRE = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
function satirNo(r) { return parseInt(/\br="(\d+)"/.exec(r)[1]); }
function satirTasi(r, yeni) { return r.replace(/(<row\b[^>]*?\br=")\d+"/, '$1' + yeni + '"').replace(/(<c\b[^>]*?\br="[A-Z]+)\d+"/g, '$1' + yeni + '"'); }
function orHucre(ref, s, deger) {
    const st = s ? ' s="' + s + '"' : '';
    if (deger === '' || deger == null) return '<c r="' + ref + '"' + st + '/>';
    if (typeof deger === 'number') return '<c r="' + ref + '"' + st + '><v>' + deger + '</v></c>';
    return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + orXml(deger) + '</t></is></c>';
}
// Hücre metni: ortak metin (Excel kaydı) ya da satır içi metin (openpyxl kaydı) ya da sayı
function orHucreMetni(r, k, ortak) {
    const c = (r.match(HUCRE) || []).find(h => new RegExp('\\br="' + k + '\\d+"').test(h));
    if (!c) return '';
    const v = /<v>([^<]*)<\/v>/.exec(c), t = /<t\b[^>]*>([^<]*)<\/t>/.exec(c);
    return orXmlCoz(/\bt="s"/.test(c) ? (v ? ortak[+v[1]] || '' : '') : t ? t[1] : v ? v[1] : '');
}
async function orSablonAc(JSZipSinif, sablon) {
    const zip = await JSZipSinif.loadAsync(sablon);
    const oku = p => { const f = zip.file(p); if (!f) throw new Error('Şablonda eksik parça: ' + p); return f.async('string'); };
    const wb = await oku('xl/workbook.xml'), wbRels = await oku('xl/_rels/workbook.xml.rels');
    const sekmeler = [...wb.matchAll(/<sheet\b[^>]*?r:id="([^"]+)"/g)].map(m => m[1]);
    const yol = i => 'xl/' + new RegExp('<Relationship\\b[^>]*\\bId="' + sekmeler[i] + '"[^>]*>').exec(wbRels)[0].match(/Target="([^"]+)"/)[1].replace(/^\/?xl\//, '');
    const ortak = zip.file('xl/sharedStrings.xml') ? [...(await oku('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)]
        .map(m => [...m[1].matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map(t => t[1]).join('')) : [];
    return { zip, oku, wb, wbRels, sekmeler, yol, ortak };
}
// Satır numarası değişince başvurular: birleşik, bağlantı, boyut, seçim, koşullu biçim, baskı alanı, görseller (imza)
// ponytail: aynı sekme içi formül başvuruları kaydırılmaz; F.063'te alt bölümde yalnız kapak! başvurusu var, planda formül yok.
async function orKaydir(zip, oku, xml, wb, sekmeYol, sekmeNo, kaydir) {
    const ref = s => s.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (m, k, n) => k + kaydir(parseInt(n)));
    xml = xml.replace(/<(mergeCell|hyperlink|dimension)\b[^>]*?\bref="[^"]+"/g, m => m.replace(/ref="([^"]+)"/, (a, v) => 'ref="' + ref(v) + '"'));
    xml = xml.replace(/\b(sqref|activeCell)="([^"]+)"/g, (m, a, v) => a + '="' + ref(v) + '"');
    wb = wb.replace(new RegExp('(<definedName\\b[^>]*localSheetId="' + sekmeNo + '"[^>]*>)([^<]*)(</definedName>)', 'g'), (m, a, v, z) => a + v.replace(/\$([A-Z]+)\$(\d+)/g, (x, k, n) => '$' + k + '$' + kaydir(parseInt(n))) + z);
    const relYol = sekmeYol.replace(/([^/]+)$/, '_rels/$1.rels');
    if (zip.file(relYol)) {
        const rels = await oku(relYol);
        for (const m of rels.matchAll(/Target="([^"]*drawings\/[^"]+\.xml)"/g)) {
            const p = 'xl/' + m[1].replace(/^(\.\.\/|\/xl\/)/, '');
            zip.file(p, (await oku(p)).replace(/<xdr:row>(\d+)<\/xdr:row>/g, (a, n) => '<xdr:row>' + (kaydir(parseInt(n) + 1) - 1) + '</xdr:row>'));
        }
    }
    return { xml, wb };
}
// Biçim dosyasına kırmızı eklenir, numarası döner
async function orKirmiziEkle(zip, oku) {
    const stil = await oku('xl/styles.xml');
    const dxfSayi = /<dxfs\b[^>]*count="(\d+)"/.exec(stil), dxf = dxfSayi ? +dxfSayi[1] : 0;
    const kirmizi = '<dxf><font><b/><color rgb="FFFFFFFF"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/><bgColor rgb="FFFF0000"/></patternFill></fill></dxf>';
    zip.file('xl/styles.xml', /<dxfs\b[^>]*\/>/.test(stil) ? stil.replace(/<dxfs\b[^>]*\/>/, '<dxfs count="1">' + kirmizi + '</dxfs>')
        : /<dxfs\b/.test(stil) ? stil.replace(/<dxfs\b[^>]*>/, '<dxfs count="' + (dxf + 1) + '">').replace('</dxfs>', kirmizi + '</dxfs>')
        : stil.replace('</cellStyles>', '</cellStyles><dxfs count="1">' + kirmizi + '</dxfs>'));
    return dxf;
}
// Koşullu biçim şema sırasında yerine konur
function orKosulEkle(xml, kosullar) {
    const yer = /<(dataValidations|hyperlinks|printOptions|pageMargins)\b/.exec(xml);
    if (!kosullar) return xml;
    return yer ? xml.slice(0, yer.index) + kosullar + xml.slice(yer.index) : xml.replace('</worksheet>', kosullar + '</worksheet>');
}
// Formül sırası dosyası satır kayınca bozuk sayılır: silinir, Excel kendisi kurar; bağlantılar açılışta hesaplanır
async function orBitir(zip, oku, wb, wbRels) {
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

async function orDoldur(JSZipSinif, sablon, cizimler, standart) {
    const a = await orSablonAc(JSZipSinif, sablon), { zip, oku, wbRels, sekmeler, ortak } = a;
    let wb = a.wb;
    if (sekmeler.length < 2) throw new Error('Şablonda ikinci sekme yok.');
    const sekmeYol = a.yol(1);
    let xml = await oku(sekmeYol);
    const bMetni = r => orHucreMetni(r, 'B', ortak);

    const satirlar = xml.match(SATIR) || [];
    const baslik = satirlar.find(r => /^Nr\.?\s*$/.test(bMetni(r)));
    const ilk = baslik ? satirNo(baslik) + 1 : 0;
    const altBolum = satirlar.find(r => satirNo(r) >= ilk && /onay/i.test(bMetni(r)));
    if (!baslik || !altBolum) throw new Error('İkinci sekmede ölçü tablosu bulunamadı ("Nr." başlığı / "Onay" alt bölümü).');
    const son = satirNo(altBolum) - 1;                 // tablonun son satırı (alt çerçeveli)

    const veri = orSatirlar(cizimler, standart);
    const ek = Math.max(0, veri.length - (son - ilk + 1));

    // Sığmazsa: son satırın üstüne orta satırın biçimiyle satır açılır, altındaki her şey aşağı kayar.
    if (ek) {
        const orta = satirlar.find(r => satirNo(r) === son - 1);
        const yeniler = Array.from({ length: ek }, (_, i) => satirTasi(orta, son + i)).join('');
        let eklendi = false;
        xml = xml.replace(SATIR, r => { const n = satirNo(r); if (n < son) return r;
            const t = satirTasi(r, n + ek); if (eklendi) return t; eklendi = true; return yeniler + t; });
        ({ xml, wb } = await orKaydir(zip, oku, xml, wb, sekmeYol, 1, n => (n >= son ? n + ek : n)));
    }

    // Tablo satırları: eski değerler silinir (biçim kalır), yenileri yazılır. Ölçümler (L, M, N) ve uygun/uygun değil boş kalır.
    xml = xml.replace(SATIR, r => {
        const n = satirNo(r);
        if (n < ilk || n > son + ek) return r;
        const v = veri[n - ilk] || {}, yaz = { B: v.ref, D: v.cizim, E: v.nominal, F: v.tolerans };
        const acilis = /<row\b[^>]*?\/?>/.exec(r)[0].replace(/\/>$/, '>');
        const mevcut = {};
        (r.match(HUCRE) || []).forEach(c => { const k = /\br="([A-Z]+)\d+"/.exec(c)[1], s = /\bs="(\d+)"/.exec(c); mevcut[k] = s ? s[1] : ''; });
        Object.keys(yaz).forEach(k => { if (!(k in mevcut)) mevcut[k] = ''; });
        const govde = Object.keys(mevcut).sort((a, b) => orKolon(a) - orKolon(b)).map(k => orHucre(k + n, mevcut[k], yaz[k])).join('');
        return acilis + govde + '</row>';
    });
    // Ölçüm sütunu başlıkları (üç ölçüm: L, M, N)
    [['L', '1. Ölçüm'], ['M', '2. Ölçüm'], ['N', '3. Ölçüm']].forEach(([k, b]) => {
        xml = xml.replace(new RegExp('<c r="' + k + (ilk - 1) + '"( s="\\d+")?/>'), (m, st) => orHucre(k + (ilk - 1), st ? /\d+/.exec(st)[0] : '', b));
    });
    // Koşullu biçim: önceki rapordan kalan tablo kuralları silinir (rapor şablon olarak seçilmiş olabilir), yenileri eklenir
    xml = xml.replace(/<conditionalFormatting\b[^>]*\bsqref="([A-Z]+)(\d+)[^"]*"[^>]*>[\s\S]*?<\/conditionalFormatting>/g, (m, k, r) => (+r >= ilk && +r <= son + ek ? '' : m));
    const dxf = await orKirmiziEkle(zip, oku);
    zip.file(sekmeYol, orKosulEkle(xml, orKosullar(veri, ilk, son + ek, dxf, standart)));
    return orBitir(zip, oku, wb, wbRels);
}

// ── Kontrol planı (PL 41): "Dimension N" satırları balonlardan yeniden yazılır; malzeme, etiket, paketleme satırları aynen kalır ──
// Numune, sıklık, ekipman, yöntem, özel karakteristik balonda yok: aynı nominalli plan satırından, yoksa en yakın nominalli satırdan alınır.
const OR_PLAN_OLCU = /^\s*(dimension|ölçü|boyut)\s*\d+\s*$/i;
// Örnek satır: aynı nominal (SC/CC dâhil) ya da özel karakteristiği olmayan en yakın nominal (başka ölçüye SC bulaşmasın)
function orPlanOrnek(satirlar, nominal) {
    const yazi = String(nominal).replace('.', ','), sayi = nominalDeger(yazi);
    const ayni = satirlar.find(x => x.metin === yazi) || satirlar.find(x => x.sayi === sayi);
    if (ayni) return ayni;
    const duz = satirlar.filter(x => x.ozel === '-' || x.ozel === ''), liste = duz.length ? duz : satirlar;
    const fark = x => (isNaN(x.sayi) || isNaN(sayi) ? Infinity : Math.abs(x.sayi - sayi));
    return liste.reduce((en, x) => (fark(x) < fark(en) ? x : en), liste[0]);
}
// Satırdaki verilen hücreler yazılır (biçim kalır), diğerleri olduğu gibi durur
function orSatirYaz(r, n, yaz) {
    const eski = {};
    (r.match(HUCRE) || []).forEach(c => { eski[/\br="([A-Z]+)\d+"/.exec(c)[1]] = c; });
    Object.keys(yaz).forEach(k => { const st = eski[k] && /\bs="(\d+)"/.exec(eski[k]); eski[k] = orHucre(k + n, st ? st[1] : '', yaz[k]); });
    return /<row\b[^>]*?\/?>/.exec(r)[0].replace(/\/>$/, '>') + Object.keys(eski).sort((a, b) => orKolon(a) - orKolon(b)).map(k => eski[k]).join('') + '</row>';
}
// Sınır hücresi seçilen sınıfın değerinden farklıysa kırmızı: G'deki nominal ve sınıf tablosu Excel'de canlı okunur
function orSinirKurali(h, e, araliklar, alan) {
    const n = orOlcumSayisi(e), sirali = [...araliklar].sort((a, b) => a.bas - b.bas);
    const tol = sirali.reduceRight((d, r, i) => {
        const v = isNaN(r[alan]) ? 'NA()' : r[alan], altGerek = i ? sirali[i - 1].son !== r.bas : r.bas > 0.5;
        return 'IF(' + n + '<' + r.son + ',' + (altGerek ? 'IF(' + n + '>=' + r.bas + ',' + v + ',NA())' : v) + ',' + d + ')';
    }, 'NA()');
    return 'IFERROR(AND(' + h + '<>"",' + h + '<>"-",' + e + '<>"",' + n + '>=0.5,ABS(' + h + '-(' + n + '+(' + tol + ')))>0.000001),FALSE)';
}
function orPlanKosullar(veri, ilk, dxf, standart) {
    if (!veri.length || !standart) return '';
    const kural = orKuralYazici(dxf), son = ilk + veri.length - 1, sutun = [['I', 'alt'], ['J', 'ust']];
    let x = '';
    if (standart.araliklar && standart.araliklar.length) sutun.forEach(([k, alan]) => { x += kural(k + ilk + ':' + k + son, orSinirKurali(k + ilk, '$G' + ilk, standart.araliklar, alan)); });
    veri.forEach((v, i) => {
        if (orCanliOkunur(v.nominal)) return;
        const r = ilk + i;                 // "3x Ø6": canlı okunmaz, rapor anındaki sınıf sınırıyla sabit kural
        sutun.forEach(([k, alan]) => { const b = (v.sinifSinir || {})[alan]; if (b != null) x += kural(k + r, 'IFERROR(AND(' + k + r + '<>"",' + k + r + '<>"-",ABS(' + k + r + '-' + b + ')>0.000001),FALSE)'); });
    });
    return x;
}
async function orPlanDoldur(JSZipSinif, sablon, cizimler, standart) {
    const a = await orSablonAc(JSZipSinif, sablon), { zip, oku, wbRels, sekmeler, ortak } = a;
    let sekme = -1, xml = '', olcu = [];
    for (let i = 0; i < sekmeler.length && !olcu.length; i++) {
        sekme = i; xml = await oku(a.yol(i));
        olcu = (xml.match(SATIR) || []).filter(r => OR_PLAN_OLCU.test(orHucreMetni(r, 'F', ortak)));
    }
    if (!olcu.length) throw new Error('Kontrol planında ölçü satırı bulunamadı (F sütununda "Dimension 1" gibi).');
    const ornekler = olcu.map(r => { const metin = orHucreMetni(r, 'G', ortak); return { r, no: satirNo(r), metin, sayi: nominalDeger(metin), ozel: orHucreMetni(r, 'O', ortak) }; });
    const nolar = ornekler.map(o => o.no), ilk = nolar[0], veri = orSatirlar(cizimler, standart);
    const kelime = /\S+/.exec(orHucreMetni(olcu[0], 'F', ortak))[0], aIlk = orHucreMetni(olcu[0], 'A', ortak);
    let sira = /^\d+$/.test(aIlk) ? +aIlk : null;
    // Eski satır → yeni satır: ölçü bloğu ilk satırda toplanır, sonrası blok kadar kayar (satır sayısı artar da azalır da)
    const yeni = n => { const i = nolar.indexOf(n);
        if (i >= 0) return ilk + Math.min(i, Math.max(veri.length - 1, 0));
        return n - nolar.filter(x => x < n).length + (n > ilk ? veri.length : 0); };

    // Önceki rapordan kalan kurallar ve ölçü satırındaki birleşikler satırlarla gider
    xml = xml.replace(/<conditionalFormatting\b[^>]*\bsqref="[A-Z]+(\d+)[^"]*"[^>]*>[\s\S]*?<\/conditionalFormatting>/g, (m, r) => (nolar.includes(+r) ? '' : m));
    xml = xml.replace(/<mergeCell ref="[A-Z]+(\d+):[^"]*"\/>/g, (m, r) => (nolar.includes(+r) ? '' : m));
    xml = xml.replace(/<mergeCells\b[^>]*>/, () => '<mergeCells count="' + (xml.match(/<mergeCell /g) || []).length + '">');
    let wb;
    ({ xml, wb } = await orKaydir(zip, oku, xml, a.wb, a.yol(sekme), sekme, yeni));

    xml = xml.replace(SATIR, r => {
        const n = satirNo(r);
        if (n === ilk) return veri.map((v, i) => {
            const y = ilk + i, sinir = v.sinir || {}, olcuMetni = String(v.nominal), adim = /^\s*R[az]\s*\d/i.test(olcuMetni) ? 'µm' : /°/.test(olcuMetni) ? '°' : 'mm';
            const yaz = { F: kelime + ' ' + v.ref, G: olcuMetni.replace('.', ','), H: adim, I: sinir.alt != null ? sinir.alt : '-', J: sinir.ust != null ? sinir.ust : '-' };
            if (adim !== 'mm') { yaz.P = '-'; yaz.Q = '-'; }     // Ra, açı: ölçü aleti mm satırından tahmin edilmez
            if (sira !== null) yaz.A = sira++;
            return orSatirYaz(satirTasi(orPlanOrnek(ornekler, v.nominal).r, y), y, yaz);
        }).join('');
        if (nolar.includes(n)) return '';
        const t = satirTasi(r, yeni(n));
        return n > ilk && sira !== null && /^\d+$/.test(orHucreMetni(r, 'A', ortak)) ? orSatirYaz(t, yeni(n), { A: sira++ }) : t;
    });
    const dxf = await orKirmiziEkle(zip, oku);
    zip.file(a.yol(sekme), orKosulEkle(xml, orPlanKosullar(veri, ilk, dxf, standart)));
    return orBitir(zip, oku, wb, wbRels);
}

// ── Arayüz ──
const OR_TURLER = {
    olcum: { ad: 'Ölçüm raporu', anahtar: OR_SABLON_KEY, doldur: orDoldur, ek: 'olcum' },
    plan: { ad: 'Kontrol planı', anahtar: 'teknikresim_kontrol_sablon', doldur: orPlanDoldur, ek: 'kontrol plani' }
};
function orSablonOku(tur = 'olcum') {
    try { return JSON.parse(localStorage.getItem(OR_TURLER[tur].anahtar)); } catch (e) { return null; }
}
function orBase64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function orBaytlar(b64) { const s = atob(b64), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

const OR_SINIFLAR = [['fine', 'f (ince)'], ['medium', 'm (orta)'], ['coarse', 'c (kaba)'], ['veryCoarse', 'v (çok kaba)'], ['manual', 'Manuel (tablodaki)']];
// Verilen sınıfın bu ölçü için toleransı; ölçü metninde yazılı tolerans ("40 ±0.1") sınıftan önce gelir
function orSinifTolerans(boyut, sinif) {
    const yazili = yaziliTolerans(boyut);
    if (yazili) return { alt: '-' + yazili, ust: '+' + yazili };
    const b = { dimension: boyut };
    tabloToleransUygula(b, sinif);
    return { alt: b.lowerTolerance, ust: b.upperTolerance };
}
function orStandart(sinif) {
    const esit = (o, s) => { const k = orToleransKiyas(o, orSinifTolerans(o.dimension, s)); return k.esit && !k.sinifBos; };
    const araliklar = toleranceRanges.map(r => {
        const t = orSinifTolerans(String((r.start + r.end) / 2), sinif);
        return { bas: r.start, son: r.end, metin: orTolerans(t.alt, t.ust), alt: orSayi(t.alt), ust: orSayi(t.ust) };
    }).filter(r => r.metin);
    return { tolerans: boyut => orSinifTolerans(boyut, sinif), sinifDegeriMi: o => OR_SINIFLAR.some(([s]) => esit(o, s)), esit, araliklar };
}
// Pencere açılınca: ölçülerin en çok uyduğu sınıf önerilir (kullanıcı değiştirir). Yanlış varsayılan bütün toleransları değiştirirdi.
function orEnUygunSinif(cizimler) {
    const st = orStandart(activeToleranceClass), olculer = cizimler.flatMap(c => c.olculer);
    const say = s => olculer.filter(o => st.esit(o, s)).length;
    let en = activeToleranceClass, enSay = say(en);
    OR_SINIFLAR.forEach(([s]) => { const n = say(s); if (n > enSay) { en = s; enSay = n; } });
    return en;
}

function orPencereAc() {
    const eski = document.getElementById('olcumRaporuModal'); if (eski) eski.remove();
    const cizimler = [];
    if (annotations.length) cizimler.push({ ad: window.__cizimAdi || '', olculer: annotations, secili: true, kaynak: 'Açık çizim' });

    const m = document.createElement('div');
    m.id = 'olcumRaporuModal'; m.className = 'modal show';
    m.innerHTML = `<div class="modal-content" style="max-width:620px">
        <h3>📋 Rapor <small style="font-size:11px;font-weight:normal;opacity:.7">${orSurum()}</small></h3>
        <div class="modal-body">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
                <span style="font-weight:bold">Rapor türü</span>
                <select id="orTur" style="padding:4px;width:auto">${Object.keys(OR_TURLER).map(k => '<option value="' + k + '">' + OR_TURLER[k].ad + '</option>').join('')}</select>
            </div>
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
            <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
                <span style="font-weight:bold">Tolerans sınıfı</span>
                <select id="orSinif" style="padding:4px;width:auto">${OR_SINIFLAR.map(([k, ad]) => '<option value="' + k + '">' + ad + '</option>').join('')}</select>
            </div>
            <div id="orStandart" style="margin-top:6px;font-size:12px"></div>
            <div id="orUyari" style="color:#c0392b;font-weight:bold;margin-top:6px"></div>
        </div>
        <div class="modal-buttons">
            <button id="orOlustur" class="btn btn-success">Raporu oluştur</button>
            <button id="orVazgec" class="btn btn-secondary">Vazgeç</button>
        </div></div>`;
    document.body.appendChild(m);
    const $ = id => document.getElementById(id);

    const seciliCizimler = () => cizimler.filter(c => c.secili);
    const tur = () => $('orTur').value;
    $('orTur').onchange = () => ciz();
    let sinifSecildi = false;
    $('orSinif').onchange = () => { sinifSecildi = true; uyar(); };
    function ciz() {
        const s = orSablonOku(tur());
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
        if (!sinifSecildi) $('orSinif').value = orEnUygunSinif(seciliCizimler());
        const satirlar = orSatirlar(seciliCizimler(), orStandart($('orSinif').value)), disi = satirlar.filter(v => v.standartDisi).length;
        $('orStandart').textContent = 'Toleranslar bu sınıfa göre yazılır (' + satirlar.length + ' ölçü). ' + (disi ? disi + ' ölçüde sonradan girilen farklı tolerans var, raporda kırmızı yanar.' : 'Farklı tolerans yok.') +
            (tur() === 'plan' ? ' Yalnız "Dimension" satırları değişir, diğer satırlar aynen kalır. Numune, sıklık, yöntem aynı ya da en yakın nominalli satırdan gelir; SC/CC yalnız aynı nominalde gelir, kontrol edin.' : '');
        const c = orCakisanNumaralar(seciliCizimler());
        $('orUyari').textContent = c.length ? 'Seçili çizimlerde aynı balon numarası var: ' + c.slice(0, 10).join(', ') + (c.length > 10 ? '…' : '') + '. Sonraki çizimin Başlangıç numarasını değiştirip kaydedin.' : '';
    }

    $('orVazgec').onclick = () => m.remove();
    $('orSablonDosya').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
            const buf = await f.arrayBuffer();
            await OR_TURLER[tur()].doldur(JSZip, buf, []);      // şablon uygun mu: hata varsa kaydetmeden söyler
            localStorage.setItem(OR_TURLER[tur()].anahtar, JSON.stringify({ ad: f.name, veri: orBase64(buf) }));
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
                    olculer: d.annotations.map(a => ({ number: a.number || a.id, dimension: a.dimension, lowerTolerance: a.lowerTolerance, upperTolerance: a.upperTolerance, tolElle: a.tolElle })) });
            } catch (err) { alert(f.name + ' okunamadı: ' + err.message); }
        }
        e.target.value = ''; ciz();
    };
    $('orOlustur').onclick = async () => {
        const t = OR_TURLER[tur()], s = orSablonOku(tur());
        if (!s) { alert('Önce Excel şablonunu seçin.'); return; }
        const secili = seciliCizimler();
        if (!secili.some(c => c.olculer.length)) { alert('Seçili çizimde ölçü yok.'); return; }
        try {
            const cikti = await t.doldur(JSZip, orBaytlar(s.veri), secili, orStandart($('orSinif').value));
            const url = URL.createObjectURL(new Blob([cikti], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const a = document.createElement('a'); a.href = url;
            a.download = s.ad.replace(/\.xlsx$/i, '') + ' - ' + t.ek + ' ' + new Date().toISOString().slice(0, 10) + '.xlsx';
            a.click(); URL.revokeObjectURL(url);
            m.remove();
            showNotification('📋 ' + t.ad + ' indirildi', 'success');
        } catch (err) { console.error(err); alert('Rapor oluşturulamadı: ' + err.message); }
    };
    ciz();
}

// GitHub Pages sayfayı 10 dk önbellekte tutar, ERP çerçevesinde Ctrl+F5 de modüle her zaman işlemez (eski sürümle rapor üretildi).
// Açılışta yayındaki sürüme bakılır; farklıysa önbellek tazelenip sayfa BİR KEZ yenilenir. Balon çizilmeye başlandıysa yenilenmez.
function orSurum() {
    const b = document.querySelector('script[src*="olcum-raporu.js"]'), m = b && /[?&]v=([^&]+)/.exec(b.src);
    return m ? m[1] : '';
}
async function orSurumDenetle(calisan, getir, oturum, bosMu, yenile) {
    try {
        const m = /olcum-raporu\.js\?v=([^"'&\s]+)/.exec(await getir());
        if (!m || !calisan || m[1] === calisan || oturum.getItem('teknikresim_surum') === m[1] || !bosMu()) return false;
        oturum.setItem('teknikresim_surum', m[1]);
        yenile();
        return true;
    } catch (e) { return false; }      // çevrimdışı vb.: çalışan sürümle devam
}

document.addEventListener('DOMContentLoaded', () => {
    orSurumDenetle(orSurum(), () => fetch(location.href.split('#')[0], { cache: 'reload' }).then(r => r.text()), sessionStorage, () => !annotations.length, () => location.reload());
    const b = document.getElementById('olcumRaporuBtn');
    if (b) b.addEventListener('click', orPencereAc);
});
