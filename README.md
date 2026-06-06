# 📐 Teknik Resim Balon Numaralandırma

## 🚀 Özellikler

### ✅ Otomatik OCR Tanıma
- **3 farklı OCR motoru** desteği
- Virgüllü sayılar (21,9 / 19+0.1)
- Teknik semboller (Ø40, R80, ±, °)
- Yatay ve dikey ölçüler

### 🎯 Akıllı Sistem
1. **OCR**: Ölçü otomatik okunur
2. **Veritabanı**: Benzer ölçüler hatırlanır
3. **Manuel**: Gerekirse kullanıcı girer

### 📊 Tam Özellikli
- PDF/PNG/JPEG desteği
- Balon numaralandırma
- Tolerans girişi
- PNG/CSV export
- LocalStorage ile kalıcı öğrenme

---

## 🔧 Kurulum (5 Dakika)

### ADIM 1: API Key Al (Ücretsiz)

#### **OCR.space** (ÖNERİLEN - En Kolay)
1. [ocr.space/ocrapi](https://ocr.space/ocrapi) adresine git
2. "Register for Free API Key" tıkla
3. Email'ine gelen API Key'i kopyala

#### Alternatifler:
- **Google Vision**: [console.cloud.google.com](https://console.cloud.google.com) (1000/ay ücretsiz)
- **Mathpix**: [mathpix.com/ocr](https://mathpix.com/ocr) (Teknik semboller için en iyi)

### ADIM 2: API Key'i Yerleştir

`app.js` dosyasını aç ve **8. satırı** düzenle:

```javascript
apiKey: 'K87899142388957', // Bu DEMO KEY - SİL
apiKey: 'BURAYA_API_KEYINIZI_YAPIŞTIRIN', // ✓ Kendi key'inizi yazın
```

### ADIM 3: Kullanmaya Başla

1. `index.html` dosyasını tarayıcıda aç
2. PDF/PNG/JPEG yükle
3. Ölçüleri dikdörtgen içine al
4. OCR otomatik tanıyacak! 🎉

---

## 📖 Kullanım Kılavuzu

### 1️⃣ Dosya Yükle
- **PDF**: Teknik resim PDF'i yükle
- **PNG/JPEG**: Görüntü dosyası yükle

### 2️⃣ Ölçü Seç
- Ölçünün üzerine **dikdörtgen çiz**
- Mouse'u bıraktığında otomatik tanıma başlar

### 3️⃣ Otomatik Tanıma
- **Yeşil arka plan** = OCR ile tanındı
- **Mavi arka plan** = Veritabanından bulundu
- **Modal açılırsa** = Manuel giriş gerekli

### 4️⃣ Hızlı Giriş
Modal'da **hızlı seçim butonları**:
- 12, 14, Ø16, 30, Ø40, 45, R25, R80

### 5️⃣ Tolerans Ekle
Tabloda alt/üst tolerans gir:
- Örn: `-0.05` / `+0.05`

### 6️⃣ Dışa Aktar
- **PNG**: Balonlu görüntü indir
- **CSV**: Excel için tablo (yakında)

---

## 🔑 API Karşılaştırma

| Özellik | OCR.space | Google Vision | Mathpix |
|---------|-----------|---------------|---------|
| **Aylık Ücretsiz** | 25,000 | 1,000 | 1,000 |
| **Kurulum** | ⭐⭐⭐ Çok Kolay | ⭐ Zor | ⭐⭐ Orta |
| **Kredi Kartı** | ❌ Hayır | ✅ Evet | ❌ Hayır |
| **Doğruluk** | %85-90 | %95-98 | %90-95 |
| **Teknik Semboller** | ⭐⭐ İyi | ⭐⭐⭐ Çok İyi | ⭐⭐⭐ Mükemmel |

**ÖNERİ:** Başlangıç için **OCR.space** kullanın.

---

## 💡 İpuçları

### OCR Doğruluğunu Artır
- ✅ Yüksek çözünürlük görüntüler kullan
- ✅ Sadece **ölçü metnini** seç (fazladan çizgi alma)
- ✅ Kontrast yüksek PDF'ler tercih et

### Öğrenme Sistemi
- İlk ölçüyü manuel gir
- Aynı ölçüyü bir daha seçtiğinde **otomatik bulacak**
- Her ölçüden 5 örnek hafızada tutuluyor

### Veritabanı
- **LocalStorage** kullanıyor (tarayıcıda kalıcı)
- Temizlemek için: `F12 > Console > localStorage.clear()`

---

## 🐛 Sorun Giderme

### OCR Hiçbir Şey Tanımıyor
1. **API Key kontrol et**: Demo key'i silip kendi key'ini yazdın mı?
2. **Console kontrol et**: `F12` > Console > Hata var mı?
3. **Alternatif API dene**: Google Vision veya Mathpix aktif et

### Modal Her Seferinde Açılıyor
- **Normal!** OCR %100 başarılı değil
- Manuel girdiğin ölçüler veritabanına kaydediliyor
- Bir sonraki aynı ölçüyü **otomatik bulacak**

### Resim Yüklenmiyor
- Tarayıcı console'a bak (`F12`)
- Dosya boyutu çok mu büyük? (Max 10MB önerilir)
- PDF bozuk mu? Başka PDF dene

---

## 📁 Dosya Yapısı

```
Technical Drawing Balloned Software/
│
├── index.html          # Ana uygulama
├── setup.html          # API kurulum rehberi
├── app.js              # Tüm JavaScript kodu
├── style.css           # Stiller
└── README.md           # Bu dosya
```

---

## 🔄 Güncellemeler

### v2.0 (Mevcut)
- ✅ OCR.space API entegrasyonu
- ✅ Google Vision desteği
- ✅ Mathpix desteği
- ✅ 3 aşamalı tanıma (OCR → DB → Manuel)
- ✅ Gelişmiş ön işleme
- ✅ Kurulum rehberi (setup.html)

### v1.0 (Eski)
- ❌ Tesseract.js (yetersiz)
- ❌ Piksel karşılaştırma (başarısız)

---

## 📞 Destek

**Sorun mu var?**
1. `setup.html` dosyasını aç
2. API key'i doğru yerleştirdiğinden emin ol
3. Console'da hata mesajlarını kontrol et (`F12`)

**OCR Stats:**
- Console'da her tanıma denemesi loglanır
- Başarı/başarısızlık oranını görebilirsin

---

## 📜 Lisans

Bu proje eğitim amaçlı geliştirilmiştir.

**Kullanılan Kütüphaneler:**
- PDF.js (Apache 2.0)
- OCR.space API (Ücretsiz tier)

---

## 🎉 Hazırsın!

1. `setup.html` aç → API key al
2. `app.js` düzenle → API key yapıştır
3. `index.html` aç → Kullanmaya başla

**İyi çalışmalar! 🚀**
