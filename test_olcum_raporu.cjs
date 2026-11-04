// Ölçüm raporu (olcum-raporu.js): şablona yazma, satır uzatma, çok çizim. Şablon sentetik (gerçeği depoya girmez).
//   NODE_PATH=D:/Yazılım/gantt-chart/node_modules node test_olcum_raporu.cjs
const fs = require('fs'), assert = require('assert'), JSZip = require('jszip');
const appKod = fs.readFileSync(__dirname + '/app.js', 'utf8'), nd = appKod.indexOf('function nominalDeger(');
const F = new Function('document', 'localStorage', appKod.slice(nd, appKod.indexOf('\n}', nd) + 2) + '\n' + fs.readFileSync(__dirname + '/olcum-raporu.js', 'utf8') +
  '\nreturn {orDoldur, orSatirlar, orNominal, orTolerans, orCakisanNumaralar, orSinirlar, orToleransKarari, orToleransKiyas, orSurumDenetle};')({ addEventListener() { } }, {});

// Biçim dönüşümleri örnek rapordaki görünümle aynı
assert.strictEqual(F.orNominal('285'), 285); assert.strictEqual(F.orNominal('1033,2'), 1033.2); assert.strictEqual(F.orNominal('234.2'), 234.2);
assert.strictEqual(F.orNominal('Ø27.5'), 'Ø27,5'); assert.strictEqual(F.orNominal('R5'), 'R5'); assert.strictEqual(F.orNominal('40 ±0.1'), 40); assert.strictEqual(F.orNominal(''), '');
assert.strictEqual(F.orTolerans('-1.2', '+1.2'), '± 1,2 mm'); assert.strictEqual(F.orTolerans('-0,5', '0,5'), '± 0,5 mm'); assert.strictEqual(F.orTolerans('-2', '2'), '± 2 mm');
assert.strictEqual(F.orTolerans('-0.2', '+0.5'), '+0,5 / -0,2 mm'); assert.strictEqual(F.orTolerans('0', '0.5'), '+0,5 / 0 mm'); assert.strictEqual(F.orTolerans('', ''), '');

// Sınırlar ve standart kontrolü
assert.deepStrictEqual(F.orSinirlar('285', '-1.2', '+1.2'), { alt: 283.8, ust: 286.2 }); assert.deepStrictEqual(F.orSinirlar('Ø27,5', '-2', '2'), { alt: 25.5, ust: 29.5 });
assert.deepStrictEqual(F.orSinirlar('R5', '', ''), { alt: null, ust: null }); assert.deepStrictEqual(F.orSinirlar('yazı', '-1', '1'), {});
// c sınıfı (285 → ±1,2; Ra karşılıksız). Sınıf değeri olan eski kayıt = otomatik sayılır
const SINIFLAR = { '285': ['0.5', '1.2', '2.5'], '6': ['0.2', '0.5', '1'] };
const std = { tolerans: d => (SINIFLAR[d] ? { alt: '-' + SINIFLAR[d][1], ust: '+' + SINIFLAR[d][1] } : {}),
  sinifDegeriMi: o => (SINIFLAR[o.dimension] || []).some(v => F.orToleransKiyas(o, { alt: '-' + v, ust: '+' + v }).esit) };
const kr = o => F.orToleransKarari(o, std);
assert.deepStrictEqual(kr({ dimension: '285', lowerTolerance: '-0,5', upperTolerance: '+0,5' }), { alt: '-1.2', ust: '+1.2', disi: false, sinif: '± 1,2 mm' }, 'otomatik gelen m toleransı c olur, kırmızı değil');
assert.strictEqual(kr({ dimension: '285', lowerTolerance: '-1.2', upperTolerance: '+1.2' }).disi, false, 'zaten c');
assert.deepStrictEqual(kr({ dimension: '285' }), { alt: '-1.2', ust: '+1.2', disi: false, sinif: '± 1,2 mm' }, 'boş tolerans sınıftan gelir');
assert.deepStrictEqual(kr({ dimension: '285', lowerTolerance: '-0,5', upperTolerance: '+0,5', tolElle: true }), { alt: '-0,5', ust: '+0,5', disi: true, sinif: '± 1,2 mm' }, 'sonradan elle girilen korunur, kırmızı');
assert.strictEqual(kr({ dimension: '285', lowerTolerance: '-1.2', upperTolerance: '+1.2', tolElle: true }).disi, false, 'elle ama sınıfa uygun');
assert.deepStrictEqual(kr({ dimension: '285', lowerTolerance: '-7', upperTolerance: '+7' }), { alt: '-7', ust: '+7', disi: true, sinif: '± 1,2 mm' }, 'hiçbir sınıfa uymayan eski kayıt elle sayılır');
assert.deepStrictEqual(kr({ dimension: '285', tolElle: true }), { alt: undefined, ust: undefined, disi: false, sinif: '± 1,2 mm' }, 'kullanıcı boşalttıysa boş kalır');
assert.deepStrictEqual(kr({ dimension: 'Ra 3.2', lowerTolerance: '-1', upperTolerance: '+1', tolElle: true }), { alt: '-1', ust: '+1', disi: false, sinif: '' }, 'sınıf karşılığı yok: kırmızı değil');
assert.strictEqual(F.orToleransKarari({ dimension: '285', lowerTolerance: '-2', upperTolerance: '2' }).disi, false, 'standart verilmedi');
assert.deepStrictEqual(F.orSatirlar([{ ad: 'A', olculer: [{ number: 1, dimension: '285', lowerTolerance: '-0.5', upperTolerance: '+0.5' }] }], std).map(s => [s.tolerans, s.sinir.alt, s.standartDisi, s.sinifToleransi]), [['± 1,2 mm', 283.8, false, '± 1,2 mm']], 'yazılan tolerans ve sınır sınıftan');

// Çizimler Ref sırasına dizilir; çizim no yalnız grubun ilk satırında
const iki = [{ ad: 'B', olculer: [{ number: 22, dimension: '5' }, { number: 21, dimension: '4' }] }, { ad: 'A', olculer: [{ number: 1, dimension: '3' }] }, { ad: 'BOS', olculer: [] }];
assert.deepStrictEqual(F.orSatirlar(iki).map(s => [s.ref, s.cizim]), [[1, 'A'], [21, 'B'], [22, '']]);
assert.deepStrictEqual(F.orCakisanNumaralar(iki), []);
assert.deepStrictEqual(F.orCakisanNumaralar([{ olculer: [{ number: 5 }, { number: 6 }] }, { olculer: [{ number: 6 }] }]), [6], 'çakışan numara');

// Sentetik şablon: başlık 4-5, tablo 6-9 (9 alt çerçeveli), alt bölüm 10, altında birleşik hücre, bağlantı, görsel, baskı alanı
const sat = (r, s, v) => `<row r="${r}"><c r="A${r}" s="1"/><c r="B${r}" s="${s}"${v == null ? '/>' : ` t="s"><v>${v}</v></c>`}<c r="D${r}" s="2"/><c r="E${r}" s="3"/><c r="F${r}" s="4"/><c r="L${r}" s="5"><v>999</v></c><c r="M${r}" s="5"/><c r="N${r}" s="5"/><c r="O${r}" s="6"/></row>`;
async function sablon() {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types><Override PartName="/xl/calcChain.xml" ContentType="x"/></Types>');
  z.file('xl/workbook.xml', '<workbook><sheets><sheet name="kapak" sheetId="1" r:id="rId1"/><sheet name="olcu" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">kapak!$A$1:$B$2</definedName><definedName name="_xlnm.Print_Area" localSheetId="1">olcu!$A$1:$T$12</definedName></definedNames><calcPr calcId="1"/></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId9" Target="calcChain.xml" Type="calcChain"/></Relationships>');
  z.file('xl/calcChain.xml', '<calcChain/>');
  z.file('xl/styles.xml', '<styleSheet><cellStyles/><dxfs count="0"/></styleSheet>');
  z.file('xl/sharedStrings.xml', '<sst><si><t>Nr.</t></si><si><t>Tedarikci Onayı:</t></si><si><t>Sabit</t></si></sst>');
  z.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>');
  z.file('xl/worksheets/sheet2.xml', `<worksheet><dimension ref="A1:T12"/><sheetData>${sat(5, 1, 0)}${sat(6, 7)}${sat(7, 7)}${sat(8, 7)}${sat(9, 8)}${sat(10, 9, 1)}<row r="11"><c r="E11"><f>kapak!A1</f><v>7</v></c></row><row r="12"><c r="A12" t="s"><v>2</v></c></row></sheetData><mergeCells count="2"><mergeCell ref="A12:D12"/><mergeCell ref="B5:C5"/></mergeCells><hyperlinks><hyperlink ref="E11" r:id="rId1"/></hyperlinks><drawing r:id="rId3"/></worksheet>`);
  z.file('xl/worksheets/_rels/sheet2.xml.rels', '<Relationships><Relationship Id="rId3" Target="../drawings/drawing1.xml"/></Relationships>');
  z.file('xl/drawings/drawing1.xml', '<xdr:wsDr><xdr:from><xdr:row>10</xdr:row></xdr:from><xdr:to><xdr:row>11</xdr:row></xdr:to></xdr:wsDr>');
  return z.generateAsync({ type: 'uint8array' });
}
const satir = (x, r) => (new RegExp(`<row\\b[^>]*\\br="${r}"[\\s\\S]*?</row>`).exec(x) || [''])[0];
const olc = (n, bas = 1) => Array.from({ length: n }, (_, i) => ({ number: bas + i, dimension: i % 2 ? 'Ø1.5' : String(10 + i), lowerTolerance: '-0.5', upperTolerance: '+0.5' }));

(async () => {
  // Kırmızı kurallar: L:N ölçüm sınırı, F yalnız standart dışında; önceki rapor şablon olsa da kural birikmez; başlıklar yazılır
  { const sab = await sablon();
    const b = await F.orDoldur(JSZip, sab, [{ ad: 'C', olculer: [{ number: 1, dimension: '285', lowerTolerance: '-1.2', upperTolerance: '+1.2' }, { number: 2, dimension: 'Ø27.5', lowerTolerance: '-2', upperTolerance: '2' }, { number: 3, dimension: '3x Ø6', lowerTolerance: '-1', upperTolerance: '+1' }] }], { tolerans: () => ({ alt: '-1.2', ust: '+1.2' }), sinifDegeriMi: o => o.dimension === '285', araliklar: [{ bas: 120, son: 400, metin: '± 1,2 mm' }] });
    const zk = await JSZip.loadAsync(b), xk = await zk.file('xl/worksheets/sheet2.xml').async('string');
    assert(xk.includes('sqref="L6:N9"') && xk.includes('sqref="F6:F9"'), 'kural tablonun tüm satırlarında (boş satır dâhil)');
    assert(xk.includes('sqref="R6:T9"') && xk.includes('$M6') && xk.includes('$N6') && xk.includes('sqref="R8:T8"'), 'uygun değil sütunu üç ölçümü de izler (yapıştırmada silinmez)');
    assert(xk.includes('$E6') && xk.includes('$F6') && xk.includes('_xlfn.NUMBERVALUE'), 'nominal ve tolerans hücreden canlı okunur');
    assert(xk.includes('"±1,2"') && xk.includes('&gt;=120') && xk.includes('&lt;400'), 'sınıf tablosu formülde');
    assert(xk.length && [...xk.matchAll(/<formula>(.*?)<\/formula>/g)].every(m => m[1].length < 8192), 'Excel kural sınırı');
    assert(xk.includes('sqref="L8:N8"') && xk.includes('&lt;5') && xk.includes('&gt;7') && xk.includes('sqref="F8"'), 'canlı okunamayan nominal (3x Ø6) sabit kuralla');
    assert(xk.indexOf('<conditionalFormatting') > xk.indexOf('</mergeCells>') && xk.indexOf('</conditionalFormatting><hyperlinks') > 0, 'şema sırası');
    assert(satir(xk, 5).includes('2. Ölçüm') && satir(xk, 5).includes('3. Ölçüm') && satir(xk, 5).includes('<v>999</v>'), 'boş başlık hücreleri yazılır, dolu olan ezilmez');
    const st = await zk.file('xl/styles.xml').async('string'); assert(/<dxfs count="1"><dxf>.*FFFF0000/.test(st), 'kırmızı biçim');
    const iki = await F.orDoldur(JSZip, b, [{ ad: 'C', olculer: [{ number: 1, dimension: '10', lowerTolerance: '-1', upperTolerance: '1' }] }]);
    const x2 = await (await JSZip.loadAsync(iki)).file('xl/worksheets/sheet2.xml').async('string');
    assert.strictEqual((x2.match(/<conditionalFormatting/g) || []).length, 2, 'eski kurallar silinmeli (ölçüm + uygun değil)'); assert(!x2.includes('sqref="L8:N8"'), 'eski sabit kural kalmamalı');
    assert(/dxfId="1"/.test(x2), 'yeni biçim numarası');
  }
  // Sığan: biçim kalır, eski değerler (L dahil) silinir, alt bölüm yerinde
  let z = await JSZip.loadAsync(await F.orDoldur(JSZip, await sablon(), [{ ad: 'C-1', olculer: olc(2) }]));
  let x = await z.file('xl/worksheets/sheet2.xml').async('string');
  assert(satir(x, 6).includes('<c r="B6" s="7"><v>1</v></c>') && satir(x, 6).includes('<c r="D6" s="2" t="inlineStr"><is><t xml:space="preserve">C-1</t>'), 'ilk satır: ' + satir(x, 6));
  assert(satir(x, 6).includes('<c r="E6" s="3"><v>10</v></c>') && satir(x, 6).includes('± 0,5 mm'), 'nominal/tolerans');
  assert(satir(x, 7).includes('Ø1,5') && !satir(x, 7).includes('C-1'), 'çizim no yalnız ilk satırda');
  assert(satir(x, 6).includes('<c r="L6" s="5"/>') && satir(x, 8).includes('<c r="B8" s="7"/>'), 'L ve kalan satırlar boş, biçim duruyor');
  assert(satir(x, 10).includes('r="B10" s="9" t="s"'), 'alt bölüm yerinde');
  assert(satir(x, 5).includes('<v>999</v>'), 'başlık satırı değişmemeli');
  assert(/<mergeCell ref="A12:D12"\/>/.test(x), 'birleşik yerinde');
  assert.strictEqual(await z.file('xl/worksheets/sheet1.xml').async('string'), '<worksheet><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>', 'kapak değişmemeli');
  assert(!z.file('xl/calcChain.xml') && !(await z.file('[Content_Types].xml').async('string')).includes('calcChain') && !(await z.file('xl/_rels/workbook.xml.rels').async('string')).includes('calcChain'), 'calcChain tamamen kalkmalı');
  assert((await z.file('xl/workbook.xml').async('string')).includes('fullCalcOnLoad="1"'), 'açılışta hesap');

  // Sığmayan (tablo 4 satır, ölçü 7): 3 satır eklenir, alt çerçeveli son satır en altta, altındakiler kayar
  z = await JSZip.loadAsync(await F.orDoldur(JSZip, await sablon(), [{ ad: 'C-1', olculer: olc(4) }, { ad: 'C-2', olculer: olc(3, 21) }]));
  x = await z.file('xl/worksheets/sheet2.xml').async('string');
  const nolar = [...x.matchAll(/<row\b[^>]*\br="(\d+)"/g)].map(m => +m[1]);
  assert.deepStrictEqual(nolar, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'satır sırası bozulmamalı: ' + nolar);
  assert(satir(x, 10).includes('<c r="B10" s="7"><v>21</v></c>') && satir(x, 10).includes('C-2'), 'ikinci çizim eklenen satırda: ' + satir(x, 10));
  assert(satir(x, 12).includes('<c r="B12" s="8"><v>23</v></c>'), 'son ölçü alt çerçeveli satırda: ' + satir(x, 12));
  assert(satir(x, 13).includes('r="B13" s="9" t="s"'), 'alt bölüm kaydı');
  assert(satir(x, 14).includes('<c r="E14"><f>kapak!A1</f>'), 'formül satırı kaydı, kapak başvurusu aynı');
  assert(x.includes('<mergeCell ref="A15:D15"/>') && x.includes('<mergeCell ref="B5:C5"/>') && x.includes('<hyperlink ref="E14"') && x.includes('<dimension ref="A1:T15"'), 'birleşik/bağlantı/boyut kaymalı');
  const wb = await z.file('xl/workbook.xml').async('string');
  assert(wb.includes('olcu!$A$1:$T$15') && wb.includes('kapak!$A$1:$B$2'), 'baskı alanı yalnız ikinci sekmede: ' + wb);
  assert.strictEqual(await z.file('xl/drawings/drawing1.xml').async('string'), '<xdr:wsDr><xdr:from><xdr:row>13</xdr:row></xdr:from><xdr:to><xdr:row>14</xdr:row></xdr:to></xdr:wsDr>', 'imza görseli kaymalı');

  // Eski sürüm açıldıysa bir kez yenilenir; aynı sürümde, balon varken, hatada ve ikinci kez yenilenmez
  { const oturum = () => { const d = {}; return { getItem: k => d[k] || null, setItem: (k, v) => { d[k] = v; } }; };
    const sayfa = v => async () => '<script src="olcum-raporu.js?v=' + v + '"></script>';
    let y = 0; const yen = () => { y++; }, o1 = oturum();
    assert.strictEqual(await F.orSurumDenetle('a', sayfa('b'), o1, () => true, yen), true, 'eski sürüm yenilenir'); assert.strictEqual(y, 1);
    assert.strictEqual(await F.orSurumDenetle('a', sayfa('b'), o1, () => true, yen), false, 'döngüye girmez'); assert.strictEqual(y, 1);
    assert.strictEqual(await F.orSurumDenetle('b', sayfa('b'), oturum(), () => true, yen), false, 'güncel');
    assert.strictEqual(await F.orSurumDenetle('a', sayfa('b'), oturum(), () => false, yen), false, 'çalışma varken yenilenmez');
    assert.strictEqual(await F.orSurumDenetle('a', async () => { throw new Error('ağ'); }, oturum(), () => true, yen), false, 'ağ hatası'); assert.strictEqual(y, 1);
  }
  // Uygunsuz şablon anlaşılır hata verir
  const bos = new JSZip(); bos.file('xl/workbook.xml', '<workbook><sheets><sheet r:id="a"/></sheets></workbook>'); bos.file('xl/_rels/workbook.xml.rels', '<Relationships/>');
  const bosBayt = await bos.generateAsync({ type: 'uint8array' });
  await assert.rejects(() => F.orDoldur(JSZip, bosBayt, []), /ikinci sekme/);
  // Depoya gerçek şablon girmesin
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  assert(fs.readFileSync(__dirname + '/olcum-raporu.js', 'utf8').includes('tolElle: a.tolElle'), 'JSON kaydındaki elle tolerans işareti korunmalı');
  assert(html.includes('id="olcumRaporuBtn"') && html.includes('jszip/3.10.1') && html.includes('olcum-raporu.js?v='), 'sayfa kablolaması');
  assert(!fs.readdirSync(__dirname).some(f => /\.xlsx?$/i.test(f)), 'depoda Excel dosyası olmamalı (imza/kişi bilgisi)');
  console.log('✔ ölçüm raporu: biçim, sığan/sığmayan, çok çizim, kaydırma, kapak aynen — tüm kontroller geçti');
})().catch(e => { console.error(e); process.exit(1); });
