// ═══════════════════════════════════════════════════════════
// OCR WEB WORKER - ANA THREAD'DEN AYRILMIŞ OCR İŞLEMLERİ
// ═══════════════════════════════════════════════════════════
// Bu worker, OCR işlemini ana thread'den ayırarak bellek yönetimini iyileştirir

self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    if (type === 'OCR_REQUEST') {
        try {
            const { base64Image, apiKey, endpoint } = data;
            
            // FormData oluştur
            const formData = new FormData();
            formData.append('base64Image', base64Image);
            formData.append('language', 'eng');
            formData.append('isOverlayRequired', 'true');
            formData.append('OCREngine', '2');
            formData.append('scale', 'true');
            formData.append('isTable', 'false');
            formData.append('detectOrientation', 'true');
            formData.append('filetype', 'PNG');
            
            // API çağrısı
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'apikey': apiKey
                },
                body: formData,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // Hata kontrolü
            if (result.OCRExitCode > 1 || result.IsErroredOnProcessing) {
                throw new Error(result.ErrorMessage || result.ErrorDetails || 'OCR failed');
            }
            
            // Sonucu işle
            let processedResult = null;
            
            if (result.ParsedResults && result.ParsedResults.length > 0) {
                const text = result.ParsedResults[0].ParsedText.trim();
                
                // Kelime koordinatlarını çıkar
                let words = [];
                if (result.ParsedResults[0].TextOverlay && result.ParsedResults[0].TextOverlay.Lines) {
                    const lines = result.ParsedResults[0].TextOverlay.Lines;
                    for (let line of lines) {
                        if (line.Words) {
                            for (let word of line.Words) {
                                words.push({
                                    text: word.WordText,
                                    left: word.Left,
                                    top: word.Top,
                                    width: word.Width,
                                    height: word.Height
                                });
                            }
                        }
                    }
                }
                
                processedResult = {
                    text: text,
                    words: words
                };
            }
            
            // Başarılı sonucu gönder
            self.postMessage({
                type: 'OCR_SUCCESS',
                data: processedResult
            });
            
            // Bellek temizliği
            result.ParsedResults = null;
            result.TextOverlay = null;
            
        } catch (error) {
            // Hata gönder
            self.postMessage({
                type: 'OCR_ERROR',
                error: error.message
            });
        }
    }
    
    // Bellek temizleme talebi
    if (type === 'CLEAR_MEMORY') {
        if (global.gc) {
            global.gc();
        }
        self.postMessage({ type: 'MEMORY_CLEARED' });
    }
};
