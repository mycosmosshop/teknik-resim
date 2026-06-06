// ═══════════════════════════════════════════════════════════
// TEKNİK RESİM BALON NUMARALANDIRMA - GELİŞMİŞ OCR VERSİYON
// ═══════════════════════════════════════════════════════════

// OCR API AYARLARI - localStorage'dan yüklenir
function loadOCRConfig() {
    return {
        // SEÇENEK 1: OCR.space (ÜCRETSİZ - 25,000/ay)
        ocrspace: {
            enabled: localStorage.getItem('ocr_ocrspace_enabled') === 'true' || false,
            apiKey: localStorage.getItem('ocr_ocrspace_key') || 'K87540454588957', // Fallback demo key
            endpoint: 'https://api.ocr.space/parse/image'
        },
        
        // SEÇENEK 2: Google Cloud Vision (1000/ay ücretsiz)
        google: {
            enabled: localStorage.getItem('ocr_google_enabled') === 'true' || false,
            apiKey: localStorage.getItem('ocr_google_key') || '',
            endpoint: 'https://vision.googleapis.com/v1/images:annotate'
        },
        
        // SEÇENEK 3: Mathpix (Matematik/Teknik - 1000/ay)
        mathpix: {
            enabled: localStorage.getItem('ocr_mathpix_enabled') === 'true' || false,
            appId: localStorage.getItem('ocr_mathpix_appid') || '',
            appKey: localStorage.getItem('ocr_mathpix_appkey') || '',
            endpoint: 'https://api.mathpix.com/v3/text'
        }
    };
}

const OCR_CONFIG = loadOCRConfig();

// Global değişkenler
let canvas, ctx;
let imageLoaded = false;
let isDrawing = false;
let startX, startY;
let annotations = [];
let balloonCounter = 1;
let currentImage = null;
let pendingAnnotation = null;
let imageDatabase = {};
let ocrStats = { attempts: 0, success: 0, failed: 0 };
let ocrCounter = 0; // Bellek temizliği için sayaç

// Zoom ayarları
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let canvasContainer = null;

// Balon görünüm ayarları
let currentBalloonShape = 'circle'; // Varsayılan şekil
let currentBalloonColor = '#3498db'; // Varsayılan renk (mavi)
let currentLineColor = '#2c3e50'; // Varsayılan çizgi rengi (siyah)
let currentTextColor = '#ffffff'; // Varsayılan yazı rengi (beyaz)
let currentFillType = 'filled'; // Varsayılan dolgu tipi (dolu)
let currentBalloonSize = 20; // Varsayılan balon boyutu
let currentBalloonTextSize = 16; // Varsayılan balon yazı boyutu
let currentFontFamily = 'Arial'; // Varsayılan yazı stili

// Metin ekleme modu
let isTextMode = false;
let textAnnotations = []; // Metin açıklamaları için ayrı dizi
let currentTextSize = 16; // Varsayılan metin boyutu
let currentTextBox = 'none'; // Varsayılan: kutu yok
let isDraggingText = false; // Metin sürükleme durumu
let draggedText = null; // Sürüklenen metin

// Metin kutusu çizim durumu
let isDrawingTextBox = false;
let textBoxStartX = 0;
let textBoxStartY = 0;
let currentTextBoxRect = null; // Çizilen metin kutusu

// Metin kutusu boyutlandırma
let isResizingTextBox = false;
let resizingTextBox = null;
let resizeHandle = null; // 'tl', 'tr', 'bl', 'br'
let resizeStartX = 0;
let resizeStartY = 0;

// Metin kutusu hover efekti
let hoveredTextBox = null;

// Çizgi/Ok çizme modu
let isLineMode = false;
let lines = []; // Çizilen çizgiler
let isDrawingLine = false;
let lineStartX = 0;
let lineStartY = 0;
let isDraggingLinePoint = false;
let draggedLine = null;

// History sistemi (Geri Al)
let history = [];
let draggedPointIndex = -1; // 0: başlangıç, 1: bitiş
let isDraggingLine = false; // Çizgi taşıma durumu
let lineDragOffsetX = 0;
let lineDragOffsetY = 0;

// Web Worker - OCR işlemini ana thread'den ayır
let ocrWorker = null;
try {
    // file:// protokolünde worker çalışmaz, sadece http/https'de
    if (window.location.protocol !== 'file:') {
        ocrWorker = new Worker('ocr-worker.js');
        console.log('✅ Web Worker aktif');
    } else {
        console.log('ℹ️ file:// protokolünde Web Worker devre dışı (normal mod)');
    }
} catch (e) {
    console.log('ℹ️ Web Worker kullanılamıyor, normal mod aktif');
}

// Balon sürükleme için değişkenler
let isDraggingBalloon = false;
let draggedBalloon = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Pan (kaydırma) için değişkenler
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let scrollLeft = 0;
let scrollTop = 0;

// Snap-to-guide çizgileri
let snapGuides = { x: null, y: null };
const snapThreshold = 10; // Hizalama hassasiyeti (pixel)
const minBalloonDistance = 40; // Balonlar arası minimum mesafe (üst üste gelmesin)

// Tolerans Aralıkları Tablosu (DIN ISO 2768 - m medium/orta)
let toleranceRanges = [
    { id: 1, start: 0, end: 3, fine: 0.05, medium: 0.1, coarse: 0.2, veryCoarse: null, manualLower: null, manualUpper: null },
    { id: 2, start: 3, end: 6, fine: 0.05, medium: 0.1, coarse: 0.3, veryCoarse: 0.5, manualLower: null, manualUpper: null },
    { id: 3, start: 6, end: 30, fine: 0.1, medium: 0.2, coarse: 0.5, veryCoarse: 1.0, manualLower: null, manualUpper: null },
    { id: 4, start: 30, end: 120, fine: 0.15, medium: 0.3, coarse: 0.8, veryCoarse: 1.5, manualLower: null, manualUpper: null },
    { id: 5, start: 120, end: 400, fine: 0.2, medium: 0.5, coarse: 1.2, veryCoarse: 2.5, manualLower: null, manualUpper: null },
    { id: 6, start: 400, end: 1000, fine: 0.3, medium: 0.8, coarse: 2.0, veryCoarse: 4.0, manualLower: null, manualUpper: null },
    { id: 7, start: 1000, end: 2000, fine: 0.5, medium: 1.2, coarse: 3.0, veryCoarse: 6.0, manualLower: null, manualUpper: null },
    { id: 8, start: 2000, end: 4000, fine: null, medium: 2.0, coarse: 4.0, veryCoarse: 8.0, manualLower: null, manualUpper: null }
];

// Aktif tolerans sınıfı
let activeToleranceClass = 'medium'; // fine, medium, coarse, veryCoarse, manual

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    canvas = document.getElementById('drawingCanvas');
    ctx = canvas.getContext('2d');
    canvas.style.cursor = 'crosshair';
    
    console.log('🚀 Gelişmiş OCR Sistemi Başlatıldı');
    console.log('📡 OCR.space API: AKTIF');
    console.log('💾 Manuel yedekleme: "📂 Yedek Yükle" butonu aktif');
    console.log('⚡ Veritabanı öğrenme: KAPALI (Bellek tasarrufu)');
    
    loadToleranceRanges();
    // loadDatabase(); // KALDIRILDI - Bellek tasarrufu
    setupEventListeners();
    setupModalListeners();
    updateActiveSystemText(); // Aktif sistem yazısını güncelle
    
    // Başlangıç numarasını input'tan al
    const startInput = document.getElementById('startNumberInput');
    if (startInput && startInput.value) {
        const startNum = parseInt(startInput.value);
        if (!isNaN(startNum) && startNum >= 1) {
            balloonCounter = startNum;
            console.log('🔢 Başlangıç numarası:', balloonCounter);
        }
    }
});

// Event listener'ları kur
function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const backupFileInput = document.getElementById('backupFileInput');
    const clearBtn = document.getElementById('clearBtn');
    const clearMenu = document.getElementById('clearMenu');
    const clearAnnotationsBtn = document.getElementById('clearAnnotationsBtn');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const clearTableBtn = document.getElementById('clearTableBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const undoBtn = document.getElementById('undoBtn');
    const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
    const exportBtn = document.getElementById('exportBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const autoAlignBtn = document.getElementById('autoAlignBtn');
    const addTextBtn = document.getElementById('addTextBtn');
    const setStartNumberBtn = document.getElementById('setStartNumberBtn');
    const applyAutoNumberBtn = document.getElementById('applyAutoNumberBtn');
    const autoNumberDirectionSelect = document.getElementById('autoNumberDirectionSelect');
    const applyToleranceBtn = document.getElementById('applyToleranceBtn');
    const clearToleranceBtn = document.getElementById('clearToleranceBtn');
    const openToleranceTableBtn = document.getElementById('openToleranceTableBtn');
    const balloonShapeSelect = document.getElementById('balloonShapeSelect');
    const balloonColorSelect = document.getElementById('balloonColorSelect');
    const lineColorSelect = document.getElementById('lineColorSelect');
    const textColorSelect = document.getElementById('textColorSelect');
    const fillTypeSelect = document.getElementById('fillTypeSelect');
    const balloonSizeInput = document.getElementById('balloonSizeInput');
    const balloonTextSizeInput = document.getElementById('balloonTextSizeInput');
    const textSizeInput = document.getElementById('textSizeInput');
    const textBoxSelect = document.getElementById('textBoxSelect');

    fileInput.addEventListener('change', handleFileUpload);
    backupFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadBackupFile(e.target.files[0]);
        }
    });
    
    // Dropdown menü toggle - SADECE tıklama ise, drag değilse
    console.log('ClearBtn element:', clearBtn);
    console.log('ClearMenu element:', clearMenu);
    
    if (!clearBtn || !clearMenu) {
        console.error('❌ ClearBtn veya ClearMenu bulunamadı!');
    } else {
        // Basit click handler - toolbar ile ilgisiz
        clearBtn.addEventListener('click', (e) => {
            console.log('✓ ClearBtn click');
            
            e.stopPropagation();
            e.preventDefault();
            
            // Toggle dropdown
            const isVisible = clearMenu.style.display === 'block';
            
            if (!isVisible) {
                // Butonun pozisyonunu al
                const btnRect = clearBtn.getBoundingClientRect();
                
                // Dropdown'ı butonun altına yerleştir
                clearMenu.style.left = btnRect.left + 'px';
                clearMenu.style.top = (btnRect.bottom + 2) + 'px';
                clearMenu.style.display = 'block';
                
                console.log('✓ Dropdown açıldı:', btnRect.left, btnRect.bottom);
            } else {
                clearMenu.style.display = 'none';
                console.log('✓ Dropdown kapandı');
            }
            
            return false;
        });
        
        console.log('✅ ClearBtn event listener eklendi');
    }
    
    // Dropdown dışına tıklayınca kapat
    document.addEventListener('click', () => {
        clearMenu.style.display = 'none';
    });
    
    // Temizleme seçenekleri
    clearAnnotationsBtn.addEventListener('click', () => {
        clearMenu.style.display = 'none';
        clearAnnotations();
    });
    
    clearImageBtn.addEventListener('click', () => {
        clearMenu.style.display = 'none';
        clearImage();
    });
    
    clearTableBtn.addEventListener('click', () => {
        clearMenu.style.display = 'none';
        clearTable();
    });
    
    clearAllBtn.addEventListener('click', () => {
        clearMenu.style.display = 'none';
        clearAll();
    });
    
    undoBtn.addEventListener('click', undoLastAnnotation);
    resetDefaultsBtn.addEventListener('click', resetToDefaults);
    exportBtn.addEventListener('click', exportImage);
    exportPdfBtn.addEventListener('click', exportToPdf);
    exportExcelBtn.addEventListener('click', exportToExcel);
    autoAlignBtn.addEventListener('click', autoAlignBalloons);
    addTextBtn.addEventListener('click', toggleTextMode);
    
    const addLineBtn = document.getElementById('addLineBtn');
    addLineBtn.addEventListener('click', toggleLineMode);
    
    setStartNumberBtn.addEventListener('click', setStartNumber);
    applyAutoNumberBtn.addEventListener('click', applyAutoNumbering);
    applyToleranceBtn.addEventListener('click', applyToleranceToAll);
    clearToleranceBtn.addEventListener('click', clearAllTolerances);
    openToleranceTableBtn.addEventListener('click', openToleranceTableModal);
    
    // Balon şekli ve renk değişikliklerini dinle
    balloonShapeSelect.addEventListener('change', (e) => {
        currentBalloonShape = e.target.value;
        console.log('🔷 Balon şekli değiştirildi:', currentBalloonShape);
    });
    
    balloonColorSelect.addEventListener('change', (e) => {
        currentBalloonColor = e.target.value;
        console.log('🎨 Balon rengi değiştirildi:', currentBalloonColor);
    });
    
    lineColorSelect.addEventListener('change', (e) => {
        currentLineColor = e.target.value;
        console.log('✏️ Çizgi rengi değiştirildi:', currentLineColor);
    });
    
    textColorSelect.addEventListener('change', (e) => {
        currentTextColor = e.target.value;
        console.log('📝 Yazı rengi değiştirildi:', currentTextColor);
    });
    
    fillTypeSelect.addEventListener('change', (e) => {
        currentFillType = e.target.value;
        console.log('🔳 Dolgu tipi değiştirildi:', currentFillType);
    });
    
    balloonSizeInput.addEventListener('change', (e) => {
        currentBalloonSize = parseInt(e.target.value) || 20;
        console.log('🔵 Balon boyutu değiştirildi:', currentBalloonSize);
    });
    
    balloonTextSizeInput.addEventListener('change', (e) => {
        currentBalloonTextSize = parseInt(e.target.value) || 16;
        console.log('🔤 Balon yazı boyutu değiştirildi:', currentBalloonTextSize);
    });
    
    textSizeInput.addEventListener('change', (e) => {
        currentTextSize = parseInt(e.target.value) || 16;
        console.log('📏 Metin boyutu değiştirildi:', currentTextSize);
    });
    
    textBoxSelect.addEventListener('change', (e) => {
        currentTextBox = e.target.value;
        console.log('⬜ Metin kutusu değiştirildi:', currentTextBox);
    });
    
    const fontFamilySelect = document.getElementById('fontFamilySelect');
    fontFamilySelect.addEventListener('change', (e) => {
        currentFontFamily = e.target.value;
        console.log('🔤 Yazı stili değiştirildi:', currentFontFamily);
    });

    // Zoom kontrolleri
    canvasContainer = document.getElementById('canvasContainer');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    const zoomLevelSpan = document.getElementById('zoomLevel');
    
    zoomInBtn.addEventListener('click', () => {
        zoomLevel = Math.min(zoomLevel * 1.2, 5.0);
        updateCanvasTransform();
    });
    
    zoomOutBtn.addEventListener('click', () => {
        zoomLevel = Math.max(zoomLevel / 1.2, 0.3);
        updateCanvasTransform();
    });
    
    zoomResetBtn.addEventListener('click', () => {
        fitToScreen();
    });
    
    // Mouse wheel ile zoom (canvas merkez noktasından)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.3, Math.min(5.0, zoomLevel * delta));
        
        if (newZoom !== zoomLevel) {
            zoomLevel = newZoom;
            updateCanvasTransform();
        }
    });

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDrawing);
    canvas.addEventListener('mouseleave', cancelDrawing);
    canvas.addEventListener('dblclick', handleDoubleClick);
    
    // Sağ tık menüsünü engelle ama metin ve çizgi silme kontrolü yap
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Metin üzerine tıklanmış mı kontrol et
        const coords = getCanvasCoordinates(e);
        const mouseX = coords.x;
        const mouseY = coords.y;
        
        // Önce çizgi kontrolü yap
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            
            // Noktadan çizgiye mesafe hesaplama
            const A = mouseX - line.x1;
            const B = mouseY - line.y1;
            const C = line.x2 - line.x1;
            const D = line.y2 - line.y1;
            
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            const param = lenSq !== 0 ? dot / lenSq : -1;
            
            let closestX, closestY;
            
            if (param < 0) {
                closestX = line.x1;
                closestY = line.y1;
            } else if (param > 1) {
                closestX = line.x2;
                closestY = line.y2;
            } else {
                closestX = line.x1 + param * C;
                closestY = line.y1 + param * D;
            }
            
            const distToLine = Math.sqrt(
                Math.pow(mouseX - closestX, 2) + 
                Math.pow(mouseY - closestY, 2)
            );
            
            if (distToLine <= 5) {
                if (confirm('Bu çizgiyi silmek istiyor musunuz?')) {
                    lines.splice(i, 1);
                    redrawCanvas();
                    showNotification('Çizgi silindi', 'success');
                }
                return;
            }
        }
        
        // Metin kontrolü
        for (let i = textAnnotations.length - 1; i >= 0; i--) {
            const textAnn = textAnnotations[i];
            const textWidth = ctx.measureText(textAnn.text).width;
            const textHeight = textAnn.fontSize;
            
            if (mouseX >= textAnn.x && mouseX <= textAnn.x + textWidth &&
                mouseY >= textAnn.y && mouseY <= textAnn.y + textHeight) {
                if (confirm(`"${textAnn.text}" metnini silmek istiyor musunuz?`)) {
                    textAnnotations.splice(i, 1);
                    redrawCanvas();
                    showNotification('Metin silindi', 'success');
                }
                return;
            }
        }
    });
    
    // Pan için event listener'lar
    canvasContainer.addEventListener('mousedown', startPan);
    canvasContainer.addEventListener('mousemove', doPan);
    canvasContainer.addEventListener('mouseup', endPan);
    canvasContainer.addEventListener('mouseleave', endPan);
}

// Canvas transform güncelle
function updateCanvasTransform() {
    if (!canvas) return;
    
    // Canvas boyutlarını ayarla
    const containerWidth = canvasContainer.clientWidth;
    const containerHeight = canvasContainer.clientHeight;
    
    // Zoom uygulanmış boyutlar
    const scaledWidth = canvas.width * zoomLevel;
    const scaledHeight = canvas.height * zoomLevel;
    
    // Ortalamak için padding hesapla
    panX = Math.max(0, (containerWidth - scaledWidth) / 2);
    panY = Math.max(0, (containerHeight - scaledHeight) / 2);
    
    // Transform uygula
    canvas.style.transform = `scale(${zoomLevel})`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.marginLeft = panX + 'px';
    canvas.style.marginTop = panY + 'px';
    
    // Zoom seviyesini göster
    document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
    console.log('🔍 Zoom:', Math.round(zoomLevel * 100) + '%');
}

// Ekrana sığdır (Scale to Fit)
function fitToScreen() {
    if (!canvas || !currentImage) return;
    
    const containerWidth = canvasContainer.clientWidth - 40;
    const containerHeight = canvasContainer.clientHeight - 40;
    
    const scaleX = containerWidth / canvas.width;
    const scaleY = containerHeight / canvas.height;
    
    zoomLevel = Math.min(scaleX, scaleY, 1.0); // Max 100%
    updateCanvasTransform();
    
    console.log('📐 Scale to Fit:', Math.round(zoomLevel * 100) + '%');
}

// Modal event listener'ları
function setupModalListeners() {
    const modal = document.getElementById('dimensionModal');
    const modalOK = document.getElementById('modalOK');
    const modalCancel = document.getElementById('modalCancel');
    const modalInput = document.getElementById('modalDimension');
    const quickBtns = document.querySelectorAll('.quick-btn');

    modalOK.addEventListener('click', () => {
        const dimension = modalInput.value.trim();
        if (dimension && pendingAnnotation) {
            // ÖNEMLI: number ataması - eğer yoksa balloonCounter kullan
            if (!pendingAnnotation.number) {
                pendingAnnotation.number = balloonCounter;
            }
            
            pendingAnnotation.dimension = dimension;
            
            // Varsayılan toleransları uygula
            applyDefaultTolerances(pendingAnnotation);
            
            // learnImage(pendingAnnotation, dimension); // KALDIRILDI - Bellek tasarrufu
            annotations.push(pendingAnnotation);
            addTableRow(pendingAnnotation);
            balloonCounter++;
            redrawCanvas();
            closeModal();
        } else if (!dimension) {
            alert('Lütfen bir ölçü değeri girin!');
        }
    });

    modalCancel.addEventListener('click', () => {
        closeModal();
    });

    modalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            modalOK.click();
        }
    });

    quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modalInput.value = btn.dataset.value;
            modalInput.focus();
        });
    });
}

// Dosya yükle
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    
    console.log('📁 Dosya seçildi:', file.name, '| Tip:', fileType, '| Boyut:', file.size);
    
    // fileName elementi varsa güncelle (optional)
    const fileNameElement = document.getElementById('fileName');
    if (fileNameElement) {
        fileNameElement.textContent = file.name;
    }
    
    if (fileType === 'application/pdf') {
        loadPDF(file);
    } else if (fileType.startsWith('image/') || fileName.endsWith('.tif') || fileName.endsWith('.tiff')) {
        loadImage(file);
    } else {
        alert('Sadece PDF, PNG, JPEG veya TIF dosyaları desteklenir!\nDosya tipi: ' + fileType);
    }
}

// PDF yükle
async function loadPDF(file) {
    const fileReader = new FileReader();
    
    fileReader.onload = async function() {
        const typedArray = new Uint8Array(this.result);
        
        try {
            const pdf = await pdfjsLib.getDocument(typedArray).promise;
            const page = await pdf.getPage(1);
            
            // Maksimum boyut sınırları
            const maxWidth = 4000;
            const maxHeight = 3000;
            
            // Uygun scale hesapla
            let scale = 2.0;
            let viewport = page.getViewport({ scale: scale });
            
            // Boyut çok büyükse scale'i düşür
            while ((viewport.width > maxWidth || viewport.height > maxHeight) && scale > 0.5) {
                scale -= 0.1;
                viewport = page.getViewport({ scale: scale });
            }
            
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // PDF'i kalıcı image olarak kaydet
            const pdfDataUrl = canvas.toDataURL();
            const pdfImage = new Image();
            
            pdfImage.onload = function() {
                currentImage = pdfImage;
                imageLoaded = true;
                
                // Ekrana sığdır
                setTimeout(() => fitToScreen(), 100);
                console.log('✅ PDF yüklendi ve kaydedildi:', canvas.width, 'x', canvas.height);
                
                // Canvas'ı yeniden çiz
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
            };
            
            pdfImage.src = pdfDataUrl;
            
        } catch (error) {
            console.error('PDF yükleme hatası:', error);
            alert('PDF dosyası yüklenirken bir hata oluştu!');
        }
    };
    
    fileReader.readAsArrayBuffer(file);
}

// Resim yükle
function loadImage(file) {
    const fileName = file.name.toLowerCase();
    
    // TIF/TIFF dosyası mı?
    if (fileName.endsWith('.tif') || fileName.endsWith('.tiff')) {
        loadTIFF(file);
        return;
    }
    
    // Normal resim (PNG, JPEG)
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const img = new Image();
        
        img.onload = function() {
            const maxWidth = 4000;
            const maxHeight = 3000;
            let width = img.width;
            let height = img.height;
            
            // Genişlik kontrolü
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            // Yükseklik kontrolü
            if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            currentImage = img;
            imageLoaded = true;
            
            console.log('✅ Resim yüklendi:', canvas.width, 'x', canvas.height);
            
            // Ekrana sığdır
            setTimeout(() => fitToScreen(), 100);
        };
        
        img.onerror = function() {
            console.error('Resim yükleme hatası');
            alert('Resim dosyası yüklenirken hata oluştu!');
        };
        
        img.src = e.target.result;
    };
    
    reader.readAsDataURL(file);
}

// TIF/TIFF dosyası yükle
function loadTIFF(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            console.log('📄 TIFF dosyası işleniyor...');
            
            // TIFF.js ile parse et
            const tiff = new Tiff({ buffer: e.target.result });
            const tiffCanvas = tiff.toCanvas();
            
            if (!tiffCanvas) {
                throw new Error('TIFF canvas oluşturulamadı');
            }
            
            // TIFF canvas'tan resim oluştur
            const img = new Image();
            img.onload = function() {
                const maxWidth = 4000;
                const maxHeight = 3000;
                let width = img.width;
                let height = img.height;
                
                // Genişlik kontrolü
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                // Yükseklik kontrolü
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                currentImage = img;
                imageLoaded = true;
                
                console.log('✅ TIFF yüklendi:', canvas.width, 'x', canvas.height);
                
                // Ekrana sığdır
                setTimeout(() => fitToScreen(), 100);
            };
            
            img.src = tiffCanvas.toDataURL();
            
        } catch (error) {
            console.error('TIFF yükleme hatası:', error);
            alert('TIFF dosyası yüklenirken hata oluştu!\n\nLütfen dosyayı PNG veya JPEG formatına dönüştürün.');
        }
    };
    
    reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════
// ÇİZİM FONKSİYONLARI
// ═══════════════════════════════════════════════════════════

// Mouse koordinatlarını canvas koordinatlarına çevir (zoom dahil)
function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;
    return { x, y };
}

// Pan (kaydırma) başlat
function startPan(e) {
    // Sadece sağ tık (button === 2) veya orta tık (button === 1) ile
    if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        scrollLeft = canvasContainer.scrollLeft;
        scrollTop = canvasContainer.scrollTop;
        canvasContainer.style.cursor = 'grabbing';
        console.log('🖐️ Pan başladı');
    }
}

// Pan yap
function doPan(e) {
    if (!isPanning) return;
    
    e.preventDefault();
    const deltaX = e.clientX - panStartX;
    const deltaY = e.clientY - panStartY;
    
    canvasContainer.scrollLeft = scrollLeft - deltaX;
    canvasContainer.scrollTop = scrollTop - deltaY;
}

// Pan bitir
function endPan(e) {
    if (isPanning) {
        isPanning = false;
        canvasContainer.style.cursor = 'default';
        console.log('🖐️ Pan bitti');
    }
}

function startDrawing(e) {
    if (!imageLoaded) return;
    
    // Sağ tık ile pan yapılıyorsa çizim yapma
    if (e.button === 2 || e.button === 1) return;
    
    const coords = getCanvasCoordinates(e);
    const mouseX = coords.x;
    const mouseY = coords.y;
    
    // Çizgi modu aktifse - çizgi başlat
    if (isLineMode) {
        isDrawingLine = true;
        lineStartX = mouseX;
        lineStartY = mouseY;
        return;
    }
    
    // Metin modu aktifse - kutu çizimi başlat
    if (isTextMode) {
        isDrawingTextBox = true;
        textBoxStartX = mouseX;
        textBoxStartY = mouseY;
        return;
    }
    
    // Çizgi noktası sürükleme kontrolü (çizgileri düzenleme)
    const pointRadius = 8;
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        
        // Başlangıç noktası kontrolü
        const distStart = Math.sqrt(
            Math.pow(mouseX - line.x1, 2) + 
            Math.pow(mouseY - line.y1, 2)
        );
        
        if (distStart <= pointRadius) {
            isDraggingLinePoint = true;
            draggedLine = line;
            draggedPointIndex = 0;
            canvas.style.cursor = 'move';
            return;
        }
        
        // Bitiş noktası kontrolü
        const distEnd = Math.sqrt(
            Math.pow(mouseX - line.x2, 2) + 
            Math.pow(mouseY - line.y2, 2)
        );
        
        if (distEnd <= pointRadius) {
            isDraggingLinePoint = true;
            draggedLine = line;
            draggedPointIndex = 1;
            canvas.style.cursor = 'move';
            return;
        }
        
        // Çizgi gövdesi kontrolü (tamamını taşımak için)
        const lineLength = Math.sqrt(
            Math.pow(line.x2 - line.x1, 2) + 
            Math.pow(line.y2 - line.y1, 2)
        );
        
        // Noktadan çizgiye mesafe hesaplama (çizgi üzerinde mi?)
        const A = mouseX - line.x1;
        const B = mouseY - line.y1;
        const C = line.x2 - line.x1;
        const D = line.y2 - line.y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        const param = lenSq !== 0 ? dot / lenSq : -1;
        
        let closestX, closestY;
        
        if (param < 0) {
            closestX = line.x1;
            closestY = line.y1;
        } else if (param > 1) {
            closestX = line.x2;
            closestY = line.y2;
        } else {
            closestX = line.x1 + param * C;
            closestY = line.y1 + param * D;
        }
        
        const distToLine = Math.sqrt(
            Math.pow(mouseX - closestX, 2) + 
            Math.pow(mouseY - closestY, 2)
        );
        
        if (distToLine <= 5) { // Çizgiye 5px yakınsa
            isDraggingLine = true;
            draggedLine = line;
            lineDragOffsetX = mouseX - line.x1;
            lineDragOffsetY = mouseY - line.y1;
            canvas.style.cursor = 'move';
            return;
        }
    }
    
    // Metin kutusu köşe tutamak kontrolü (önce tutamak, sonra sürükleme)
    const handleSize = 8;
    for (let i = textAnnotations.length - 1; i >= 0; i--) {
        const textAnn = textAnnotations[i];
        
        if (textAnn.isBoxText && textAnn.width && textAnn.height) {
            // Köşeleri kontrol et
            const handles = [
                { x: textAnn.x, y: textAnn.y, type: 'tl' }, // top-left
                { x: textAnn.x + textAnn.width, y: textAnn.y, type: 'tr' }, // top-right
                { x: textAnn.x, y: textAnn.y + textAnn.height, type: 'bl' }, // bottom-left
                { x: textAnn.x + textAnn.width, y: textAnn.y + textAnn.height, type: 'br' } // bottom-right
            ];
            
            for (let handle of handles) {
                const distance = Math.sqrt(
                    Math.pow(mouseX - handle.x, 2) + 
                    Math.pow(mouseY - handle.y, 2)
                );
                
                if (distance <= handleSize) {
                    isResizingTextBox = true;
                    resizingTextBox = textAnn;
                    resizeHandle = handle.type;
                    resizeStartX = mouseX;
                    resizeStartY = mouseY;
                    canvas.style.cursor = handle.type === 'tl' || handle.type === 'br' ? 'nwse-resize' : 'nesw-resize';
                    return;
                }
            }
        }
    }
    
    // Metin sürükleme kontrolü
    for (let i = textAnnotations.length - 1; i >= 0; i--) {
        const textAnn = textAnnotations[i];
        
        // Kutu içi metin ise
        if (textAnn.isBoxText && textAnn.width && textAnn.height) {
            if (mouseX >= textAnn.x && mouseX <= textAnn.x + textAnn.width &&
                mouseY >= textAnn.y && mouseY <= textAnn.y + textAnn.height) {
                isDraggingText = true;
                draggedText = textAnn;
                canvas.style.cursor = 'grabbing';
                return;
            }
        } else {
            // Normal metin
            ctx.font = `bold ${textAnn.fontSize}px ${textAnn.fontFamily || 'Arial'}`;
            const textWidth = ctx.measureText(textAnn.text).width;
            const textHeight = textAnn.fontSize;
            
            if (mouseX >= textAnn.x && mouseX <= textAnn.x + textWidth &&
                mouseY >= textAnn.y && mouseY <= textAnn.y + textHeight) {
                isDraggingText = true;
                draggedText = textAnn;
                canvas.style.cursor = 'grabbing';
                return;
            }
        }
    }
    
    // Önce bir balonun üzerine tıklanıp tıklanmadığını kontrol et
    for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        if (ann.balloon) {
            const balloonSize = ann.balloonSize || 20;
            const distance = Math.sqrt(
                Math.pow(mouseX - ann.balloon.x, 2) + 
                Math.pow(mouseY - ann.balloon.y, 2)
            );
            
            if (distance <= balloonSize) { // Balon boyutuna göre tıklama alanı
                isDraggingBalloon = true;
                draggedBalloon = ann;
                dragOffsetX = mouseX - ann.balloon.x;
                dragOffsetY = mouseY - ann.balloon.y;
                canvas.style.cursor = 'grabbing';
                return; // Balon sürüklemeye başladık, dikdörtgen çizme
            }
        }
    }
    
    // Balon sürüklenmiyorsa dikdörtgen çizmeye başla
    isDrawing = true;
    startX = mouseX;
    startY = mouseY;
}

function draw(e) {
    const coords = getCanvasCoordinates(e);
    const mouseX = coords.x;
    const mouseY = coords.y;
    
    // Çizgi noktası sürükleniyorsa
    if (isDraggingLinePoint && draggedLine) {
        // Snap kontrolü - metin kutularına yakın mı?
        let snappedX = mouseX;
        let snappedY = mouseY;
        const snapDistance = 15;
        
        for (let textAnn of textAnnotations) {
            if (textAnn.isBoxText && textAnn.width && textAnn.height) {
                // Kutu kenarlarına snap
                const edges = [
                    { x: textAnn.x, y: textAnn.y }, // Sol üst
                    { x: textAnn.x + textAnn.width, y: textAnn.y }, // Sağ üst
                    { x: textAnn.x, y: textAnn.y + textAnn.height }, // Sol alt
                    { x: textAnn.x + textAnn.width, y: textAnn.y + textAnn.height }, // Sağ alt
                    { x: textAnn.x + textAnn.width / 2, y: textAnn.y }, // Üst orta
                    { x: textAnn.x + textAnn.width / 2, y: textAnn.y + textAnn.height }, // Alt orta
                    { x: textAnn.x, y: textAnn.y + textAnn.height / 2 }, // Sol orta
                    { x: textAnn.x + textAnn.width, y: textAnn.y + textAnn.height / 2 } // Sağ orta
                ];
                
                for (let edge of edges) {
                    const dist = Math.sqrt(
                        Math.pow(mouseX - edge.x, 2) + 
                        Math.pow(mouseY - edge.y, 2)
                    );
                    
                    if (dist < snapDistance) {
                        snappedX = edge.x;
                        snappedY = edge.y;
                        break;
                    }
                }
            }
        }
        
        if (draggedPointIndex === 0) {
            draggedLine.x1 = snappedX;
            draggedLine.y1 = snappedY;
        } else {
            draggedLine.x2 = snappedX;
            draggedLine.y2 = snappedY;
        }
        
        redrawCanvas();
        return;
    }
    
    // Çizgi taşıma (tamamını)
    if (isDraggingLine && draggedLine) {
        const newX1 = mouseX - lineDragOffsetX;
        const newY1 = mouseY - lineDragOffsetY;
        const deltaX = newX1 - draggedLine.x1;
        const deltaY = newY1 - draggedLine.y1;
        
        draggedLine.x1 = newX1;
        draggedLine.y1 = newY1;
        draggedLine.x2 += deltaX;
        draggedLine.y2 += deltaY;
        
        redrawCanvas();
        return;
    }
    
    // Çizgi çiziliyorsa
    if (isDrawingLine) {
        redrawCanvas();
        
        // Snap kontrolü
        let snappedX = mouseX;
        let snappedY = mouseY;
        const snapDistance = 15;
        
        for (let textAnn of textAnnotations) {
            if (textAnn.isBoxText && textAnn.width && textAnn.height) {
                const edges = [
                    { x: textAnn.x, y: textAnn.y },
                    { x: textAnn.x + textAnn.width, y: textAnn.y },
                    { x: textAnn.x, y: textAnn.y + textAnn.height },
                    { x: textAnn.x + textAnn.width, y: textAnn.y + textAnn.height },
                    { x: textAnn.x + textAnn.width / 2, y: textAnn.y },
                    { x: textAnn.x + textAnn.width / 2, y: textAnn.y + textAnn.height },
                    { x: textAnn.x, y: textAnn.y + textAnn.height / 2 },
                    { x: textAnn.x + textAnn.width, y: textAnn.y + textAnn.height / 2 }
                ];
                
                for (let edge of edges) {
                    const dist = Math.sqrt(
                        Math.pow(mouseX - edge.x, 2) + 
                        Math.pow(mouseY - edge.y, 2)
                    );
                    
                    if (dist < snapDistance) {
                        snappedX = edge.x;
                        snappedY = edge.y;
                        break;
                    }
                }
            }
        }
        
        // Geçici çizgi göster
        ctx.strokeStyle = currentLineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.lineTo(snappedX, snappedY);
        ctx.stroke();
        
        // Ok ucu çiz
        drawArrowHead(ctx, lineStartX, lineStartY, snappedX, snappedY);
        
        return;
    }
    
    // Metin kutusu boyutlandırılıyorsa
    if (isResizingTextBox && resizingTextBox) {
        const box = resizingTextBox;
        const oldX = box.x;
        const oldY = box.y;
        const oldWidth = box.width;
        const oldHeight = box.height;
        
        const deltaX = mouseX - resizeStartX;
        const deltaY = mouseY - resizeStartY;
        
        switch(resizeHandle) {
            case 'tl': // Top-left
                box.x += deltaX;
                box.y += deltaY;
                box.width -= deltaX;
                box.height -= deltaY;
                break;
            case 'tr': // Top-right
                box.y += deltaY;
                box.width += deltaX;
                box.height -= deltaY;
                break;
            case 'bl': // Bottom-left
                box.x += deltaX;
                box.width -= deltaX;
                box.height += deltaY;
                break;
            case 'br': // Bottom-right
                box.width += deltaX;
                box.height += deltaY;
                break;
        }
        
        // Minimum boyut kontrolü
        if (box.width < 30) box.width = 30;
        if (box.height < 20) box.height = 20;
        
        // Snap edilmiş çizgileri güncelle
        const oldSnapPoints = [
            { x: oldX, y: oldY },
            { x: oldX + oldWidth, y: oldY },
            { x: oldX, y: oldY + oldHeight },
            { x: oldX + oldWidth, y: oldY + oldHeight },
            { x: oldX + oldWidth / 2, y: oldY },
            { x: oldX + oldWidth / 2, y: oldY + oldHeight },
            { x: oldX, y: oldY + oldHeight / 2 },
            { x: oldX + oldWidth, y: oldY + oldHeight / 2 }
        ];
        
        const newSnapPoints = [
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x, y: box.y + box.height },
            { x: box.x + box.width, y: box.y + box.height },
            { x: box.x + box.width / 2, y: box.y },
            { x: box.x + box.width / 2, y: box.y + box.height },
            { x: box.x, y: box.y + box.height / 2 },
            { x: box.x + box.width, y: box.y + box.height / 2 }
        ];
        
        const snapThreshold = 2;
        
        lines.forEach(line => {
            for (let i = 0; i < oldSnapPoints.length; i++) {
                const oldPoint = oldSnapPoints[i];
                const newPoint = newSnapPoints[i];
                
                // Başlangıç noktası bu snap noktasına bağlı mı?
                const dist1 = Math.sqrt(
                    Math.pow(line.x1 - oldPoint.x, 2) + 
                    Math.pow(line.y1 - oldPoint.y, 2)
                );
                if (dist1 < snapThreshold) {
                    line.x1 = newPoint.x;
                    line.y1 = newPoint.y;
                }
                
                // Bitiş noktası bu snap noktasına bağlı mı?
                const dist2 = Math.sqrt(
                    Math.pow(line.x2 - oldPoint.x, 2) + 
                    Math.pow(line.y2 - oldPoint.y, 2)
                );
                if (dist2 < snapThreshold) {
                    line.x2 = newPoint.x;
                    line.y2 = newPoint.y;
                }
            }
        });
        
        resizeStartX = mouseX;
        resizeStartY = mouseY;
        
        redrawCanvas();
        return;
    }
    
    // Metin kutusu çiziliyorsa
    if (isDrawingTextBox) {
        redrawCanvas();
        
        // Geçici metin kutusunu çiz
        const width = mouseX - textBoxStartX;
        const height = mouseY - textBoxStartY;
        
        ctx.strokeStyle = currentTextColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(textBoxStartX, textBoxStartY, width, height);
        ctx.setLineDash([]);
        
        return;
    }
    
    // Metin sürükleniyorsa
    if (isDraggingText && draggedText) {
        const oldX = draggedText.x;
        const oldY = draggedText.y;
        const deltaX = mouseX - oldX;
        const deltaY = mouseY - oldY;
        
        draggedText.x = mouseX;
        draggedText.y = mouseY;
        
        // Eğer metin kutusu ise, bağlı çizgileri de taşı
        if (draggedText.isBoxText && draggedText.width && draggedText.height) {
            // Bu kutuya snap edilmiş çizgileri bul ve taşı
            lines.forEach(line => {
                // Çizginin başlangıç noktası bu kutunun snap noktalarından birine yakın mı?
                const snapPoints = [
                    { x: oldX, y: oldY },
                    { x: oldX + draggedText.width, y: oldY },
                    { x: oldX, y: oldY + draggedText.height },
                    { x: oldX + draggedText.width, y: oldY + draggedText.height },
                    { x: oldX + draggedText.width / 2, y: oldY },
                    { x: oldX + draggedText.width / 2, y: oldY + draggedText.height },
                    { x: oldX, y: oldY + draggedText.height / 2 },
                    { x: oldX + draggedText.width, y: oldY + draggedText.height / 2 }
                ];
                
                const snapThreshold = 2; // Çok küçük threshold - tam snap kontrolü
                
                snapPoints.forEach(point => {
                    // Başlangıç noktası snap edilmiş mi?
                    const dist1 = Math.sqrt(
                        Math.pow(line.x1 - point.x, 2) + 
                        Math.pow(line.y1 - point.y, 2)
                    );
                    if (dist1 < snapThreshold) {
                        line.x1 += deltaX;
                        line.y1 += deltaY;
                    }
                    
                    // Bitiş noktası snap edilmiş mi?
                    const dist2 = Math.sqrt(
                        Math.pow(line.x2 - point.x, 2) + 
                        Math.pow(line.y2 - point.y, 2)
                    );
                    if (dist2 < snapThreshold) {
                        line.x2 += deltaX;
                        line.y2 += deltaY;
                    }
                });
            });
        }
        
        redrawCanvas();
        return;
    }
    
    // Balon sürükleniyorsa
    if (isDraggingBalloon && draggedBalloon) {
        let newX = mouseX - dragOffsetX;
        let newY = mouseY - dragOffsetY;
        
        // Snap-to-guide kontrolü (diğer balonlarla hizalama)
        snapGuides = { x: null, y: null };
        
        annotations.forEach(ann => {
            if (ann === draggedBalloon || !ann.balloon) return;
            
            // Her iki balonun boyutunu al
            const draggedSize = draggedBalloon.balloonSize || 20;
            const otherSize = ann.balloonSize || 20;
            const requiredDistance = draggedSize + otherSize + 10; // İki yarıçap + 10px boşluk
            
            // Yatay hizalama kontrolü (aynı Y koordinatı)
            if (Math.abs(newY - ann.balloon.y) < snapThreshold) {
                const xDistance = Math.abs(newX - ann.balloon.x);
                // Sadece X mesafesi yeterliyse hizala
                if (xDistance >= requiredDistance) {
                    newY = ann.balloon.y; // Snap yap
                    snapGuides.y = ann.balloon.y; // Sanal çizgi kaydet
                }
            }
            
            // Dikey hizalama kontrolü (aynı X koordinatı)
            if (Math.abs(newX - ann.balloon.x) < snapThreshold) {
                const yDistance = Math.abs(newY - ann.balloon.y);
                // Sadece Y mesafesi yeterliyse hizala
                if (yDistance >= requiredDistance) {
                    newX = ann.balloon.x; // Snap yap
                    snapGuides.x = ann.balloon.x; // Sanal çizgi kaydet
                }
            }
        });
        
        // SON KONTROL: Hizalamadan sonra hiçbir balonla çakışma olmasın
        annotations.forEach(ann => {
            if (ann === draggedBalloon || !ann.balloon) return;
            
            const draggedSize = draggedBalloon.balloonSize || 20;
            const otherSize = ann.balloonSize || 20;
            const minDistance = draggedSize + otherSize + 5; // Minimum toplam mesafe
            
            // İki balon arasındaki gerçek mesafe
            const actualDistance = Math.sqrt(
                Math.pow(newX - ann.balloon.x, 2) + 
                Math.pow(newY - ann.balloon.y, 2)
            );
            
            // Eğer çok yakınlarsa, hizalamayı iptal et
            if (actualDistance < minDistance) {
                // Hizalamayı geri al - orijinal mouse pozisyonunu kullan
                newX = mouseX - dragOffsetX;
                newY = mouseY - dragOffsetY;
                snapGuides = { x: null, y: null }; // Snap çizgilerini kaldır
            }
        });
        
        draggedBalloon.balloon.x = newX;
        draggedBalloon.balloon.y = newY;
        
        redrawCanvas();
        drawSnapGuides(); // Sanal çizgileri çiz
        return;
    }
    
    // Dikdörtgen çiziliyorsa
    if (isDrawing && imageLoaded) {
        const currentX = mouseX;
        const currentY = mouseY;
        
        redrawCanvas();
        
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
        return;
    }
    
    // Mouse bir balonun üzerinde mi kontrol et (cursor değiştir)
    if (imageLoaded && !isDrawing && !isDraggingBalloon) {
        let overBalloon = false;
        
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (ann.balloon) {
                const distance = Math.sqrt(
                    Math.pow(mouseX - ann.balloon.x, 2) + 
                    Math.pow(mouseY - ann.balloon.y, 2)
                );
                
                if (distance <= 15) {
                    overBalloon = true;
                    break;
                }
            }
        }
        
        canvas.style.cursor = overBalloon ? 'grab' : 'crosshair';
    }
    
    // Metin kutusu hover kontrolü
    if (imageLoaded && !isDrawing && !isDraggingText && !isResizingTextBox && !isDrawingTextBox) {
        let foundHover = false;
        
        for (let i = textAnnotations.length - 1; i >= 0; i--) {
            const textAnn = textAnnotations[i];
            
            if (textAnn.isBoxText && textAnn.width && textAnn.height) {
                if (mouseX >= textAnn.x && mouseX <= textAnn.x + textAnn.width &&
                    mouseY >= textAnn.y && mouseY <= textAnn.y + textAnn.height) {
                    if (hoveredTextBox !== textAnn) {
                        hoveredTextBox = textAnn;
                        redrawCanvas();
                    }
                    foundHover = true;
                    break;
                }
            }
        }
        
        if (!foundHover && hoveredTextBox !== null) {
            hoveredTextBox = null;
            redrawCanvas();
        }
    }
}

async function endDrawing(e) {
    // Çizgi noktası sürükleme bittiğinde
    if (isDraggingLinePoint) {
        isDraggingLinePoint = false;
        draggedLine = null;
        draggedPointIndex = -1;
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
        return;
    }
    
    // Çizgi taşıma bittiğinde
    if (isDraggingLine) {
        isDraggingLine = false;
        draggedLine = null;
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
        return;
    }
    
    // Çizgi çizimi bittiğinde
    if (isDrawingLine) {
        isDrawingLine = false;
        
        const coords = getCanvasCoordinates(e);
        const endX = coords.x;
        const endY = coords.y;
        
        // Snap kontrolü
        let snappedX = endX;
        let snappedY = endY;
        const snapDistance = 15;
        
        for (let textAnn of textAnnotations) {
            if (textAnn.isBoxText && textAnn.width && textAnn.height) {
                const edges = [
                    { x: textAnn.x, y: textAnn.y },
                    { x: textAnn.x + textAnn.width, y: textAnn.y },
                    { x: textAnn.x, y: textAnn.y + textAnn.height },
                    { x: textAnn.x + textAnn.width, y: textAnn.y + textAnn.height },
                    { x: textAnn.x + textAnn.width / 2, y: textAnn.y },
                    { x: textAnn.x + textAnn.width / 2, y: textAnn.y + textAnn.height },
                    { x: textAnn.x, y: textAnn.y + textAnn.height / 2 },
                    { x: textAnn.x + textAnn.width, y: textAnn.y + textAnn.height / 2 }
                ];
                
                for (let edge of edges) {
                    const dist = Math.sqrt(
                        Math.pow(endX - edge.x, 2) + 
                        Math.pow(endY - edge.y, 2)
                    );
                    
                    if (dist < snapDistance) {
                        snappedX = edge.x;
                        snappedY = edge.y;
                        break;
                    }
                }
            }
        }
        
        // Çizgi ekle
        const distance = Math.sqrt(
            Math.pow(snappedX - lineStartX, 2) + 
            Math.pow(snappedY - lineStartY, 2)
        );
        
        if (distance > 10) {
            const newLine = {
                id: Date.now(),
                x1: lineStartX,
                y1: lineStartY,
                x2: snappedX,
                y2: snappedY,
                color: currentLineColor
            };
            lines.push(newLine);
            addToHistory('line', newLine);
            redrawCanvas();
            showNotification('Çizgi eklendi!', 'success');
        } else {
            redrawCanvas();
        }
        
        return;
    }
    
    // Metin kutusu boyutlandırma bittiğinde
    if (isResizingTextBox) {
        isResizingTextBox = false;
        resizingTextBox = null;
        resizeHandle = null;
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
        return;
    }
    
    // Metin kutusu çizimi bittiğinde
    if (isDrawingTextBox) {
        isDrawingTextBox = false;
        
        const coords = getCanvasCoordinates(e);
        const endX = coords.x;
        const endY = coords.y;
        
        const width = Math.abs(endX - textBoxStartX);
        const height = Math.abs(endY - textBoxStartY);
        
        // Çok küçük kutular için işlem yapma
        if (width < 20 || height < 20) {
            redrawCanvas();
            return;
        }
        
        // Metin giriş modalı aç
        const text = prompt('Metin kutusuna eklemek istediğiniz metni girin:');
        if (text && text.trim() !== '') {
            const newTextBox = {
                id: Date.now(),
                x: Math.min(textBoxStartX, endX),
                y: Math.min(textBoxStartY, endY),
                width: width,
                height: height,
                text: text.trim(),
                color: currentTextColor,
                fontSize: currentTextSize,
                hasBox: currentTextBox === 'box', // Seçiciye göre kutu göster/gizle
                fontFamily: currentFontFamily,
                isBoxText: true, // Bu bir kutu içi metin
                textAlign: 'left', // Varsayılan hizalama
                verticalAlign: 'top' // Varsayılan dikey hizalama
            };
            textAnnotations.push(newTextBox);
            addToHistory('textBox', newTextBox);
            redrawCanvas();
            showNotification('Metin kutusu eklendi!', 'success');
        } else {
            redrawCanvas();
        }
        
        return;
    }
    
    // Metin sürükleme bittiğinde
    if (isDraggingText) {
        isDraggingText = false;
        draggedText = null;
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
        return;
    }
    
    // Balon sürükleme bittiğinde
    if (isDraggingBalloon) {
        isDraggingBalloon = false;
        draggedBalloon = null;
        snapGuides = { x: null, y: null }; // Sanal çizgileri temizle
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
        return;
    }
    
    // Dikdörtgen çizme bittiğinde
    if (!isDrawing || !imageLoaded) return;
    
    isDrawing = false;
    const rect = canvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const endY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    if (width < 5 || height < 5) {
        redrawCanvas();
        return;
    }
    
    const annotation = {
        id: Date.now(), // Benzersiz ID için timestamp
        number: balloonCounter, // Görünen balon numarası
        rect: {
            x: Math.min(startX, endX),
            y: Math.min(startY, endY),
            width: width,
            height: height
        },
        balloon: {
            x: endX + 50,
            y: startY - 20
        },
        balloonShape: currentBalloonShape, // Seçili şekil
        balloonColor: currentBalloonColor, // Seçili renk
        lineColor: currentLineColor, // Çizgi rengi
        textColor: currentTextColor, // Yazı rengi
        fillType: currentFillType, // Dolgu tipi
        balloonSize: currentBalloonSize, // Balon boyutu
        balloonTextSize: currentBalloonTextSize, // Balon yazı boyutu
        fontFamily: currentFontFamily, // Yazı stili
        dimension: '',
        lowerTolerance: '',
        upperTolerance: ''
    };
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📏 Seçim:', width.toFixed(0), 'x', height.toFixed(0));
    
    // Bellek uyarısı - çok fazla ölçü varsa
    if (annotations.length >= 15 && annotations.length % 5 === 0) {
        console.warn('⚠️ ', annotations.length, 'ölçü eklendi. Bellek dolmaya yaklaşıyor!');
        console.warn('💡 Çok fazla ölçü eklerseniz Out of Memory hatası alabilirsiniz.');
        console.warn('💡 Çözüm: Ara ara "Dışa Aktar" ile kaydedin ve sayfayı yenileyin.');
    }
    
    // ADIM 1: GELİŞMİŞ OCR
    console.log('🔤 Gelişmiş OCR başlatılıyor...');
    showLoading(true);
    
    let ocrResult = null;
    try {
        ocrResult = await performAdvancedOCR(annotation);
    } catch (err) {
        console.error('❌ OCR hatası:', err);
        ocrResult = null;
    }
    
    showLoading(false);
    
    if (ocrResult && ocrResult.text) {
        console.log(`✅✅✅ OCR BAŞARILI: "${ocrResult.text}" (Güven: ${ocrResult.confidence}%)`);
        
        // ÇOKLU ÖLÇÜ DESTEĞİ - Eğer birden fazla ölçü varsa
        if (ocrResult.allDimensions && ocrResult.allDimensions.length > 1) {
            console.log(`🔢 ${ocrResult.allDimensions.length} ölçü bulundu!`);
            
            // Kullanıcıya sor
            const confirmMsg = `${ocrResult.allDimensions.length} ölçü tespit edildi:\n\n` +
                ocrResult.allDimensions.map((d, i) => `${i+1}. ${d.text}`).join('\n') +
                `\n\nHepsini eklemek ister misiniz?`;
            
            if (confirm(confirmMsg)) {
                // Her ölçü için ayrı annotation oluştur
                let addedCount = 0;
                for (let i = 0; i < ocrResult.allDimensions.length; i++) {
                    const dim = ocrResult.allDimensions[i];
                    
                    // Yeni annotation nesnesi oluştur
                    const newAnnotation = {
                        id: Date.now() + i, // Benzersiz ID
                        number: balloonCounter + i,
                        rect: {
                            x: annotation.rect.x + (dim.box ? dim.box.x : 0),
                            y: annotation.rect.y + (dim.box ? dim.box.y : 0),
                            width: dim.box ? dim.box.width : annotation.rect.width / ocrResult.allDimensions.length,
                            height: dim.box ? dim.box.height : annotation.rect.height
                        },
                        balloon: {
                            x: annotation.balloon.x + (i * 60), // Balonları yan yana diz
                            y: annotation.balloon.y + (i * 30)
                        },
                        balloonShape: currentBalloonShape, // Seçili şekil
                        balloonColor: currentBalloonColor, // Seçili renk
                        lineColor: currentLineColor, // Çizgi rengi
                        textColor: currentTextColor, // Yazı rengi
                        fillType: currentFillType, // Dolgu tipi
                        balloonSize: currentBalloonSize, // Balon boyutu
                        balloonTextSize: currentBalloonTextSize, // Balon yazı boyutu
                        fontFamily: currentFontFamily, // Yazı stili
                        dimension: dim.text,
                        lowerTolerance: '',
                        upperTolerance: ''
                    };
                    
                    applyDefaultTolerances(newAnnotation);
                    annotations.push(newAnnotation);
                    addTableRow(newAnnotation);
                    addedCount++;
                }
                
                balloonCounter += addedCount;
                redrawCanvas();
                showNotification(`✓ ${addedCount} ölçü eklendi (OCR)`, 'success');
            } else {
                // Sadece ilk ölçüyü kullan
                const parsed = parseToleranceFromText(ocrResult.text);
                annotation.dimension = parsed.dimension;
                annotation.lowerTolerance = parsed.lowerTolerance || annotation.lowerTolerance;
                annotation.upperTolerance = parsed.upperTolerance || annotation.upperTolerance;
                
                // Tolerans yoksa varsayılanları uygula
                if (!parsed.lowerTolerance && !parsed.upperTolerance) {
                    applyDefaultTolerances(annotation);
                }
                
                annotations.push(annotation);
                addToHistory('annotation', annotation);
                addTableRow(annotation);
                balloonCounter++;
                redrawCanvas();
                highlightSuccess(annotation.id, 'ocr');
                showNotification(`✓ ${parsed.dimension} (OCR)`, 'success');
            }
        } else {
            // Tek ölçü - normal akış
            const parsed = parseToleranceFromText(ocrResult.text);
            annotation.dimension = parsed.dimension;
            annotation.lowerTolerance = parsed.lowerTolerance || annotation.lowerTolerance;
            annotation.upperTolerance = parsed.upperTolerance || annotation.upperTolerance;
            
            // Tolerans yoksa varsayılanları uygula
            if (!parsed.lowerTolerance && !parsed.upperTolerance) {
                applyDefaultTolerances(annotation);
            }
            
            annotations.push(annotation);
            addToHistory('annotation', annotation);
            addTableRow(annotation);
            balloonCounter++;
            redrawCanvas();
            highlightSuccess(annotation.id, 'ocr');
            showNotification(`✓ ${parsed.dimension} (OCR)`, 'success');
        }
        
        // Bellek temizliği - OCR sonuçlarını serbest bırak
        if (ocrResult.allDimensions) ocrResult.allDimensions = null;
        if (ocrResult.wordBoxes) ocrResult.wordBoxes = null;
        
        ocrStats.success++;
        
        // CRITICAL: Agresif bellek temizliği
        ocrCounter++;
        
        // Her 3 OCR'da worker'a temizlik komutu gönder
        if (ocrCounter % 3 === 0) {
            console.log('🧹 Bellek temizliği yapılıyor... (OCR #' + ocrCounter + ')');
            
            if (ocrWorker) {
                ocrWorker.postMessage({ type: 'CLEAR_MEMORY' });
            }
            
            // Ana thread temizliği
            setTimeout(() => {
                console.clear();
                
                // Garbage collection (Chrome DevTools)
                if (typeof gc === 'function') {
                    gc();
                    console.log('✅ Manuel GC çalıştırıldı');
                }
                
                // Kullanılmayan canvas'ları temizle
                const canvases = document.querySelectorAll('canvas');
                canvases.forEach(c => {
                    if (c !== canvas && c.width > 100) {
                        c.width = 1;
                        c.height = 1;
                    }
                });
            }, 100);
        }
        
        // Her 10 OCR'da kullanıcıyı uyar
        if (ocrCounter % 10 === 0) {
            console.warn('⚠️ ' + ocrCounter + ' OCR tamamlandı!');
            console.warn('💡 Bellek tasarrufu için ara ara "Dışa Aktar" ile kaydedin.');
        }
        
        return;
    }
    
    console.log('❌ OCR başarısız oldu');
    ocrStats.failed++;
    
    // ADIM 2: VERİTABANI - DEVRE DIŞI (Bellek tasarrufu)
    // console.log('🔍 Veritabanı kontrol...');
    // const match = findMatch(annotation);
    // ... VERİTABANI KODU KALDIRILDI
    
    // ADIM 3: MANUEL GİRİŞ (OCR başarısız olduysa)
    console.log('❓ Manuel giriş gerekli');
    openModal(annotation, null); // match yerine null
}

function cancelDrawing() {
    if (isDrawing) {
        isDrawing = false;
        redrawCanvas();
    }
    
    if (isDrawingTextBox) {
        isDrawingTextBox = false;
        redrawCanvas();
    }
    
    if (isResizingTextBox) {
        isResizingTextBox = false;
        resizingTextBox = null;
        resizeHandle = null;
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
    }
    
    if (isDraggingBalloon) {
        isDraggingBalloon = false;
        draggedBalloon = null;
        snapGuides = { x: null, y: null };
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
    }
    
    if (isDraggingText) {
        isDraggingText = false;
        draggedText = null;
        canvas.style.cursor = 'crosshair';
        redrawCanvas();
    }
    
    if (hoveredTextBox) {
        hoveredTextBox = null;
        redrawCanvas();
    }
}
// Çift tıklama ile metin düzenleme
function handleDoubleClick(e) {
    if (!imageLoaded) return;
    
    const coords = getCanvasCoordinates(e);
    const mouseX = coords.x;
    const mouseY = coords.y;
    
    // Metin üzerine çift tıklanmış mı kontrol et
    for (let i = textAnnotations.length - 1; i >= 0; i--) {
        const textAnn = textAnnotations[i];
        
        let isInside = false;
        
        // Kutu içi metin ise
        if (textAnn.isBoxText && textAnn.width && textAnn.height) {
            isInside = mouseX >= textAnn.x && mouseX <= textAnn.x + textAnn.width &&
                       mouseY >= textAnn.y && mouseY <= textAnn.y + textAnn.height;
        } else {
            // Normal metin
            ctx.font = `bold ${textAnn.fontSize}px ${textAnn.fontFamily || 'Arial'}`;
            const textWidth = ctx.measureText(textAnn.text).width;
            const textHeight = textAnn.fontSize;
            
            isInside = mouseX >= textAnn.x && mouseX <= textAnn.x + textWidth &&
                       mouseY >= textAnn.y && mouseY <= textAnn.y + textHeight;
        }
        
        if (isInside) {
            
            const newText = prompt('Metni düzenleyin:', textAnn.text);
            if (newText !== null && newText.trim() !== '') {
                textAnn.text = newText.trim();
                redrawCanvas();
                showNotification('Metin güncellendi!', 'success');
            } else if (newText !== null && newText.trim() === '') {
                // Boş metin girilirse sil
                if (confirm('Metni silmek istiyor musunuz?')) {
                    textAnnotations.splice(i, 1);
                    redrawCanvas();
                    showNotification('Metin silindi', 'success');
                }
            }
            return;
        }
    }
}

// Sanal hizalama çizgilerini çiz
function drawSnapGuides() {
    if (!snapGuides.x && !snapGuides.y) return;
    
    ctx.save();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    // Dikey sanal çizgi (X hizalaması)
    if (snapGuides.x !== null) {
        ctx.beginPath();
        ctx.moveTo(snapGuides.x, 0);
        ctx.lineTo(snapGuides.x, canvas.height);
        ctx.stroke();
    }
    
    // Yatay sanal çizgi (Y hizalaması)
    if (snapGuides.y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, snapGuides.y);
        ctx.lineTo(canvas.width, snapGuides.y);
        ctx.stroke();
    }
    
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// GELİŞMİŞ OCR SİSTEMİ - 3 ALTERNATİF
// ═══════════════════════════════════════════════════════════

async function performAdvancedOCR(annotation) {
    ocrStats.attempts++;
    
    // Görüntüyü hazırla - ASYNC oldu!
    let imageData = await prepareImageForOCR(annotation);
    
    let result = null;
    
    // Aktif OCR servislerini dene
    if (OCR_CONFIG.ocrspace.enabled) {
        console.log('📡 OCR.space API deneniyor...');
        result = await ocrWithOCRSpace(imageData);
        if (result) {
            // Bellek temizliği: base64 string'i artık gereksiz
            imageData = null;
            return result;
        }
    }
    
    if (OCR_CONFIG.google.enabled) {
        console.log('📡 Google Vision API deneniyor...');
        result = await ocrWithGoogle(imageData);
        if (result) {
            imageData = null;
            return result;
        }
    }
    
    if (OCR_CONFIG.mathpix.enabled) {
        console.log('📡 Mathpix API deneniyor...');
        result = await ocrWithMathpix(imageData);
        if (result) {
            imageData = null;
            return result;
        }
    }
    
    // Temizlik
    imageData = null;
    return null;
}

// Görüntüyü OCR için hazırla - MİNİMAL BOYUT
function prepareImageForOCR(annotation) {
    // SCALE YOK - Sadece seçilen alanı al, padding bile yok
    const w = Math.floor(annotation.rect.width);
    const h = Math.floor(annotation.rect.height);
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCanvas.width = w;
    tempCanvas.height = h;
    
    // Sadece seçilen alanı kopyala - PADDING YOK
    tempCtx.drawImage(
        canvas,
        annotation.rect.x,
        annotation.rect.y,
        annotation.rect.width,
        annotation.rect.height,
        0, 0,
        w, h
    );
    
    // Kontrast artırma - HAFİF
    const imageData = tempCtx.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        let gray = (data[i] + data[i+1] + data[i+2]) / 3;
        
        // Basit threshold
        const threshold = 128;
        if (gray < threshold) {
            data[i] = data[i+1] = data[i+2] = 0;
        } else {
            data[i] = data[i+1] = data[i+2] = 255;
        }
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    
    // BLOB URL kullan - Base64'ten daha az bellek
    return new Promise((resolve) => {
        tempCanvas.toBlob((blob) => {
            if (!blob) {
                // Fallback: JPEG base64
                const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
                tempCanvas.width = 1;
                tempCanvas.height = 1;
                resolve(dataUrl);
                return;
            }
            
            const reader = new FileReader();
            reader.onloadend = function() {
                const base64 = reader.result;
                const sizeKB = (base64.length * 0.75 / 1024).toFixed(2);
                console.log('🖼️ OCR Görüntüsü:', w, 'x', h, '| Boyut:', sizeKB, 'KB');
                
                // Canvas temizle
                tempCanvas.width = 1;
                tempCanvas.height = 1;
                
                resolve(base64);
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.7); // 0.7 kalite - daha az yer
    });
}

// OCR.space API - WEB WORKER İLE
async function ocrWithOCRSpace(base64Image) {
    try {
        console.log('📤 OCR.space API çağrısı başlıyor...');
        
        // API key kontrolü
        if (!OCR_CONFIG.ocrspace.apiKey || OCR_CONFIG.ocrspace.apiKey === 'YOUR_API_KEY') {
            console.error('❌ OCR.space API key eksik!');
            alert('OCR.space API key tanımlı değil!\n\n"⚙️ API Ayarları" butonuna tıklayıp API key girin.');
            return null;
        }
        
        // WEB WORKER KULLANIMI - Bellek yönetimi için
        if (ocrWorker) {
            console.log('🔧 Web Worker ile OCR işleniyor...');
            
            try {
                const workerResult = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('OCR timeout (60s)'));
                }, 60000);
                
                ocrWorker.onmessage = function(e) {
                    clearTimeout(timeout);
                    
                    if (e.data.type === 'OCR_SUCCESS') {
                        const rawResult = e.data.data;
                        
                        if (!rawResult || !rawResult.text) {
                            resolve(null);
                            return;
                        }
                        
                        console.log('📝 OCR.space Ham (worker):', rawResult.text);
                        console.log(`📦 ${rawResult.words.length} kelime bulundu`);
                        
                        // Tüm geçerli ölçüleri bul
                        let allDimensions = [];
                        
                        if (rawResult.words.length === 0) {
                            // Koordinat yoksa satır satır
                            const lines = rawResult.text.split(/[\r\n]+/).filter(line => line.trim().length > 0);
                            for (let line of lines) {
                                const cleaned = cleanOCRText(line.trim());
                                if (cleaned && isValidDimension(cleaned)) {
                                    allDimensions.push({ text: cleaned, box: null });
                                }
                            }
                        } else {
                            // Kelime koordinatları ile
                            for (let word of rawResult.words) {
                                const cleaned = cleanOCRText(word.text);
                                if (cleaned && isValidDimension(cleaned)) {
                                    allDimensions.push({
                                        text: cleaned,
                                        box: {
                                            x: word.left,
                                            y: word.top,
                                            width: word.width,
                                            height: word.height
                                        }
                                    });
                                }
                            }
                        }
                        
                        console.log(`🎯 ${allDimensions.length} geçerli ölçü bulundu`);
                        
                        if (allDimensions.length > 0) {
                            resolve({
                                text: allDimensions[0].text,
                                confidence: 90,
                                source: 'OCR.space (Worker)',
                                allDimensions: allDimensions
                            });
                        } else {
                            resolve(null);
                        }
                    } else if (e.data.type === 'OCR_ERROR') {
                        console.error('❌ Worker OCR hatası:', e.data.error);
                        reject(new Error(e.data.error));
                    }
                };
                
                ocrWorker.onerror = function(error) {
                    clearTimeout(timeout);
                    console.error('❌ Worker hatası:', error);
                    reject(error);
                };
                
                // Worker'a gönder
                try {
                    ocrWorker.postMessage({
                        type: 'OCR_REQUEST',
                        data: {
                            base64Image: base64Image,
                            apiKey: OCR_CONFIG.ocrspace.apiKey,
                            endpoint: OCR_CONFIG.ocrspace.endpoint
                        }
                    });
                } catch (err) {
                    clearTimeout(timeout);
                    console.error('❌ Worker postMessage hatası:', err);
                    reject(err);
                }
            });
            
            // Worker başarılı olduysa sonucu döndür
            if (workerResult) {
                return workerResult;
            }
            } catch (workerError) {
                console.error('❌ Worker hatası, fallback kullanılacak:', workerError.message);
                // Worker başarısız, fallback'e devam et
            }
        }
        
        // FALLBACK - Worker yoksa veya başarısız olduysa normal fetch
        
        const formData = new FormData();
        formData.append('base64Image', base64Image);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'true'); // Kelime koordinatları için TRUE
        formData.append('OCREngine', '2'); // Engine 2 teknik resimler için
        formData.append('scale', 'true');
        formData.append('isTable', 'false');
        formData.append('detectOrientation', 'true'); // Oryantasyon algıla
        formData.append('filetype', 'PNG'); // Format belirt
        
        // Timeout ile fetch (60 saniye - daha uzun)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        console.log('⏳ API isteği gönderiliyor...');
        
        const response = await fetch(OCR_CONFIG.ocrspace.endpoint, {
            method: 'POST',
            headers: {
                'apikey': OCR_CONFIG.ocrspace.apiKey
            },
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('📡 API yanıt kodu:', response.status);        if (!response.ok) {
            console.error('❌ API HTTP hatası:', response.status, response.statusText);
            return null;
        }
        
        console.log('📥 OCR.space yanıt alındı, parse ediliyor...');
        const result = await response.json();
        
        // CRITICAL: Büyük objeyi console'a YAZMA - bellek şişer!
        // console.log('📋 OCR.space yanıt:', result);
        // console.log('📦 OCR.space Tam Yanıt:', JSON.stringify(result, null, 2));
        
        // Hata kontrolü
        if (result.OCRExitCode > 1 || result.IsErroredOnProcessing) {
            console.error('❌ OCR.space Hatası:', result.ErrorMessage || result.ErrorDetails);
            return null;
        }
        
        if (result.ParsedResults && result.ParsedResults.length > 0) {
            let text = result.ParsedResults[0].ParsedText.trim();
            
            console.log('📝 OCR.space Ham (tüm metin):', text);
            
            // TextOverlay'den kelime koordinatlarını al
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
            
            console.log(`📦 Toplam ${words.length} kelime bulundu`);
            
            // TÜM GEÇERLİ ÖLÇÜLERİ TOPLA
            let allDimensions = [];
            
            if (words.length === 0) {
                // Koordinat yoksa satır satır işle
                const lines = text.split(/[\r\n]+/).filter(line => line.trim().length > 0);
                for (let line of lines) {
                    const cleaned = cleanOCRText(line.trim());
                    if (cleaned && isValidDimension(cleaned)) {
                        allDimensions.push({
                            text: cleaned,
                            box: null
                        });
                    }
                }
            } else {
                // Her kelimeyi kontrol et
                for (let word of words) {
                    const cleaned = cleanOCRText(word.text);
                    if (cleaned && isValidDimension(cleaned)) {
                        allDimensions.push({
                            text: cleaned,
                            box: {
                                x: word.left,
                                y: word.top,
                                width: word.width,
                                height: word.height
                            }
                        });
                    }
                }
            }
            
            console.log(`🎯 Toplam ${allDimensions.length} geçerli ölçü bulundu`);
            
            if (allDimensions.length > 0) {
                // İlk ölçüyü ana metin olarak kullan
                const returnValue = {
                    text: allDimensions[0].text,
                    confidence: 90,
                    source: 'OCR.space',
                    allDimensions: allDimensions // Çoklu ölçü desteği için
                };
                
                // Temizlik
                result.ParsedResults = null;
                if (result.TextOverlay) result.TextOverlay = null;
                
                return returnValue;
            }
        }
        
        console.log('⚠️ OCR.space sonuç bulunamadı');
        
        // Başarısız durumda da temizlik
        result.ParsedResults = null;
        result.TextOverlay = null;
        
        return null;
        
    } catch (error) {
        showLoading(false);
        
        if (error.name === 'AbortError') {
            console.error('⏱️ OCR.space zaman aşımı (60 saniye)');
            alert('OCR işlemi zaman aşımına uğradı (60 saniye).\n\nLütfen daha küçük bir alan seçin veya internet bağlantınızı kontrol edin.');
        } else {
            console.error('❌ OCR.space hatası:', error.message || error);
            console.error('Hata detayı:', error);
            alert(`OCR hatası: ${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin veya API ayarlarını kontrol edin.`);
        }
        return null;
    }
}

// Google Cloud Vision API
async function ocrWithGoogle(base64Image) {
    try {
        // Base64'ten data: prefix'ini kaldır
        const imageContent = base64Image.split(',')[1];
        
        const requestBody = {
            requests: [{
                image: { content: imageContent },
                features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
            }]
        };
        
        const response = await fetch(
            `${OCR_CONFIG.google.endpoint}?key=${OCR_CONFIG.google.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }
        );
        
        const result = await response.json();
        
        if (result.responses && result.responses[0].textAnnotations) {
            let text = result.responses[0].textAnnotations[0].description.trim();
            
            console.log('📝 Google Vision Ham:', text);
            
            text = cleanOCRText(text);
            
            if (text && isValidDimension(text)) {
                return {
                    text: text,
                    confidence: 98,
                    source: 'Google Vision'
                };
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Google Vision hatası:', error);
        return null;
    }
}

// Mathpix API (Teknik resimler için en iyi)
async function ocrWithMathpix(base64Image) {
    try {
        const response = await fetch(OCR_CONFIG.mathpix.endpoint, {
            method: 'POST',
            headers: {
                'app_id': OCR_CONFIG.mathpix.appId,
                'app_key': OCR_CONFIG.mathpix.appKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                src: base64Image,
                formats: ['text'],
                ocr: ['text', 'math']
            })
        });
        
        const result = await response.json();
        
        if (result.text) {
            let text = result.text.trim();
            
            console.log('📝 Mathpix Ham:', text);
            
            text = cleanOCRText(text);
            
            if (text && isValidDimension(text)) {
                return {
                    text: text,
                    confidence: result.confidence || 90,
                    source: 'Mathpix'
                };
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Mathpix hatası:', error);
        return null;
    }
}

// Ölçü metninden toleransları ayıkla
function parseToleranceFromText(text) {
    if (!text) return { dimension: '', lowerTolerance: '', upperTolerance: '' };
    
    // "27 ±1" veya "27±1" formatı
    const plusMinusPattern = /^([\d,\.]+)\s*[±]\s*([\d,\.]+)$/;
    const plusMinusMatch = text.match(plusMinusPattern);
    if (plusMinusMatch) {
        const dimension = plusMinusMatch[1];
        const tolerance = plusMinusMatch[2];
        return {
            dimension: dimension,
            lowerTolerance: '-' + tolerance,
            upperTolerance: tolerance
        };
    }
    
    // "27 +1/-0.5" formatı
    const separatePattern = /^([\d,\.]+)\s*[+]([\d,\.]+)\s*\/\s*[-]?([\d,\.]+)$/;
    const separateMatch = text.match(separatePattern);
    if (separateMatch) {
        return {
            dimension: separateMatch[1],
            upperTolerance: separateMatch[2],
            lowerTolerance: '-' + separateMatch[3]
        };
    }
    
    // Tolerans yok, sadece ölçü
    return {
        dimension: text,
        lowerTolerance: '',
        upperTolerance: ''
    };
}

// OCR metnini temizle - SADECE RAKAMLAR VE VIRGÜL
function cleanOCRText(text) {
    if (!text) return '';
    
    console.log('🧹 Temizleme Öncesi:', text);
    
    // Satır sonlarını ve boşlukları kaldır
    text = text.replace(/[\r\n\t]/g, '').replace(/\s+/g, '');
    
    // Yaygın OCR karakter hataları (rakam okuma hataları)
    text = text
        .replace(/[oO]/g, '0')      // o, O → 0
        .replace(/[lI|]/g, '1')     // l, I, | → 1
        .replace(/[Ss§]/g, '5')     // S, s → 5
        .replace(/[Zz]/g, '2')      // Z → 2
        .replace(/[B]/g, '8')       // B → 8
        .replace(/[G]/g, '6');      // G → 6
    
    // Virgül/nokta düzenle
    text = text.replace(/\./g, ',');
    
    // SADECE RAKAMLAR VE VIRGÜL - Tüm sembolleri kaldır
    text = text.replace(/[^0-9,]/g, '');
    
    // Birden fazla virgülü temizle
    const parts = text.split(',');
    if (parts.length > 2) {
        text = parts[0] + ',' + parts.slice(1).join('');
    }
    
    console.log('✨ Temizleme Sonrası:', text);
    
    return text;
}

// OCR kelime koordinatlarını çıkar
function extractWordBoxes(lines) {
    const boxes = [];
    
    if (!lines || lines.length === 0) {
        console.log('⚠️ TextOverlay Lines boş!');
        return boxes;
    }
    
    console.log('📋 TextOverlay satır sayısı:', lines.length);
    
    lines.forEach(line => {
        if (line.Words && line.Words.length > 0) {
            console.log('  📝 Satır:', line.Words.length, 'kelime');
            line.Words.forEach(word => {
                const text = word.WordText;
                // CRITICAL: Ham kelimeyi console'a YAZMA
                // console.log('    🔤 Ham kelime:', text);
                const cleaned = cleanOCRText(text);
                
                // Sadece geçerli ölçüleri al
                if (cleaned && isValidDimension(cleaned)) {
                    boxes.push({
                        text: cleaned,
                        originalText: text,
                        x: word.Left,
                        y: word.Top,
                        width: word.Width,
                        height: word.Height
                    });
                    console.log('    ✅ Geçerli ölçü:', cleaned);
                } else {
                    // console.log('    ❌ Geçersiz:', cleaned || 'boş');
                }
            });
            
            // CRITICAL: Word array'ini temizle - kullanıldı artık
            line.Words = null;
        }
    });
    
    // CRITICAL: Lines array'ini tamamen temizle
    lines.length = 0;
    
    // Çok yakın kutuları birleştir (aynı ölçünün farklı parçaları olabilir)
    const mergedBoxes = mergeNearbyBoxes(boxes);
    
    return mergedBoxes;
}

// Yakın kutuları birleştir
function mergeNearbyBoxes(boxes) {
    if (boxes.length <= 1) return boxes;
    
    const merged = [];
    const used = new Set();
    const minDistance = 8; // Minimum mesafe - sadece çok yakın olanlar (aynı kelimenin parçaları)
    
    for (let i = 0; i < boxes.length; i++) {
        if (used.has(i)) continue;
        
        const box1 = boxes[i];
        
        // Diğer kutularla karşılaştır
        for (let j = i + 1; j < boxes.length; j++) {
            if (used.has(j)) continue;
            
            const box2 = boxes[j];
            
            // SADECE aynı değere sahip kutular için birleştirme yap
            if (box1.text !== box2.text) continue;
            
            // Merkezler arası mesafe
            const centerX1 = box1.x + box1.width / 2;
            const centerY1 = box1.y + box1.height / 2;
            const centerX2 = box2.x + box2.width / 2;
            const centerY2 = box2.y + box2.height / 2;
            
            const distance = Math.sqrt(
                Math.pow(centerX2 - centerX1, 2) + 
                Math.pow(centerY2 - centerY1, 2)
            );
            
            // Aynı değer VE çok yakınsa birleştir (duplicate)
            if (distance < minDistance) {
                console.log(`⚠️ Duplicate kutu kaldırıldı: "${box1.text}" (mesafe: ${distance.toFixed(1)}px)`);
                used.add(j);
            }
        }
        
        merged.push(box1);
        used.add(i);
    }
    
    console.log(`📦 ${boxes.length} kutu → ${merged.length} benzersiz kutu`);
    return merged;
}

// Metin içinden birden fazla ölçü çıkar
function extractMultipleDimensions(rawText) {
    const dimensions = [];
    
    console.log('🔍 Çoklu ölçü arama:', rawText);
    
    // Satırlara böl
    const lines = rawText.split(/[\r\n]+/);
    
    for (let line of lines) {
        // Her satırı temizle
        const cleaned = cleanOCRText(line);
        
        if (cleaned && isValidDimension(cleaned)) {
            dimensions.push(cleaned);
            console.log('  ✓ Bulundu:', cleaned);
        }
    }
    
    // Eğer satır bazında bulamadıysa, sayıları regex ile bul
    if (dimensions.length === 0) {
        // Ø40, R12, 45°, 21.9 gibi formatlardaki sayıları bul
        // Daha geniş pattern: sembolleri de dahil et, sonra temizle
        const numberPattern = /[RØøΦφ°±]?\s*[\dOoIl]+[.,]?[\dOoIl]*\s*[RØøΦφ°±]?/g;
        const matches = rawText.match(numberPattern) || [];
        
        console.log('  📊 Regex eşleşmeleri:', matches);
        
        for (let match of matches) {
            const cleaned = cleanOCRText(match);
            if (cleaned && isValidDimension(cleaned)) {
                dimensions.push(cleaned);
                console.log('  ✓ Regex buldu:', cleaned);
            }
        }
    }
    
    // Tekrarları kaldır
    return [...new Set(dimensions)];
}

// Geçerli ölçü formatı kontrolü - SADECE RAKAMLAR VE VIRGÜL
function isValidDimension(text) {
    if (!text || text.length === 0) return false;
    
    console.log('✔️ Geçerlilik Kontrolü:', text);
    
    // Virgüllü sayı: 21,9
    if (/^\d+,\d{1,3}$/.test(text)) {
        console.log('✅ Virgüllü sayı:', text);
        return true;
    }
    
    // Normal sayı: 12, 76, 219, 1234
    if (/^\d+$/.test(text)) {
        const num = parseInt(text);
        if (num > 0 && num < 10000) {
            console.log('✅ Normal sayı:', text);
            return true;
        }
    }
    
    console.log('❌ Geçersiz format:', text);
    return false;
}

// ═══════════════════════════════════════════════════════════
// VERİTABANI SİSTEMİ
// ═══════════════════════════════════════════════════════════

function findMatch(annotation) {
    if (Object.keys(imageDatabase).length === 0) return null;
    
    const testCanvas = createPreviewCanvas(annotation);
    const testCtx = testCanvas.getContext('2d');
    const testData = testCtx.getImageData(0, 0, testCanvas.width, testCanvas.height);
    
    let best = null;
    let bestScore = 0;
    
    for (const [dim, samples] of Object.entries(imageDatabase)) {
        for (const sample of samples) {
            if (!sample || !sample.data) continue;
            if (testData.width !== sample.width || testData.height !== sample.height) continue;
            
            const d1 = testData.data;
            const d2 = sample.data.data;
            let match = 0;
            
            for (let i = 0; i < d1.length; i += 4) {
                const g1 = (d1[i] + d1[i+1] + d1[i+2]) / 3;
                const g2 = (d2[i] + d2[i+1] + d2[i+2]) / 3;
                
                if (Math.abs(g1 - g2) < 50) {
                    match++;
                }
            }
            
            const score = match / (d1.length / 4);
            
            if (score > bestScore) {
                bestScore = score;
                best = { dimension: dim, score: score };
            }
        }
    }
    
    return best;
}

function learnImage(annotation, dimension) {
    const canvas = createPreviewCanvas(annotation);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (!imageDatabase[dimension]) {
        imageDatabase[dimension] = [];
    }
    
    if (imageDatabase[dimension].length >= 5) {
        imageDatabase[dimension].shift();
    }
    
    imageDatabase[dimension].push({
        width: imageData.width,
        height: imageData.height,
        data: imageData
    });
    
    console.log(`📚 Öğrenildi: ${dimension} (${imageDatabase[dimension].length} örnek)`);
    saveDatabase();
}

function createPreviewCanvas(annotation) {
    const previewCanvas = document.createElement('canvas');
    const previewCtx = previewCanvas.getContext('2d');
    
    const scale = 4;
    previewCanvas.width = annotation.rect.width * scale;
    previewCanvas.height = annotation.rect.height * scale;
    
    previewCtx.fillStyle = 'white';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    
    previewCtx.drawImage(
        canvas,
        annotation.rect.x,
        annotation.rect.y,
        annotation.rect.width,
        annotation.rect.height,
        0, 0,
        previewCanvas.width,
        previewCanvas.height
    );
    
    return previewCanvas;
}

function saveDatabase() {
    try {
        const saveData = {};
        for (const [dim, samples] of Object.entries(imageDatabase)) {
            saveData[dim] = samples.map(s => ({
                width: s.width,
                height: s.height,
                data: Array.from(s.data.data)
            }));
        }
        
        const jsonData = JSON.stringify(saveData);
        
        // LocalStorage boyut kontrolü (5MB limit)
        if (jsonData.length > 5000000) {
            console.warn('⚠️ Veritabanı çok büyük, eski veriler temizleniyor...');
            // Her ölçüden sadece son 2 örneği tut
            for (const dim in imageDatabase) {
                if (imageDatabase[dim].length > 2) {
                    imageDatabase[dim] = imageDatabase[dim].slice(-2);
                }
            }
            return saveDatabase(); // Tekrar dene
        }
        
        localStorage.setItem('dimensionDB', jsonData);
        console.log('💾 Veritabanı kaydedildi:', Object.keys(saveData).length, 'ölçü');
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('❌ LocalStorage dolu! Veritabanı temizleniyor...');
            localStorage.removeItem('dimensionDB');
            imageDatabase = {};
        } else {
            console.error('Kayıt hatası:', e);
        }
    }
}

function loadDatabase() {
    try {
        const saved = localStorage.getItem('dimensionDB');
        if (saved) {
            const data = JSON.parse(saved);
            imageDatabase = {};
            
            for (const [dim, samples] of Object.entries(data)) {
                imageDatabase[dim] = samples.map(s => {
                    const imageData = new ImageData(s.width, s.height);
                    imageData.data.set(new Uint8ClampedArray(s.data));
                    return {
                        width: s.width,
                        height: s.height,
                        data: imageData
                    };
                });
            }
            
            console.log('✅ Veritabanı:', Object.keys(imageDatabase).length, 'ölçü');
        }
    } catch (e) {
        console.error('Yükleme hatası:', e);
        imageDatabase = {};
    }
}

// ═══════════════════════════════════════════════════════════
// MODAL & UI
// ═══════════════════════════════════════════════════════════

function openModal(annotation, match) {
    const modal = document.getElementById('dimensionModal');
    const modalInput = document.getElementById('modalDimension');
    const preview = document.getElementById('previewImage');
    const suggestionDiv = document.getElementById('suggestion');
    
    pendingAnnotation = annotation;
    modalInput.value = '';
    
    const previewCanvas = createPreviewCanvas(annotation);
    if (preview) {
        preview.src = previewCanvas.toDataURL();
        preview.style.display = 'block';
    }
    
    if (match && match.score > 0.5) {
        modalInput.value = match.dimension;
        if (suggestionDiv) {
            const conf = (match.score * 100).toFixed(0);
            suggestionDiv.innerHTML = `💡 Öneri: <strong>${match.dimension}</strong> (%${conf})`;
            suggestionDiv.classList.remove('hidden');
        }
    } else {
        if (suggestionDiv) {
            suggestionDiv.classList.add('hidden');
        }
    }
    
    modal.classList.add('show');
    setTimeout(() => {
        modalInput.focus();
        modalInput.select();
    }, 100);
}

function closeModal() {
    const modal = document.getElementById('dimensionModal');
    modal.classList.remove('show');
    pendingAnnotation = null;
}

function showLoading(show) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

function highlightSuccess(id, type) {
    const dimInput = document.getElementById(`dim-${id}`);
    if (dimInput) {
        if (type === 'ocr') {
            dimInput.style.backgroundColor = '#d4edda'; // Yeşil
        } else if (type === 'database') {
            dimInput.style.backgroundColor = '#cfe2ff'; // Mavi
        }
    }
}

function showNotification(message, type) {
    console.log(`📢 ${message}`);
    // İsteğe bağlı toast notification eklenebilir
}

// ═══════════════════════════════════════════════════════════
// TABLO SİSTEMİ
// ═══════════════════════════════════════════════════════════

function addTableRow(annotation) {
    const tableBody = document.getElementById('tableBody');
    const row = document.createElement('tr');
    row.id = `row-${annotation.id}`;
    
    // Birleşik tolerans hesapla
    const combinedTolerance = getCombinedTolerance(annotation);
    
    row.innerHTML = `
        <td>
            <span id="num-display-${annotation.id}">${annotation.number}</span>
            <button class="edit-num-btn" onclick="editBalloonNumber(${annotation.id})" title="Numarayı Düzenle">✏️</button>
        </td>
        <td><input type="text" id="dim-${annotation.id}" value="${annotation.dimension || ''}" /></td>
        <td id="combined-tolerance-${annotation.id}" style="text-align: center; font-weight: bold;">${combinedTolerance}</td>
        <td><input type="text" id="lower-${annotation.id}" value="${annotation.lowerTolerance || ''}" placeholder="-0.05" class="tolerance-input" /></td>
        <td><input type="text" id="upper-${annotation.id}" value="${annotation.upperTolerance || ''}" placeholder="+0.05" class="tolerance-input" /></td>
        <td id="lower-limit-${annotation.id}" class="calculated-limit">${calculateLowerLimit(annotation)}</td>
        <td id="upper-limit-${annotation.id}" class="calculated-limit">${calculateUpperLimit(annotation)}</td>
        <td><button class="delete-btn" onclick="deleteAnnotation(${annotation.id})">Sil</button></td>
    `;
    
    tableBody.appendChild(row);
    
    // Event listeners
    document.getElementById(`dim-${annotation.id}`).addEventListener('change', (e) => {
        annotation.dimension = e.target.value;
        updateLimits(annotation.id);
        redrawCanvas();
    });
    
    document.getElementById(`lower-${annotation.id}`).addEventListener('change', (e) => {
        annotation.lowerTolerance = e.target.value;
        updateLimits(annotation.id);
        updateCombinedTolerance(annotation.id);
    });
    
    document.getElementById(`upper-${annotation.id}`).addEventListener('change', (e) => {
        annotation.upperTolerance = e.target.value;
        updateLimits(annotation.id);
        updateCombinedTolerance(annotation.id);
    });
}

// Birleşik tolerans göster (-/+)
function getCombinedTolerance(annotation) {
    const lower = annotation.lowerTolerance || '';
    const upper = annotation.upperTolerance || '';
    
    if (!lower && !upper) return '';
    
    // Eğer aynı değer ise (±)
    if (lower && upper && lower === '-' + upper) {
        return `±${upper}`;
    }
    
    // Farklı değerler ise
    return `${lower}/${upper}`;
}

// Birleşik toleransı güncelle
function updateCombinedTolerance(annotationId) {
    const annotation = annotations.find(a => a.id === annotationId);
    if (!annotation) return;
    
    const combined = getCombinedTolerance(annotation);
    const cell = document.getElementById(`combined-tolerance-${annotationId}`);
    if (cell) {
        cell.textContent = combined;
    }
}

// Balon numarasını düzenle
function editBalloonNumber(annotationId) {
    // Annotation'ı bul
    const annotation = annotations.find(a => a.id === annotationId);
    if (!annotation) return;
    
    const currentNumber = annotation.number;
    const newNumber = prompt(`Yeni balon numarasını girin (Mevcut: ${currentNumber}):`, currentNumber);
    
    if (!newNumber || newNumber.trim() === '') return;
    
    const parsedNumber = parseInt(newNumber);
    
    if (isNaN(parsedNumber) || parsedNumber < 1) {
        alert('Geçerli bir numara girin (1 veya daha büyük)');
        return;
    }
    
    // Aynı numara zaten var mı?
    const existing = annotations.find(a => a.number === parsedNumber && a.id !== annotationId);
    if (existing) {
        const swap = confirm(`${parsedNumber} numarası zaten kullanılıyor. Numaraları değiştirmek ister misiniz?`);
        if (swap) {
            // Swap yap
            existing.number = currentNumber;
            document.getElementById(`num-display-${existing.id}`).textContent = currentNumber;
        } else {
            return;
        }
    }
    
    // Numarayı güncelle
    annotation.number = parsedNumber;
    document.getElementById(`num-display-${annotationId}`).textContent = parsedNumber;
    redrawCanvas();
    
    console.log(`✏️ Balon #${annotationId} numarası ${currentNumber} → ${parsedNumber}`);
}

// Başlangıç numarasını ayarla
function setStartNumber() {
    const input = document.getElementById('startNumberInput');
    const startNumber = parseInt(input.value);
    
    if (isNaN(startNumber) || startNumber < 1) {
        alert('Lütfen 1 veya daha büyük bir sayı girin!');
        return;
    }
    
    balloonCounter = startNumber;
    
    console.log(`✅ Başlangıç numarası: ${startNumber} olarak ayarlandı`);
    showNotification(`✓ Sonraki ölçü ${startNumber} numarasından başlayacak`, 'success');
    
    // Input'u güncelle
    input.value = startNumber;
}

// Otomatik numaralandırma uygula
function applyAutoNumbering() {
    const direction = autoNumberDirectionSelect.value;
    
    if (direction === 'none') {
        showNotification('Lütfen bir sıralama yöni seçin', 'warning');
        return;
    }
    
    if (annotations.length === 0) {
        showNotification('Numaralandırılacak balon yok', 'warning');
        return;
    }
    
    // Balonları seçilen yöne göre sırala
    const sortedAnnotations = [...annotations].sort((a, b) => {
        // Balon koordinatlarını kullan (rect değil!)
        const aX = a.balloon ? a.balloon.x : (a.rect.x + a.rect.width / 2);
        const aY = a.balloon ? a.balloon.y : (a.rect.y + a.rect.height / 2);
        const bX = b.balloon ? b.balloon.x : (b.rect.x + b.rect.width / 2);
        const bY = b.balloon ? b.balloon.y : (b.rect.y + b.rect.height / 2);
        
        switch(direction) {
            case 'left-right':
                // Soldan sağa: önce X, sonra Y
                const xDiffLR = Math.abs(aX - bX);
                if (xDiffLR > 30) return aX - bX;
                return aY - bY;
            
            case 'right-left':
                // Sağdan sola: önce X (ters), sonra Y
                const xDiffRL = Math.abs(bX - aX);
                if (xDiffRL > 30) return bX - aX;
                return aY - bY;
            
            case 'top-bottom':
                // Yukarıdan aşağıya: önce Y, sonra X
                const yDiffTB = Math.abs(aY - bY);
                if (yDiffTB > 30) return aY - bY;
                return aX - bX;
            
            case 'bottom-top':
                // Aşağıdan yukarıya: önce Y (ters), sonra X
                const yDiffBT = Math.abs(bY - aY);
                if (yDiffBT > 30) return bY - aY;
                return aX - bX;
            
            case 'clockwise':
                // Saat yönü: Merkez noktaya göre açı hesapla
                // Canvas merkezini bul
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                
                // Her balonun merkeze göre açısını hesapla (radyan)
                const angleA = Math.atan2(aY - centerY, aX - centerX);
                const angleB = Math.atan2(bY - centerY, bX - centerX);
                
                // Saat yönü: açıyı azalan sırada (12 saatten başlayarak)
                return angleA - angleB;
            
            case 'counter-clockwise':
                // Saat yönü tersi: Merkez noktaya göre açı hesapla
                const centerX2 = canvas.width / 2;
                const centerY2 = canvas.height / 2;
                
                const angleA2 = Math.atan2(aY - centerY2, aX - centerX2);
                const angleB2 = Math.atan2(bY - centerY2, bX - centerX2);
                
                // Saat yönü tersi: açıyı artan sırada
                return angleB2 - angleA2;
            
            default:
                return 0;
        }
    });
    
    // ÖNEMLI: Mevcut en küçük numarayı bul - bu başlangıç olacak
    // Böylece sıralama yaparken mevcut numaralar korunur
    let startNum;
    if (annotations.length > 0) {
        const existingNumbers = annotations.map(a => a.number);
        const minNumber = Math.min(...existingNumbers);
        startNum = minNumber;
    } else {
        startNum = parseInt(document.getElementById('startNumberInput').value) || 1;
    }
    
    console.log(`🔢 Sıralama başlangıç numarası: ${startNum}`);
    
    // Numaraları yeniden ata
    sortedAnnotations.forEach((annotation, index) => {
        const oldNumber = annotation.number;
        annotation.number = startNum + index;
        
        // Tablodaki numarayı güncelle
        const numDisplay = document.getElementById(`num-display-${annotation.id}`);
        if (numDisplay) {
            numDisplay.textContent = annotation.number;
        }
        
        console.log(`  📌 Balon ${annotation.id}: ${oldNumber} → ${annotation.number}`);
    });
    
    // annotations dizisini sıralı haliyle güncelle
    annotations.length = 0;
    annotations.push(...sortedAnnotations);
    
    // Sonraki numarayı ayarla - ÖNEMLI: Maksimum numaradan sonra başla
    const maxNumber = Math.max(...sortedAnnotations.map(a => a.number));
    balloonCounter = maxNumber + 1;
    
    console.log(`💡 Bir sonraki balon numarası: ${balloonCounter}`);
    
    // Canvas'ı yeniden çiz
    redrawCanvas();
    
    const directionNames = {
        'left-right': 'Soldan Sağa',
        'right-left': 'Sağdan Sola',
        'top-bottom': 'Yukarıdan Aşağıya',
        'bottom-top': 'Aşağıdan Yukarıya',
        'clockwise': 'Saat Yönünde',
        'counter-clockwise': 'Saat Yönü Tersinde'
    };
    
    showNotification(`✓ ${sortedAnnotations.length} balon ${directionNames[direction]} olarak numaralandırıldı`, 'success');
    console.log(`🔢 Otomatik numaralandırma: ${directionNames[direction]}`);
}

// Başlangıç numarası input'unu güncelle
// ═══════════════════════════════════════════════════════════
// TOLERANS SİSTEMİ
// ═══════════════════════════════════════════════════════════

// Varsayılan toleransları uygula (DIN ISO 2768)
function applyDefaultTolerances(annotation) {
    if (!annotation.dimension) return;
    
    // Manuel tolerans varsa kullan
    const lowerInput = document.getElementById('defaultLowerTolerance');
    const upperInput = document.getElementById('defaultUpperTolerance');
    
    // Eğer manuel tolerans girildiyse, onu öncelikli kullan
    if (lowerInput && lowerInput.value && upperInput && upperInput.value) {
        annotation.lowerTolerance = lowerInput.value;
        annotation.upperTolerance = upperInput.value;
        return;
    }
    
    // Manuel yoksa tablodan otomatik uygula (seçili sınıfa göre)
    const dimension = parseFloat(annotation.dimension.replace(',', '.'));
    if (!isNaN(dimension)) {
        for (let range of toleranceRanges) {
            if (dimension >= range.start && dimension < range.end) {
                let tolerance, upperTolerance;
                
                // Manuel sınıfı seçiliyse alt ve üst ayrı değerler
                if (activeToleranceClass === 'manual') {
                    tolerance = range.manualLower;
                    upperTolerance = range.manualUpper;
                    
                    if (tolerance !== null && tolerance !== undefined) {
                        annotation.lowerTolerance = (tolerance >= 0 ? '-' : '') + Math.abs(tolerance).toString().replace('.', ',');
                    } else {
                        annotation.lowerTolerance = '';
                    }
                    
                    if (upperTolerance !== null && upperTolerance !== undefined) {
                        annotation.upperTolerance = (upperTolerance >= 0 ? '+' : '') + Math.abs(upperTolerance).toString().replace('.', ',');
                    } else {
                        annotation.upperTolerance = '';
                    }
                } else {
                    // Diğer sınıflar için simetrik tolerans
                    tolerance = range[activeToleranceClass];
                    if (tolerance) {
                        annotation.lowerTolerance = '-' + tolerance.toString().replace('.', ',');
                        annotation.upperTolerance = '+' + tolerance.toString().replace('.', ',');
                    } else {
                        // Bu sınıf için tolerans tanımlı değilse boş bırak
                        annotation.lowerTolerance = '';
                        annotation.upperTolerance = '';
                    }
                }
                break;
            }
        }
    }
}

// Tüm satırlara tolerans uygula
function applyToleranceToAll() {
    const lowerInput = document.getElementById('defaultLowerTolerance');
    const upperInput = document.getElementById('defaultUpperTolerance');
    
    const lower = lowerInput.value.trim();
    const upper = upperInput.value.trim();
    
    if (!lower && !upper) {
        alert('Lütfen önce tolerans değerlerini girin!');
        return;
    }
    
    annotations.forEach(annotation => {
        if (lower) annotation.lowerTolerance = lower;
        if (upper) annotation.upperTolerance = upper;
        
        // Tablodaki inputları güncelle
        const lowerField = document.getElementById(`lower-${annotation.id}`);
        const upperField = document.getElementById(`upper-${annotation.id}`);
        
        if (lowerField && lower) lowerField.value = lower;
        if (upperField && upper) upperField.value = upper;
        
        updateLimits(annotation.id);
    });
    
    console.log(`✅ ${annotations.length} satıra tolerans uygulandı: ${lower} / ${upper}`);
    showNotification(`${annotations.length} satıra tolerans uygulandı!`, 'success');
}

// Tüm toleransları temizle
function clearAllTolerances() {
    if (!confirm('Tüm toleransları temizlemek istediğinizden emin misiniz?')) return;
    
    annotations.forEach(annotation => {
        annotation.lowerTolerance = '';
        annotation.upperTolerance = '';
        
        const lowerField = document.getElementById(`lower-${annotation.id}`);
        const upperField = document.getElementById(`upper-${annotation.id}`);
        
        if (lowerField) lowerField.value = '';
        if (upperField) upperField.value = '';
        
        updateLimits(annotation.id);
    });
    
    console.log('🗑️ Tüm toleranslar temizlendi');
}

// Alt limit hesapla
function calculateLowerLimit(annotation) {
    const dimension = parseFloat(annotation.dimension.replace(',', '.'));
    const tolerance = parseFloat((annotation.lowerTolerance || '0').replace(',', '.'));
    
    if (isNaN(dimension)) return '-';
    
    const limit = dimension + tolerance;
    return limit.toFixed(2).replace('.', ',');
}

// Üst limit hesapla
function calculateUpperLimit(annotation) {
    const dimension = parseFloat(annotation.dimension.replace(',', '.'));
    const tolerance = parseFloat((annotation.upperTolerance || '0').replace(',', '.'));
    
    if (isNaN(dimension)) return '-';
    
    const limit = dimension + tolerance;
    return limit.toFixed(2).replace('.', ',');
}

// Limitleri güncelle
function updateLimits(id) {
    const annotation = annotations.find(a => a.id === id);
    if (!annotation) return;
    
    const lowerLimitCell = document.getElementById(`lower-limit-${id}`);
    const upperLimitCell = document.getElementById(`upper-limit-${id}`);
    
    if (lowerLimitCell) {
        lowerLimitCell.textContent = calculateLowerLimit(annotation);
    }
    if (upperLimitCell) {
        upperLimitCell.textContent = calculateUpperLimit(annotation);
    }
    
    // Birleşik toleransı da güncelle
    updateCombinedTolerance(id);
}

function deleteAnnotation(id) {
    annotations = annotations.filter(a => a.id !== id);
    document.getElementById(`row-${id}`).remove();
    redrawCanvas();
}

// Tablo sıralama sistemi
let sortState = {
    column: null,
    ascending: true
};

function sortTable(column) {
    const sortIcons = {
        no: document.getElementById('sort-no'),
        dimension: document.getElementById('sort-dimension')
    };
    
    // Aynı sütuna tıklanırsa sıralama yönünü değiştir
    if (sortState.column === column) {
        sortState.ascending = !sortState.ascending;
    } else {
        sortState.column = column;
        sortState.ascending = true;
    }
    
    // İkonları sıfırla
    Object.values(sortIcons).forEach(icon => {
        if (icon) icon.textContent = '⇅';
    });
    
    // Aktif ikonu güncelle
    if (sortIcons[column]) {
        sortIcons[column].textContent = sortState.ascending ? '▲' : '▼';
    }
    
    // Annotations dizisini sırala
    annotations.sort((a, b) => {
        let valueA, valueB;
        
        if (column === 'no') {
            valueA = parseInt(a.number) || 0;
            valueB = parseInt(b.number) || 0;
        } else if (column === 'dimension') {
            // Ölçü değerini sayıya çevir (virgül ve nokta desteği)
            valueA = parseFloat((a.dimension || '0').replace(',', '.')) || 0;
            valueB = parseFloat((b.dimension || '0').replace(',', '.')) || 0;
        }
        
        if (sortState.ascending) {
            return valueA - valueB;
        } else {
            return valueB - valueA;
        }
    });
    
    // Tabloyu yeniden oluştur
    rebuildTable();
    redrawCanvas(); // Canvas'ı da güncelle
    
    showNotification(`${column === 'no' ? 'No' : 'Ölçü'} sütununa göre ${sortState.ascending ? 'artan' : 'azalan'} sıralandı`, 'info');
}

function rebuildTable() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';
    
    // Tüm satırları yeniden ekle
    annotations.forEach(annotation => {
        addTableRow(annotation);
    });
}

// Sadece balonları temizle
function clearAnnotations() {
    if (confirm('Tüm balonları ve ölçüleri silmek istediğinizden emin misiniz?')) {
        annotations = [];
        textAnnotations = [];
        balloonCounter = 1;
        document.getElementById('tableBody').innerHTML = '';
        redrawCanvas();
        showNotification('Balonlar ve metinler temizlendi', 'success');
        console.log('🗑️ Balonlar ve metinler temizlendi');
    }
}

// Sadece resmi temizle
function clearImage() {
    if (confirm('Yüklenen resmi silmek istediğinizden emin misiniz?\n(Balonlar kalacak)')) {
        currentImage = null;
        imageLoaded = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 800;
        canvas.height = 600;
        
        // File input'u sıfırla
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
        document.getElementById('fileName').textContent = '';
        
        showNotification('Resim temizlendi', 'success');
        console.log('🗑️ Resim temizlendi');
    }
}

// Sadece tabloyu temizle
function clearTable() {
    if (confirm('Ölçü tablosunu temizlemek istediğinizden emin misiniz?\n(Resim ve balonlar kalacak)')) {
        annotations.forEach(ann => {
            ann.dimension = '';
            ann.lowerTolerance = '';
            ann.upperTolerance = '';
        });
        document.getElementById('tableBody').innerHTML = '';
        updateTable();
        showNotification('Tablo temizlendi', 'success');
        console.log('🗑️ Tablo temizlendi');
    }
}

// Tümünü temizle
function clearAll() {
    if (confirm('TÜM VERİLERİ silmek istediğinizden emin misiniz?\n(Resim, balonlar, tablo, metinler)')) {
        annotations = [];
        textAnnotations = [];
        balloonCounter = 1;
        currentImage = null;
        imageLoaded = false;
        document.getElementById('tableBody').innerHTML = '';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 800;
        canvas.height = 600;
        
        // File input'u sıfırla
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
        document.getElementById('fileName').textContent = '';
        
        // Zoom'u sıfırla
        zoomLevel = 1.0;
        updateCanvasTransform();
        
        showNotification('Tümü temizlendi', 'success');
        
        // İstatistikleri göster
        console.log('📊 OCR İstatistikleri:', ocrStats);
        console.log('🗑️ Tümü temizlendi');
    }
}

// History'e ekle
function addToHistory(type, data) {
    history.push({ type, data });
    // Max 50 işlem
    if (history.length > 50) {
        history.shift();
    }
}

function undoLastAnnotation() {
    // Son yapılan işlemi geri al
    if (history.length > 0) {
        const lastAction = history.pop();
        
        switch(lastAction.type) {
            case 'annotation':
                // Balon silme
                const index = annotations.findIndex(a => a.id === lastAction.data.id);
                if (index !== -1) {
                    annotations.splice(index, 1);
                    const row = document.getElementById(`row-${lastAction.data.id}`);
                    if (row) row.remove();
                }
                break;
                
            case 'textBox':
                // Metin kutusu silme
                const textIndex = textBoxes.findIndex(t => t.id === lastAction.data.id);
                if (textIndex !== -1) {
                    textBoxes.splice(textIndex, 1);
                }
                break;
                
            case 'line':
                // Çizgi silme
                const lineIndex = lines.findIndex(l => l.id === lastAction.data.id);
                if (lineIndex !== -1) {
                    lines.splice(lineIndex, 1);
                }
                break;
        }
        
        redrawCanvas();
        showNotification('Geri alındı', 'info');
        console.log('↶ Geri alındı:', lastAction.type);
    } else {
        showNotification('Geri alınacak işlem yok', 'warning');
    }
}

function resetToDefaults() {
    // Tüm ayarları varsayılan değerlerine döndür
    
    // Balon Ayarları
    document.getElementById('balloonShapeSelect').value = 'circle';
    document.getElementById('balloonColorSelect').value = '#3498db';
    document.getElementById('balloonSizeInput').value = '20';
    document.getElementById('balloonTextSizeInput').value = '16';
    document.getElementById('fillTypeSelect').value = 'filled';
    document.getElementById('startNumberInput').value = '1';
    
    // Renk Ayarları
    document.getElementById('lineColorSelect').value = '#2c3e50';
    document.getElementById('textColorSelect').value = '#000000';
    
    // Metin Ayarları
    document.getElementById('textSizeInput').value = '16';
    document.getElementById('textBoxSelect').value = 'none';
    
    const fontFamilySelect = document.getElementById('fontFamilySelect');
    if (fontFamilySelect) {
        fontFamilySelect.value = 'Arial';
    }
    
    showNotification('Ayarlar varsayılana döndürüldü', 'success');
    console.log('✅ Tüm ayarlar varsayılan değerlere döndürüldü');
}

// ═══════════════════════════════════════════════════════════
// CANVAS
// ═══════════════════════════════════════════════════════════

function redrawCanvas(hideSnapPoints = false) {
    if (!imageLoaded) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (currentImage) {
        ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    }
    
    annotations.forEach(annotation => {
        // Dikdörtgen çizgi rengi
        const lineColor = annotation.lineColor || '#2c3e50';
        
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(
            annotation.rect.x,
            annotation.rect.y,
            annotation.rect.width,
            annotation.rect.height
        );
        
        // Balona en yakın köşeyi bul
        const rectCorners = [
            { x: annotation.rect.x, y: annotation.rect.y }, // Sol üst
            { x: annotation.rect.x + annotation.rect.width, y: annotation.rect.y }, // Sağ üst
            { x: annotation.rect.x, y: annotation.rect.y + annotation.rect.height }, // Sol alt
            { x: annotation.rect.x + annotation.rect.width, y: annotation.rect.y + annotation.rect.height } // Sağ alt
        ];
        
        let closestCorner = rectCorners[0];
        let minDistance = Infinity;
        
        for (let corner of rectCorners) {
            const dist = Math.sqrt(
                Math.pow(corner.x - annotation.balloon.x, 2) +
                Math.pow(corner.y - annotation.balloon.y, 2)
            );
            if (dist < minDistance) {
                minDistance = dist;
                closestCorner = corner;
            }
        }
        
        // Çizgiyi en yakın köşeden başlat
        ctx.beginPath();
        ctx.moveTo(closestCorner.x, closestCorner.y);
        ctx.lineTo(annotation.balloon.x, annotation.balloon.y);
        ctx.strokeStyle = lineColor;
        ctx.stroke();
        
        // Balon şekli çiz
        const shape = annotation.balloonShape || 'circle';
        const color = annotation.balloonColor || '#3498db';
        const textColor = annotation.textColor || '#ffffff';
        const fillType = annotation.fillType || 'filled';
        const x = annotation.balloon.x;
        const y = annotation.balloon.y;
        const size = annotation.balloonSize || 20; // Ayarlanabilir balon boyutu
        const fontSize = annotation.balloonTextSize || 16; // Ayarlanabilir yazı boyutu
        
        ctx.beginPath();
        
        switch(shape) {
            case 'circle':
                ctx.arc(x, y, size, 0, 2 * Math.PI);
                break;
                
            case 'square':
                ctx.rect(x - size, y - size, size * 2, size * 2);
                break;
                
            case 'triangle':
                ctx.moveTo(x, y - size);
                ctx.lineTo(x + size, y + size);
                ctx.lineTo(x - size, y + size);
                ctx.closePath();
                break;
                
            case 'pentagon':
                drawPolygon(ctx, x, y, size, 5);
                break;
                
            case 'hexagon':
                drawPolygon(ctx, x, y, size, 6);
                break;
                
            case 'octagon':
                drawPolygon(ctx, x, y, size, 8);
                break;
                
            default:
                ctx.arc(x, y, size, 0, 2 * Math.PI);
        }
        
        // Dolgu tipi kontrolü
        if (fillType === 'filled') {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            // Boş - sadece kenarlık, arka plan beyaz
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
        
        ctx.strokeStyle = color; // Balon kenarlığı balon rengiyle çizilir
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Yazı rengi - boş balonlarda otomatik siyah
        if (fillType === 'empty' && textColor === '#ffffff') {
            ctx.fillStyle = '#000000'; // Beyaz arka planda beyaz yazı görünmez
        } else {
            ctx.fillStyle = textColor;
        }
        
        const fontFamily = annotation.fontFamily || 'Arial';
        ctx.font = `bold ${fontSize}px ${fontFamily}`; // Ayarlanabilir yazı boyutu ve stili
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(annotation.number, x, y);
    });
    
    // Metin açıklamalarını çiz
    textAnnotations.forEach(textAnn => {
        const fontFamily = textAnn.fontFamily || 'Arial';
        ctx.font = `bold ${textAnn.fontSize}px ${fontFamily}`;
        
        // Kutu içi metin ise
        if (textAnn.isBoxText && textAnn.width && textAnn.height) {
            // Kutu çiz (sadece hasBox true ise)
            const padding = 5;
            
            if (textAnn.hasBox) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(textAnn.x, textAnn.y, textAnn.width, textAnn.height);
                
                ctx.strokeStyle = textAnn.color || '#2c3e50';
                ctx.lineWidth = 2;
                ctx.strokeRect(textAnn.x, textAnn.y, textAnn.width, textAnn.height);
            } else {
                // Kutu yok ama hover veya boyutlandırma durumunda kesik çizgili kutu göster
                const isHovered = hoveredTextBox === textAnn;
                const isBeingResized = resizingTextBox === textAnn;
                
                if (isHovered || isBeingResized) {
                    ctx.strokeStyle = isBeingResized ? '#3498db' : 'rgba(52, 152, 219, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.strokeRect(textAnn.x, textAnn.y, textAnn.width, textAnn.height);
                    ctx.setLineDash([]);
                }
            }
            
            // Metni kutunun içine sığdır (word wrap)
            ctx.fillStyle = textAnn.color || '#2c3e50';
            const words = textAnn.text.split(' ');
            let lines = [];
            let currentLine = '';
            
            const maxWidth = textAnn.width - padding * 2;
            
            for (let word of words) {
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) {
                lines.push(currentLine);
            }
            
            // Hizalama ayarı
            const align = textAnn.textAlign || 'left';
            const vAlign = textAnn.verticalAlign || 'top';
            
            let startX = textAnn.x + padding;
            if (align === 'center') {
                ctx.textAlign = 'center';
                startX = textAnn.x + textAnn.width / 2;
            } else if (align === 'right') {
                ctx.textAlign = 'right';
                startX = textAnn.x + textAnn.width - padding;
            } else {
                ctx.textAlign = 'left';
            }
            
            const lineHeight = textAnn.fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;
            
            let startY = textAnn.y + padding;
            if (vAlign === 'middle') {
                startY = textAnn.y + (textAnn.height - totalHeight) / 2;
            } else if (vAlign === 'bottom') {
                startY = textAnn.y + textAnn.height - totalHeight - padding;
            }
            
            ctx.textBaseline = 'top';
            
            // Satırları çiz
            lines.forEach((line, i) => {
                ctx.fillText(line, startX, startY + (i * lineHeight));
            });
            
            // Köşe tutamakları çiz (hasBox=true VEYA hover/resize durumunda)
            const isHovered = hoveredTextBox === textAnn;
            const isBeingResized = resizingTextBox === textAnn;
            
            if (textAnn.hasBox || isHovered || isBeingResized) {
                const handleSize = 8;
                ctx.fillStyle = '#3498db';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                
                // Sol üst
                ctx.fillRect(textAnn.x - handleSize/2, textAnn.y - handleSize/2, handleSize, handleSize);
                ctx.strokeRect(textAnn.x - handleSize/2, textAnn.y - handleSize/2, handleSize, handleSize);
                
                // Sağ üst
                ctx.fillRect(textAnn.x + textAnn.width - handleSize/2, textAnn.y - handleSize/2, handleSize, handleSize);
                ctx.strokeRect(textAnn.x + textAnn.width - handleSize/2, textAnn.y - handleSize/2, handleSize, handleSize);
                
                // Sol alt
                ctx.fillRect(textAnn.x - handleSize/2, textAnn.y + textAnn.height - handleSize/2, handleSize, handleSize);
                ctx.strokeRect(textAnn.x - handleSize/2, textAnn.y + textAnn.height - handleSize/2, handleSize, handleSize);
                
                // Sağ alt
                ctx.fillRect(textAnn.x + textAnn.width - handleSize/2, textAnn.y + textAnn.height - handleSize/2, handleSize, handleSize);
                ctx.strokeRect(textAnn.x + textAnn.width - handleSize/2, textAnn.y + textAnn.height - handleSize/2, handleSize, handleSize);
            }
            
        } else {
            // Normal metin (eski sistem)
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Metin ölçülerini al
            const textMetrics = ctx.measureText(textAnn.text);
            const textWidth = textMetrics.width;
            const textHeight = textAnn.fontSize;
            
            // Kutu varsa çiz
            if (textAnn.hasBox) {
                const padding = 4;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(textAnn.x - padding, textAnn.y - padding, textWidth + padding * 2, textHeight + padding * 2);
                
                ctx.strokeStyle = textAnn.color || '#2c3e50';
                ctx.lineWidth = 2;
                ctx.strokeRect(textAnn.x - padding, textAnn.y - padding, textWidth + padding * 2, textHeight + padding * 2);
            } else {
                // Kutu yoksa sadece beyaz kenar (okunabilirlik için)
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.strokeText(textAnn.text, textAnn.x, textAnn.y);
            }
            
            // Metni çiz
            ctx.fillStyle = textAnn.color || '#2c3e50';
            ctx.fillText(textAnn.text, textAnn.x, textAnn.y);
        }
    });
    
    // Çizgileri çiz
    lines.forEach(line => {
        ctx.strokeStyle = line.color || currentLineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        
        // Ok ucu çiz
        drawArrowHead(ctx, line.x1, line.y1, line.x2, line.y2);
        
        // Snap noktaları sadece çizim sırasında göster
        if (!hideSnapPoints) {
            // Düzenleme noktaları (hover durumunda)
            const pointRadius = 6;
            ctx.fillStyle = '#3498db';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            
            // Başlangıç noktası
            ctx.beginPath();
            ctx.arc(line.x1, line.y1, pointRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            
            // Bitiş noktası
            ctx.beginPath();
            ctx.arc(line.x2, line.y2, pointRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        }
    });
}

// Ok ucu çizme fonksiyonu
function drawArrowHead(ctx, fromX, fromY, toX, toY) {
    const headLength = 15; // Ok başı uzunluğu
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headLength * Math.cos(angle - Math.PI / 6),
        toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headLength * Math.cos(angle + Math.PI / 6),
        toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
}

// Çokgen çizme yardımcı fonksiyonu
function drawPolygon(ctx, x, y, radius, sides) {
    const angle = (2 * Math.PI) / sides;
    const startAngle = -Math.PI / 2; // Üstten başlat
    
    ctx.moveTo(
        x + radius * Math.cos(startAngle),
        y + radius * Math.sin(startAngle)
    );
    
    for (let i = 1; i <= sides; i++) {
        ctx.lineTo(
            x + radius * Math.cos(startAngle + i * angle),
            y + radius * Math.sin(startAngle + i * angle)
        );
    }
    ctx.closePath();
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

function exportImage() {
    const timestamp = Date.now();
    
    // Snap noktalarını gizle ve yeniden çiz
    redrawCanvas(true);
    
    // PNG'yi indir
    const link = document.createElement('a');
    link.download = 'teknik-resim-' + timestamp + '.png';
    link.href = canvas.toDataURL();
    link.click();
    
    // Snap noktalarını tekrar göster
    redrawCanvas(false);
    
    // JSON yedek dosyasını da otomatik kaydet
    if (annotations.length > 0 || textAnnotations.length > 0) {
        const backup = {
            annotations: annotations,
            textAnnotations: textAnnotations,
            balloonCounter: balloonCounter,
            timestamp: timestamp,
            imageData: currentImage ? canvas.toDataURL() : null
        };
        
        const jsonBlob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const jsonLink = document.createElement('a');
        jsonLink.download = 'yedek-' + timestamp + '.json';
        jsonLink.href = URL.createObjectURL(jsonBlob);
        jsonLink.click();
        
        console.log('💾 Yedek dosyası kaydedildi: yedek-' + timestamp + '.json');
        showNotification('Görüntü ve yedek dosyası indirildi!', 'success');
    } else {
        showNotification('Görüntü indirildi!', 'success');
    }
}

// PDF'e aktar
function exportToPdf() {
    console.log('📄 PDF export başladı...');
    
    if (!imageLoaded) {
        showNotification('Önce bir görüntü yükleyin!', 'warning');
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        
        if (!jsPDF) {
            alert('PDF kütüphanesi yüklenemedi! Sayfayı yenileyin.');
            return;
        }
        
        console.log('✅ jsPDF yüklendi');
        
        // Canvas'ı geçici bir canvas'a kopyala (zoom/pan olmadan)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Görüntüyü ve açıklamaları çiz
    if (currentImage) {
        tempCtx.drawImage(currentImage, 0, 0, tempCanvas.width, tempCanvas.height);
    }
    
    // Tüm açıklamaları çiz
    annotations.forEach(annotation => {
        const lineColor = annotation.lineColor || '#2c3e50';
        
        tempCtx.strokeStyle = lineColor;
        tempCtx.lineWidth = 2;
        tempCtx.strokeRect(
            annotation.rect.x,
            annotation.rect.y,
            annotation.rect.width,
            annotation.rect.height
        );
        
        // Balona en yakın köşeyi bul
        const rectCorners = [
            { x: annotation.rect.x, y: annotation.rect.y },
            { x: annotation.rect.x + annotation.rect.width, y: annotation.rect.y },
            { x: annotation.rect.x, y: annotation.rect.y + annotation.rect.height },
            { x: annotation.rect.x + annotation.rect.width, y: annotation.rect.y + annotation.rect.height }
        ];
        
        let closestCorner = rectCorners[0];
        let minDistance = Infinity;
        
        for (let corner of rectCorners) {
            const dist = Math.sqrt(
                Math.pow(corner.x - annotation.balloon.x, 2) +
                Math.pow(corner.y - annotation.balloon.y, 2)
            );
            if (dist < minDistance) {
                minDistance = dist;
                closestCorner = corner;
            }
        }
        
        tempCtx.beginPath();
        tempCtx.moveTo(closestCorner.x, closestCorner.y);
        tempCtx.lineTo(annotation.balloon.x, annotation.balloon.y);
        tempCtx.strokeStyle = lineColor;
        tempCtx.stroke();
        
        const shape = annotation.balloonShape || 'circle';
        const color = annotation.balloonColor || '#3498db';
        const textColor = annotation.textColor || '#ffffff';
        const fillType = annotation.fillType || 'filled';
        const x = annotation.balloon.x;
        const y = annotation.balloon.y;
        const size = annotation.balloonSize || 20;
        
        tempCtx.beginPath();
        
        switch(shape) {
            case 'circle':
                tempCtx.arc(x, y, size, 0, 2 * Math.PI);
                break;
            case 'square':
                tempCtx.rect(x - size, y - size, size * 2, size * 2);
                break;
            case 'triangle':
                tempCtx.moveTo(x, y - size);
                tempCtx.lineTo(x + size, y + size);
                tempCtx.lineTo(x - size, y + size);
                tempCtx.closePath();
                break;
            case 'pentagon':
                drawPolygon(tempCtx, x, y, size, 5);
                break;
            case 'hexagon':
                drawPolygon(tempCtx, x, y, size, 6);
                break;
            case 'octagon':
                drawPolygon(tempCtx, x, y, size, 8);
                break;
            default:
                tempCtx.arc(x, y, size, 0, 2 * Math.PI);
        }
        
        if (fillType === 'filled') {
            tempCtx.fillStyle = color;
            tempCtx.fill();
        } else {
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fill();
        }
        
        tempCtx.strokeStyle = color;
        tempCtx.lineWidth = 2;
        tempCtx.stroke();
        
        if (fillType === 'empty' && textColor === '#ffffff') {
            tempCtx.fillStyle = '#000000';
        } else {
            tempCtx.fillStyle = textColor;
        }
        
        const fontFamily = annotation.fontFamily || 'Arial';
        tempCtx.font = `bold ${annotation.balloonTextSize || 16}px ${fontFamily}`;
        tempCtx.textAlign = 'center';
        tempCtx.textBaseline = 'middle';
        tempCtx.fillText(annotation.number, x, y);
    });
    
    // Metin açıklamalarını ekle
    textAnnotations.forEach(textAnn => {
        const fontFamily = textAnn.fontFamily || 'Arial';
        tempCtx.font = `bold ${textAnn.fontSize}px ${fontFamily}`;
        tempCtx.textAlign = 'left';
        tempCtx.textBaseline = 'top';
        
        // Metin ölçülerini al
        const textMetrics = tempCtx.measureText(textAnn.text);
        const textWidth = textMetrics.width;
        const textHeight = textAnn.fontSize;
        
        // Kutu varsa çiz
        if (textAnn.hasBox) {
            const padding = 4;
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(textAnn.x - padding, textAnn.y - padding, textWidth + padding * 2, textHeight + padding * 2);
            
            tempCtx.strokeStyle = textAnn.color || '#2c3e50';
            tempCtx.lineWidth = 2;
            tempCtx.strokeRect(textAnn.x - padding, textAnn.y - padding, textWidth + padding * 2, textHeight + padding * 2);
        } else {
            // Kutu yoksa sadece beyaz kenar
            tempCtx.strokeStyle = '#ffffff';
            tempCtx.lineWidth = 3;
            tempCtx.strokeText(textAnn.text, textAnn.x, textAnn.y);
        }
        
        // Metni çiz
        tempCtx.fillStyle = textAnn.color || '#2c3e50';
        tempCtx.fillText(textAnn.text, textAnn.x, textAnn.y);
    });
    
    // Canvas'tan görüntü verisi al
    const imgData = tempCanvas.toDataURL('image/jpeg', 1.0);
    
    // PDF boyutunu canvas oranına göre ayarla
    const imgWidth = tempCanvas.width;
    const imgHeight = tempCanvas.height;
    const ratio = imgWidth / imgHeight;
    
    let pdfWidth, pdfHeight;
    
    if (ratio > 1) {
        // Yatay görüntü - A4 landscape
        pdfWidth = 297; // A4 genişlik (landscape)
        pdfHeight = 297 / ratio;
    } else {
        // Dikey görüntü - A4 portrait
        pdfHeight = 297; // A4 yükseklik
        pdfWidth = 297 * ratio;
    }
    
    const orientation = ratio > 1 ? 'landscape' : 'portrait';
    const pdf = new jsPDF(orientation, 'mm', 'a4');
    
    console.log('📄 PDF oluşturuldu:', orientation, pdfWidth + 'x' + pdfHeight);
    
    // Görüntüyü PDF'e ekle
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    
    console.log('📄 Görüntü eklendi, kaydediliyor...');
    
    // PDF'i indir
    const timestamp = Date.now();
    const fileName = 'teknik-resim-' + timestamp + '.pdf';
    pdf.save(fileName);
    
    console.log('✅ PDF kaydedildi:', fileName);
    showNotification('PDF dosyası indirildi!', 'success');
    
    } catch (error) {
        console.error('❌ PDF hatası:', error);
        alert('PDF oluşturulurken hata: ' + error.message);
    }
}

// Excel'e aktar
function exportToExcel() {
    if (annotations.length === 0) {
        showNotification('Dışa aktarılacak ölçü yok!', 'warning');
        return;
    }
    
    // Virgülü noktaya çevir
    function parseNumber(str) {
        if (!str) return NaN;
        return parseFloat(str.toString().replace(',', '.'));
    }
    
    // Birleşik tolerans formatı
    function formatCombinedTolerance(lower, upper) {
        if (!lower && !upper) return '';
        
        // Eğer aynı değer ise (±)
        if (lower && upper && lower === '-' + upper) {
            return `±${upper}`;
        }
        
        // Farklı değerler ise
        return `${lower}/${upper}`;
    }
    
    // Veri hazırla
    const data = [];
    
    // Başlık satırı
    data.push(['NO', 'ÖLÇÜ (MM)', '-/+ TOLERANS', 'ALT TOLERANS', 'ÜST TOLERANS', 'ALT LİMİT', 'ÜST LİMİT']);
    
    // Ölçüleri sırala
    const sortedAnnotations = [...annotations].sort((a, b) => a.number - b.number);
    
    // Her ölçüyü ekle
    sortedAnnotations.forEach(ann => {
        const dimension = ann.dimension || '';
        const lower = ann.lowerTolerance || '';
        const upper = ann.upperTolerance || '';
        
        // Birleşik tolerans
        const combinedTolerance = formatCombinedTolerance(lower, upper);
        
        // Alt ve üst limit hesapla
        let lowerLimit = '';
        let upperLimit = '';
        
        if (dimension && lower && upper) {
            const dimNum = parseNumber(dimension);
            const lowerNum = parseNumber(lower);
            const upperNum = parseNumber(upper);
            
            if (!isNaN(dimNum) && !isNaN(lowerNum) && !isNaN(upperNum)) {
                // Virgüllü format
                lowerLimit = (dimNum + lowerNum).toFixed(2).replace('.', ',');
                upperLimit = (dimNum + upperNum).toFixed(2).replace('.', ',');
            }
        }
        
        data.push([
            ann.number,
            dimension,
            combinedTolerance,
            lower,
            upper,
            lowerLimit,
            upperLimit
        ]);
    });
    
    // Excel workbook oluştur
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Sütun genişlikleri
    ws['!cols'] = [
        { wch: 8 },  // NO
        { wch: 15 }, // ÖLÇÜ
        { wch: 15 }, // -/+ TOLERANS
        { wch: 15 }, // ALT TOLERANS
        { wch: 15 }, // ÜST TOLERANS
        { wch: 15 }, // ALT LİMİT
        { wch: 15 }  // ÜST LİMİT
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ölçüler');
    
    // Dosya adı
    const fileName = 'olculer-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    
    // İndir
    XLSX.writeFile(wb, fileName);
    
    console.log('📊 Excel dosyası oluşturuldu:', fileName);
    showNotification('Excel dosyası indirildi!', 'success');
}

// ═══════════════════════════════════════════════════════════
// TOLERANS TABLOSU SİSTEMİ
// ═══════════════════════════════════════════════════════════

// Tolerans aralıklarını yükle
function loadToleranceRanges() {
    const saved = localStorage.getItem('toleranceRanges');
    if (saved) {
        try {
            toleranceRanges = JSON.parse(saved);
            console.log('✅ Tolerans tablosu yüklendi:', toleranceRanges.length, 'aralık');
        } catch (e) {
            console.error('Tolerans tablosu yükleme hatası:', e);
        }
    }
}

// Tolerans aralıklarını kaydet
function saveToleranceRanges() {
    try {
        localStorage.setItem('toleranceRanges', JSON.stringify(toleranceRanges));
        console.log('💾 Tolerans tablosu kaydedildi');
    } catch (e) {
        console.error('Tolerans tablosu kayıt hatası:', e);
    }
}

// Ölçüye göre tolerans bul
function getToleranceForDimension(dimension) {
    const dim = parseFloat(dimension.toString().replace(',', '.'));
    
    if (isNaN(dim)) {
        return { lower: 0, upper: 0 };
    }
    
    // Uygun aralığı bul
    for (const range of toleranceRanges) {
        if (dim > range.start && dim <= range.end) {
            console.log(`📏 ${dim}mm için tolerans: ${range.lower} / +${range.upper}`);
            return { lower: range.lower, upper: range.upper };
        }
    }
    
    // Bulunamazsa varsayılan
    return { lower: -0.1, upper: 0.1 };
}

// Tolerans tablosu modalını aç
function openToleranceTableModal() {
    const modal = document.getElementById('toleranceTableModal');
    populateToleranceTable();
    setupToleranceTableListeners();
    modal.classList.add('show');
}

// Tolerans tablosunu doldur
function populateToleranceTable() {
    const tbody = document.getElementById('toleranceRangeBody');
    tbody.innerHTML = '';
    
    toleranceRanges.forEach((range, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><input type="number" class="range-start" value="${range.start}" data-id="${range.id}" style="width: 80px;" /></td>
            <td><input type="number" class="range-end" value="${range.end}" data-id="${range.id}" style="width: 80px;" /></td>
            <td><input type="number" step="0.01" class="range-fine" value="${range.fine || ''}" data-id="${range.id}" style="width: 70px;" ${!range.fine ? 'placeholder="-"' : ''} /></td>
            <td><input type="number" step="0.01" class="range-medium" value="${range.medium || ''}" data-id="${range.id}" style="width: 70px;" ${!range.medium ? 'placeholder="-"' : ''} /></td>
            <td><input type="number" step="0.01" class="range-coarse" value="${range.coarse || ''}" data-id="${range.id}" style="width: 70px;" ${!range.coarse ? 'placeholder="-"' : ''} /></td>
            <td><input type="number" step="0.01" class="range-veryCoarse" value="${range.veryCoarse || ''}" data-id="${range.id}" style="width: 70px;" ${!range.veryCoarse ? 'placeholder="-"' : ''} /></td>
            <td><input type="number" step="0.01" class="range-manualLower" value="${range.manualLower || ''}" data-id="${range.id}" style="width: 70px;" placeholder="-" /></td>
            <td><input type="number" step="0.01" class="range-manualUpper" value="${range.manualUpper || ''}" data-id="${range.id}" style="width: 70px;" placeholder="+" /></td>
            <td><button class="delete-range-btn" data-id="${range.id}" style="padding: 5px 10px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">Sil</button></td>
        `;
        tbody.appendChild(row);
    });
}

// Sütun vurgulamayı güncelle
function highlightActiveColumn() {
    // Tüm vurguları temizle
    document.querySelectorAll('#toleranceRangeTable th, #toleranceRangeTable td').forEach(cell => {
        cell.style.backgroundColor = '';
        cell.style.fontWeight = '';
    });
    
    // Aktif sütunu vurgula
    let columnIndex;
    switch(activeToleranceClass) {
        case 'fine': columnIndex = 3; break;
        case 'medium': columnIndex = 4; break;
        case 'coarse': columnIndex = 5; break;
        case 'veryCoarse': columnIndex = 6; break;
        case 'manual': columnIndex = [7, 8]; break; // İki sütun: alt ve üst
    }
    
    if (columnIndex) {
        // Başlık hücresini vurgula
        const headerCells = document.querySelectorAll('#toleranceRangeTable thead th');
        
        if (Array.isArray(columnIndex)) {
            // Manuel için iki sütun vurgula
            columnIndex.forEach(idx => {
                if (headerCells[idx]) {
                    headerCells[idx].style.backgroundColor = '#9b59b6';
                    headerCells[idx].style.color = 'white';
                    headerCells[idx].style.fontWeight = 'bold';
                }
            });
            
            // Veri hücrelerini vurgula
            document.querySelectorAll('#toleranceRangeTable tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                columnIndex.forEach(idx => {
                    if (cells[idx]) {
                        cells[idx].style.backgroundColor = '#f4ecf7';
                        cells[idx].style.fontWeight = 'bold';
                    }
                });
            });
        } else {
            // Diğer sınıflar için tek sütun
            if (headerCells[columnIndex]) {
                headerCells[columnIndex].style.backgroundColor = '#3498db';
                headerCells[columnIndex].style.color = 'white';
                headerCells[columnIndex].style.fontWeight = 'bold';
            }
            
            // Veri hücrelerini vurgula
            document.querySelectorAll('#toleranceRangeTable tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells[columnIndex]) {
                    cells[columnIndex].style.backgroundColor = '#e3f2fd';
                    cells[columnIndex].style.fontWeight = 'bold';
                }
            });
        }
    }
    
    // Ana sayfadaki aktif sistem yazısını güncelle
    updateActiveSystemText();
}

// Ana sayfadaki "Aktif Sistem" yazısını güncelle
function updateActiveSystemText() {
    const activeSystemSpan = document.getElementById('activeSystemText');
    if (!activeSystemSpan) return;
    
    let systemText = '';
    switch(activeToleranceClass) {
        case 'fine':
            systemText = 'DIN ISO 2768-f (fine/ince)';
            break;
        case 'medium':
            systemText = 'DIN ISO 2768-m (medium/orta)';
            break;
        case 'coarse':
            systemText = 'DIN ISO 2768-c (coarse/kaba)';
            break;
        case 'veryCoarse':
            systemText = 'DIN ISO 2768-v (very coarse/çok kaba)';
            break;
        case 'manual':
            systemText = 'MANUEL (- ve + ayrı giriş)';
            break;
        default:
            systemText = 'DIN ISO 2768-m (medium/orta)';
    }
    
    activeSystemSpan.textContent = systemText;
}

// Tolerans tablosu event listener'ları
function setupToleranceTableListeners() {
    const addBtn = document.getElementById('addToleranceRangeBtn');
    const resetBtn = document.getElementById('resetToleranceRangesBtn');
    const saveBtn = document.getElementById('toleranceTableSave');
    const cancelBtn = document.getElementById('toleranceTableCancel');
    const classSelect = document.getElementById('toleranceClassSelect');
    
    // Mevcut listener'ları kaldır
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    const newResetBtn = resetBtn.cloneNode(true);
    resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
    
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // Sınıf seçimi
    if (classSelect) {
        classSelect.value = activeToleranceClass;
        classSelect.addEventListener('change', (e) => {
            activeToleranceClass = e.target.value;
            highlightActiveColumn();
            console.log('✅ Tolerans sınıfı değişti:', activeToleranceClass);
        });
    }
    
    // İlk açılışta vurgula
    highlightActiveColumn();
    
    // Yeni listener'lar
    newAddBtn.addEventListener('click', addToleranceRange);
    newResetBtn.addEventListener('click', resetToleranceRanges);
    newSaveBtn.addEventListener('click', saveToleranceTable);
    newCancelBtn.addEventListener('click', closeToleranceTableModal);
    
    // Sil butonları
    document.querySelectorAll('.delete-range-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            deleteToleranceRange(id);
        });
    });
}

// Yeni tolerans aralığı ekle
function addToleranceRange() {
    const newId = Math.max(...toleranceRanges.map(r => r.id)) + 1;
    const lastRange = toleranceRanges[toleranceRanges.length - 1];
    
    toleranceRanges.push({
        id: newId,
        start: lastRange ? lastRange.end : 0,
        end: lastRange ? lastRange.end + 10 : 10,
        fine: 0.1,
        medium: 0.2,
        coarse: 0.5,
        veryCoarse: 1.0,
        manualLower: null,
        manualUpper: null
    });
    
    populateToleranceTable();
    setupToleranceTableListeners();
}

// Tolerans aralığını sil
function deleteToleranceRange(id) {
    if (toleranceRanges.length <= 1) {
        alert('En az bir aralık olmalıdır!');
        return;
    }
    
    toleranceRanges = toleranceRanges.filter(r => r.id !== id);
    populateToleranceTable();
    setupToleranceTableListeners();
}

// Varsayılana dön
function resetToleranceRanges() {
    if (!confirm('Tolerans tablosunu DIN ISO 2768 varsayılan değerlerine döndürmek istediğinizden emin misiniz?')) {
        return;
    }
    
    toleranceRanges = [
        { id: 1, start: 0, end: 3, fine: 0.05, medium: 0.1, coarse: 0.2, veryCoarse: null, manualLower: null, manualUpper: null },
        { id: 2, start: 3, end: 6, fine: 0.05, medium: 0.1, coarse: 0.3, veryCoarse: 0.5, manualLower: null, manualUpper: null },
        { id: 3, start: 6, end: 30, fine: 0.1, medium: 0.2, coarse: 0.5, veryCoarse: 1.0, manualLower: null, manualUpper: null },
        { id: 4, start: 30, end: 120, fine: 0.15, medium: 0.3, coarse: 0.8, veryCoarse: 1.5, manualLower: null, manualUpper: null },
        { id: 5, start: 120, end: 400, fine: 0.2, medium: 0.5, coarse: 1.2, veryCoarse: 2.5, manualLower: null, manualUpper: null },
        { id: 6, start: 400, end: 1000, fine: 0.3, medium: 0.8, coarse: 2.0, veryCoarse: 4.0, manualLower: null, manualUpper: null },
        { id: 7, start: 1000, end: 2000, fine: 0.5, medium: 1.2, coarse: 3.0, veryCoarse: 6.0, manualLower: null, manualUpper: null },
        { id: 8, start: 2000, end: 4000, fine: null, medium: 2.0, coarse: 4.0, veryCoarse: 8.0, manualLower: null, manualUpper: null }
    ];
    
    populateToleranceTable();
    setupToleranceTableListeners();
    showNotification('Tolerans tablosu varsayılana döndürüldü', 'success');
}

// Tolerans tablosunu kaydet
function saveToleranceTable() {
    // Input değerlerini oku
    document.querySelectorAll('#toleranceRangeBody tr').forEach(row => {
        const id = parseInt(row.querySelector('.range-start').dataset.id);
        const range = toleranceRanges.find(r => r.id === id);
        
        if (range) {
            range.start = parseFloat(row.querySelector('.range-start').value);
            range.end = parseFloat(row.querySelector('.range-end').value);
            range.fine = parseFloat(row.querySelector('.range-fine').value) || null;
            range.medium = parseFloat(row.querySelector('.range-medium').value) || null;
            range.coarse = parseFloat(row.querySelector('.range-coarse').value) || null;
            range.veryCoarse = parseFloat(row.querySelector('.range-veryCoarse').value) || null;
            range.manualLower = parseFloat(row.querySelector('.range-manualLower').value) || null;
            range.manualUpper = parseFloat(row.querySelector('.range-manualUpper').value) || null;
        }
    });
    
    // Kaydet
    saveToleranceRanges();
    
    // Mevcut ölçülere uygula (seçili sınıfa göre)
    annotations.forEach(annotation => {
        if (annotation.dimension) {
            applyDefaultTolerances(annotation);
            updateLimits(annotation.id);
            
            // Input alanlarını güncelle
            const lowerField = document.getElementById(`lower-${annotation.id}`);
            const upperField = document.getElementById(`upper-${annotation.id}`);
            if (lowerField) lowerField.value = annotation.lowerTolerance;
            if (upperField) upperField.value = annotation.upperTolerance;
        }
    });
    
    console.log('✅ Tolerans tablosu kaydedildi ve ölçülere uygulandı');
    showNotification('Tolerans tablosu güncellendi!', 'success');
    
    // Ana sayfadaki aktif sistem yazısını güncelle
    updateActiveSystemText();
    
    closeToleranceTableModal();
}

// Tolerans tablosu modalını kapat
function closeToleranceTableModal() {
    const modal = document.getElementById('toleranceTableModal');
    modal.classList.remove('show');
}

// Metin modu toggle
function toggleTextMode() {
    isTextMode = !isTextMode;
    const addTextBtn = document.getElementById('addTextBtn');
    
    if (isTextMode) {
        isLineMode = false; // Çizgi modunu kapat
        const addLineBtn = document.getElementById('addLineBtn');
        addLineBtn.style.backgroundColor = '';
        addLineBtn.style.color = '';
        addLineBtn.textContent = '📍 Çizgi Ekle';
        
        addTextBtn.style.backgroundColor = '#e74c3c';
        addTextBtn.style.color = '#ffffff';
        addTextBtn.textContent = '📝 Metin Modu (Aktif)';
        canvas.style.cursor = 'text';
        showNotification('Metin modu aktif! Resme tıklayarak metin ekleyin.', 'info');
    } else {
        addTextBtn.style.backgroundColor = '';
        addTextBtn.style.color = '';
        addTextBtn.textContent = '📝 Metin Ekle';
        canvas.style.cursor = 'crosshair';
        showNotification('Metin modu kapatıldı.', 'info');
    }
}

function toggleLineMode() {
    isLineMode = !isLineMode;
    const addLineBtn = document.getElementById('addLineBtn');
    
    if (isLineMode) {
        isTextMode = false; // Metin modunu kapat
        const addTextBtn = document.getElementById('addTextBtn');
        addTextBtn.style.backgroundColor = '';
        addTextBtn.style.color = '';
        addTextBtn.textContent = '📝 Metin Ekle';
        
        addLineBtn.style.backgroundColor = '#27ae60';
        addLineBtn.style.color = '#ffffff';
        addLineBtn.textContent = '📍 Çizgi Modu (Aktif)';
        canvas.style.cursor = 'crosshair';
        showNotification('Çizgi modu aktif! Başlangıç ve bitiş noktası seçin.', 'info');
    } else {
        addLineBtn.style.backgroundColor = '';
        addLineBtn.style.color = '';
        addLineBtn.textContent = '📍 Çizgi Ekle';
        canvas.style.cursor = 'crosshair';
        showNotification('Çizgi modu kapatıldı.', 'info');
    }
}

// Balonları yeniden numaralandır (sol üstten başlayarak)
function renumberAnnotations() {
    // ÖNEMLI: Mevcut en küçük numarayı bul veya input'tan al
    let startNumber;
    const startInput = document.getElementById('startNumberInput');
    
    if (annotations.length > 0) {
        // Mevcut numaraların en küçüğünü bul
        const existingNumbers = annotations.map(a => a.number);
        const minNumber = Math.min(...existingNumbers);
        
        // Input'tan gelen değer mevcut minimum'dan küçükse onu kullan
        const inputValue = startInput ? parseInt(startInput.value) : null;
        if (inputValue && inputValue < minNumber) {
            startNumber = inputValue;
        } else {
            startNumber = minNumber;
        }
    } else {
        startNumber = startInput ? (parseInt(startInput.value) || 1) : 1;
    }
    
    console.log('🔢 Yeniden numaralandırma başlıyor - Başlangıç:', startNumber);
    console.log('📊 Mevcut balon sayısı:', annotations.length);
    
    // GELIŞMIŞ SIRALAMA: Balon konumlarına göre
    // 1. Önce yukarıdan aşağıya (Y ekseni)
    // 2. Aynı seviyede ise soldan sağa (X ekseni)
    // 3. Tolerans: 30px (daha hassas)
    annotations.sort((a, b) => {
        // Balon pozisyonlarını kullan (ölçü dikdörtgeni değil!)
        const aBalloonY = a.balloon ? a.balloon.y : (a.rect.y + a.rect.height / 2);
        const bBalloonY = b.balloon ? b.balloon.y : (b.rect.y + b.rect.height / 2);
        const aBalloonX = a.balloon ? a.balloon.x : (a.rect.x + a.rect.width / 2);
        const bBalloonX = b.balloon ? b.balloon.x : (b.rect.x + b.rect.width / 2);
        
        // Önce Y eksenine göre (yukarıdan aşağıya) - 30px tolerans
        const yDiff = Math.abs(aBalloonY - bBalloonY);
        if (yDiff > 30) {
            return aBalloonY - bBalloonY;
        }
        
        // Aynı seviyedeyse X eksenine göre (soldan sağa)
        return aBalloonX - bBalloonX;
    });
    
    // Numaraları başlangıç numarasından itibaren ata
    annotations.forEach((ann, index) => {
        const oldNumber = ann.number;
        ann.number = startNumber + index;
        console.log(`  📌 Balon ${ann.id}: ${oldNumber} → ${ann.number} (Pos: ${Math.round(ann.balloon?.x || 0)}, ${Math.round(ann.balloon?.y || 0)})`);
    });
    
    // Balon sayacını güncelle - ÖNEMLI: Maksimum numaradan sonra başla
    const maxNumber = Math.max(...annotations.map(a => a.number));
    balloonCounter = maxNumber + 1;
    
    console.log(`💡 Bir sonraki balon numarası: ${balloonCounter}`);
    console.log(`✅ Balonlar yeniden numaralandı (${startNumber}-${maxNumber})`);
}

// Otomatik Balon Hizalama - Ölçülerin Dış Sınırlarına Göre
function autoAlignBalloons() {
    if (annotations.length === 0) {
        alert('Hizalanacak balon yok!');
        return;
    }
    
    // ÖNEMLİ: Numaraları yeniden sırala (sol üstten başlayarak)
    renumberAnnotations();
    
    const offset = 40; // Ölçülerden dışarıya mesafe
    const balloonRadius = 15;
    
    // Tüm dikdörtgenlerin dış sınırlarını bul
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    annotations.forEach(annotation => {
        const rect = annotation.rect;
        minX = Math.min(minX, rect.x);
        maxX = Math.max(maxX, rect.x + rect.width);
        minY = Math.min(minY, rect.y);
        maxY = Math.max(maxY, rect.y + rect.height);
    });
    
    // Hizalama çizgileri (ölçülerin DIŞINDA)
    const leftLineX = minX - offset;
    const rightLineX = maxX + offset;
    const topLineY = minY - offset;
    const bottomLineY = maxY + offset;
    
    // Her balonu KENDİ ÖLÇÜsüne en yakın kenara yerleştir
    annotations.forEach(annotation => {
        const rect = annotation.rect;
        const rectCenterX = rect.x + rect.width / 2;
        const rectCenterY = rect.y + rect.height / 2;
        
        // Bu ölçünün kenarlarından hizalama çizgilerine olan mesafeler
        const distToLeft = rectCenterX - leftLineX;
        const distToRight = rightLineX - rectCenterX;
        const distToTop = rectCenterY - topLineY;
        const distToBottom = bottomLineY - rectCenterY;
        
        // En yakın kenarı bul
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        
        let balloonX, balloonY;
        
        if (minDist === distToLeft) {
            // Sol kenara hizala
            balloonX = leftLineX;
            balloonY = rectCenterY;
        } else if (minDist === distToRight) {
            // Sağ kenara hizala
            balloonX = rightLineX;
            balloonY = rectCenterY;
        } else if (minDist === distToTop) {
            // Üst kenara hizala
            balloonX = rectCenterX;
            balloonY = topLineY;
        } else {
            // Alt kenara hizala
            balloonX = rectCenterX;
            balloonY = bottomLineY;
        }
        
        annotation.balloon = {
            x: balloonX,
            y: balloonY
        };
    });
    
    // Çakışmaları önle - aynı kenardaki balonları düzenle
    adjustOverlappingBalloons();
    
    console.log('🎨 Canvas yeniden çiziliyor...');
    
    // Canvas'ı yeniden çiz - ZORUNLU refresh
    redrawCanvas();
    
    // Tabloyu güncelle
    rebuildTable();
    
    console.log('✅ Balonlar hizalandı ve yeniden numaralandı');
    console.log('📊 Güncel balon numaraları:', annotations.map(a => `${a.id}:${a.number}`).join(', '));
    showNotification('Balonlar hizalandı ve numaralandı!', 'success');
}

// Çakışan balonları düzenle
function adjustOverlappingBalloons() {
    const groups = {
        left: [],
        right: [],
        top: [],
        bottom: []
    };
    
    // Tüm dikdörtgenlerin dış sınırlarını bul
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    annotations.forEach(annotation => {
        const rect = annotation.rect;
        minX = Math.min(minX, rect.x);
        maxX = Math.max(maxX, rect.x + rect.width);
        minY = Math.min(minY, rect.y);
        maxY = Math.max(maxY, rect.y + rect.height);
    });
    
    const offset = 40;
    const leftLineX = minX - offset;
    const rightLineX = maxX + offset;
    const topLineY = minY - offset;
    const bottomLineY = maxY + offset;
    
    // Balonları grupla
    annotations.forEach(annotation => {
        if (!annotation.balloon) return;
        
        const threshold = 20;
        
        if (Math.abs(annotation.balloon.x - leftLineX) < threshold) {
            groups.left.push(annotation);
        } else if (Math.abs(annotation.balloon.x - rightLineX) < threshold) {
            groups.right.push(annotation);
        } else if (Math.abs(annotation.balloon.y - topLineY) < threshold) {
            groups.top.push(annotation);
        } else if (Math.abs(annotation.balloon.y - bottomLineY) < threshold) {
            groups.bottom.push(annotation);
        }
    });
    
    // Her grubu sırala ve çakışmaları düzelt
    const minSpacing = 35; // Minimum balon arası mesafe
    
    // Sol grup - yukarıdan aşağıya sırala
    if (groups.left.length > 1) {
        groups.left.sort((a, b) => a.balloon.y - b.balloon.y);
        
        for (let i = 1; i < groups.left.length; i++) {
            const prev = groups.left[i - 1];
            const curr = groups.left[i];
            
            if (curr.balloon.y - prev.balloon.y < minSpacing) {
                curr.balloon.y = prev.balloon.y + minSpacing;
            }
        }
    }
    
    // Sağ grup - yukarıdan aşağıya sırala
    if (groups.right.length > 1) {
        groups.right.sort((a, b) => a.balloon.y - b.balloon.y);
        
        for (let i = 1; i < groups.right.length; i++) {
            const prev = groups.right[i - 1];
            const curr = groups.right[i];
            
            if (curr.balloon.y - prev.balloon.y < minSpacing) {
                curr.balloon.y = prev.balloon.y + minSpacing;
            }
        }
    }
    
    // Üst grup - soldan sağa sırala
    if (groups.top.length > 1) {
        groups.top.sort((a, b) => a.balloon.x - b.balloon.x);
        
        for (let i = 1; i < groups.top.length; i++) {
            const prev = groups.top[i - 1];
            const curr = groups.top[i];
            
            if (curr.balloon.x - prev.balloon.x < minSpacing) {
                curr.balloon.x = prev.balloon.x + minSpacing;
            }
        }
    }
    
    // Alt grup - soldan sağa sırala
    if (groups.bottom.length > 1) {
        groups.bottom.sort((a, b) => a.balloon.x - b.balloon.x);
        
        for (let i = 1; i < groups.bottom.length; i++) {
            const prev = groups.bottom[i - 1];
            const curr = groups.bottom[i];
            
            if (curr.balloon.x - prev.balloon.x < minSpacing) {
                curr.balloon.x = prev.balloon.x + minSpacing;
            }
        }
    }
}

// Çoklu ölçü işleme - Her ölçü için ayrı kutu
function handleMultipleDimensions(baseAnnotation, dimensions, wordBoxes) {
    console.log('🎯 Çoklu ölçü işleniyor:', dimensions.length, 'ölçü');
    // CRITICAL: wordBoxes array'ini console'a YAZMA
    console.log('📦 Kelime kutusu sayısı:', wordBoxes ? wordBoxes.length : 0);
    
    const message = `Bu alanda ${dimensions.length} ölçü bulundu:\n${dimensions.join(', ')}\n\nHepsini otomatik eklemek ister misiniz?`;
    
    if (confirm(message)) {
        // Koordinat tabanlı veya sıralı ekleme
        if (wordBoxes && wordBoxes.length > 0) {
            // Koordinatları kullanarak her ölçü için özel kutu
            wordBoxes.forEach((box, index) => {
                const dimension = box.text;
                
                // OCR koordinatları artık DIREKT - padding yok, scale yok
                const boxPadding = 3; // Kutu etrafına minimal padding
                
                // Koordinatlar 1:1 - sadece seçim başlangıcını ekle
                const rectX = baseAnnotation.rect.x + box.x - boxPadding;
                const rectY = baseAnnotation.rect.y + box.y - boxPadding;
                const rectW = box.width + (boxPadding * 2);
                const rectH = box.height + (boxPadding * 2);
                
                const annotation = {
                    id: balloonCounter + index,
                    rect: {
                        x: Math.max(0, rectX),
                        y: Math.max(0, rectY),
                        width: Math.min(rectW, canvas.width - rectX),
                        height: Math.min(rectH, canvas.height - rectY)
                    },
                    balloon: {
                        x: rectX + rectW + 30,
                        y: rectY + rectH / 2
                    },
                    dimension: dimension,
                    lowerTolerance: '',
                    upperTolerance: ''
                };
                
                applyDefaultTolerances(annotation);
                annotations.push(annotation);
                addTableRow(annotation);
                
                console.log(`  ✓ ${annotation.id}: ${dimension} @ (${rectX.toFixed(0)}, ${rectY.toFixed(0)})`);
            });
        } else {
            // Koordinat yoksa varsayılan davranış (tek kutu, yan yana balonlar)
            dimensions.forEach((dimension, index) => {
                const annotation = {
                    id: balloonCounter + index,
                    rect: {
                        x: baseAnnotation.rect.x,
                        y: baseAnnotation.rect.y,
                        width: baseAnnotation.rect.width,
                        height: baseAnnotation.rect.height
                    },
                    balloon: {
                        x: baseAnnotation.balloon.x + (index * 40),
                        y: baseAnnotation.balloon.y + (index * 40)
                    },
                    dimension: dimension,
                    lowerTolerance: '',
                    upperTolerance: ''
                };
                
                applyDefaultTolerances(annotation);
                annotations.push(annotation);
                addTableRow(annotation);
                
                console.log(`  ✓ ${annotation.id}: ${dimension}`);
            });
        }
        
        balloonCounter += dimensions.length;
        
        // Bellek temizliği - wordBoxes array'ini serbest bırak
        wordBoxes = null;
        
        redrawCanvas();
        
        showNotification(`✓ ${dimensions.length} ölçü eklendi!`, 'success');
    } else {
        // İlk ölçüyü kullan (normal davranış)
        baseAnnotation.dimension = dimensions[0];
        applyDefaultTolerances(baseAnnotation);
        annotations.push(baseAnnotation);
        addTableRow(baseAnnotation);
        balloonCounter++;
        redrawCanvas();
    }
}

// ═══════════════════════════════════════════════════════════
// OTOMATİK YEDEKLEME SİSTEMİ
// ═══════════════════════════════════════════════════════════

// Otomatik dosyaya kaydet (her 5 ölçüde bir)
function autoSaveToFile() {
    try {
        const saveData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            totalAnnotations: annotations.length,
            balloonCounter: balloonCounter,
            annotations: annotations,
            stats: ocrStats
        };
        
        const jsonStr = JSON.stringify(saveData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `drawing-backup-${Date.now()}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        console.log('💾 Otomatik yedek kaydedildi:', annotations.length, 'ölçü');
        showNotification('💾 Yedek dosyası indirildi!', 'info');
        
    } catch (e) {
        console.error('❌ Otomatik kaydetme hatası:', e);
    }
}

// Yedek dosyasını geri yükle
function loadBackupFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.annotations || !Array.isArray(data.annotations)) {
                alert('Geçersiz yedek dosyası!');
                return;
            }
            
            // Mevcut verileri temizle
            annotations = [];
            textAnnotations = [];
            const tableBody = document.getElementById('tableBody');
            tableBody.innerHTML = '';
            
            // Yedekten geri yükle
            annotations = data.annotations;
            textAnnotations = data.textAnnotations || [];
            balloonCounter = data.balloonCounter || annotations.length + 1;
            
            // Eski yedekler için geriye dönük uyumluluk
            annotations.forEach(ann => {
                if (!ann.balloonShape) ann.balloonShape = 'circle';
                if (!ann.balloonColor) ann.balloonColor = '#3498db';
                if (!ann.lineColor) ann.lineColor = '#2c3e50';
                if (!ann.textColor) ann.textColor = '#ffffff';
                if (!ann.fillType) ann.fillType = 'filled';
                if (!ann.number) ann.number = ann.id; // Eski sistemde number yoksa id kullan
                if (!ann.balloonSize) ann.balloonSize = 20;
                if (!ann.balloonTextSize) ann.balloonTextSize = 16;
                if (!ann.fontFamily) ann.fontFamily = 'Arial';
            });
            
            // Metin açıklamaları için geriye dönük uyumluluk
            textAnnotations.forEach(textAnn => {
                if (textAnn.hasBox === undefined) textAnn.hasBox = false;
                if (!textAnn.fontSize) textAnn.fontSize = 16;
                if (!textAnn.fontFamily) textAnn.fontFamily = 'Arial';
            });
            
            // Tabloyu doldur
            annotations.forEach(ann => addTableRow(ann));
            
            // Canvas'ı çiz
            redrawCanvas();
            
            console.log('✅ Yedek dosyası yüklendi:', annotations.length, 'ölçü');
            showNotification(`✓ ${annotations.length} ölçü geri yüklendi!`, 'success');
            
        } catch (err) {
            console.error('❌ Yedek yükleme hatası:', err);
            alert('Yedek dosyası okunamadı: ' + err.message);
        }
    };
    
    reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════
// SÜRÜKLENEBİLİR TOOLBAR SİSTEMİ - BASİT VE ÇALIŞAN
// ═══════════════════════════════════════════════════════════

// Global drag flag - herhangi bir toolbar taşınıyor mu?
window.isAnyToolbarDragging = false;

// Dikey mod uygulama fonksiyonu - global
function applyVerticalMode(toolbar, content) {
    toolbar.style.maxWidth = '140px';
    toolbar.style.width = '140px';
    content.style.flexDirection = 'column';
    content.style.maxWidth = '100%';
    content.style.width = '100%';
    content.style.gap = '3px';
    content.style.flexWrap = 'nowrap';
    
    const labels = content.querySelectorAll('label');
    labels.forEach(label => {
        if (!label.classList.contains('file-label')) {
            label.style.fontSize = '8px';
            label.style.display = 'block';
            label.style.marginBottom = '1px';
        }
    });
    
    const buttons = content.querySelectorAll('button, .btn, .file-label');
    buttons.forEach(btn => {
        btn.style.width = '100%';
        btn.style.fontSize = '8px';
        btn.style.padding = '2px 3px';
        btn.style.marginBottom = '1px';
        btn.style.whiteSpace = 'nowrap';
        btn.style.overflow = 'hidden';
        btn.style.textOverflow = 'ellipsis';
        btn.style.boxSizing = 'border-box';
    });
    
    const selects = content.querySelectorAll('select');
    selects.forEach(sel => {
        sel.style.width = '100%';
        sel.style.fontSize = '8px';
        sel.style.marginBottom = '1px';
        sel.style.padding = '1px';
        sel.style.boxSizing = 'border-box';
    });
    
    const inputs = content.querySelectorAll('input[type="number"], input[type="text"]');
    inputs.forEach(inp => {
        inp.style.width = '100%';
        inp.style.fontSize = '8px';
        inp.style.padding = '1px';
        inp.style.marginBottom = '1px';
        inp.style.boxSizing = 'border-box';
    });
    
    const divs = content.querySelectorAll('div');
    divs.forEach(div => {
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.width = '100%';
        div.style.boxSizing = 'border-box';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM yüklendi, toolbar sistemi başlatılıyor...');
    
    const toolbars = Array.from(document.querySelectorAll('.draggable-toolbar'));
    
    console.log(`Bulunan toolbar sayısı: ${toolbars.length}`);
    
    if (toolbars.length === 0) {
        console.error('Hiç toolbar bulunamadı!');
        return;
    }
    
    // Her toolbar için ABSOLUTE position ve başlangıç konumu ayarla
    toolbars.forEach((toolbar, index) => {
        let initialX = parseInt(toolbar.dataset.initialX) || 10;
        const initialY = parseInt(toolbar.dataset.initialY) || 10;
        
        // Eğer initialX > 1000 ise, sağ kenara yerleştir (dikey bölge)
        if (initialX > 1000) {
            initialX = window.innerWidth - 160; // Sağdan 160px (dikey bölgede)
            console.log(`Bar ${index} sağ kenara taşındı: x=${initialX}`);
        }
        
        toolbar.style.position = 'absolute'; // ABSOLUTE - sayfa ile hareket eder
        toolbar.style.left = `${initialX}px`;
        toolbar.style.top = `${initialY + 120}px`; // Header yüksekliği kadar aşağı
        toolbar.style.zIndex = String(1000 + index);
        
        console.log(`Bar ${index} ayarlandı: x=${initialX}, y=${initialY + 120}, zIndex=${1000 + index}`);
        
        // İlk yüklemede orientation kontrol et (x=5 ise dikey, x>window.width-200 ise dikey)
        if (initialX < 200 || initialX > window.innerWidth - 200) {
            // Dikey moda geçir
            setTimeout(() => {
                const content = toolbar.querySelector('.toolbar-content[data-content]');
                if (content) {
                    applyVerticalMode(toolbar, content);
                    console.log(`Bar ${index} başlangıçta DİKEY moda geçirildi (x=${initialX})`);
                }
            }, 100);
        }
    });
    
    // Her toolbar için sürükleme
    toolbars.forEach((toolbar, toolbarIndex) => {
        console.log(`Toolbar ${toolbarIndex} için sürükleme sistemi kuruluyor...`);
        
        let isDragging = false;
        let startX = 0, startY = 0;
        let currentX = 0, currentY = 0;
        
        const header = toolbar.querySelector('.toolbar-header');
        if (!header) {
            console.error(`Toolbar ${toolbarIndex} header bulunamadı!`);
            return;
        }
        
        console.log(`Toolbar ${toolbarIndex} header bulundu, event listener'lar ekleniyor...`);
        
        // Sadece header'a event ekle - SADECE header'ın kendisine!
        header.addEventListener('contextmenu', (e) => e.preventDefault());
        
        let isDraggingStarted = false;
        
        header.addEventListener('mousedown', (e) => {
            // SADECE header'ın tam kendisine tıklanırsa
            if (e.target === header) {
                console.log('Header\'a tıklandı, drag başlıyor');
                isDraggingStarted = true;
                startDrag(e);
            } else {
                console.log('Header içinde başka element, drag iptal');
                isDraggingStarted = false;
            }
        });
        
        header.addEventListener('touchstart', (e) => {
            if (e.target === header) {
                isDraggingStarted = true;
                startDrag(e);
            } else {
                isDraggingStarted = false;
            }
        }, { passive: false });
        
        // Content'e tıklanınca kesinlikle drag başlamasın
        const content = toolbar.querySelector('.toolbar-content');
        if (content) {
            content.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isDraggingStarted = false;
            }, true); // Capture phase
            
            content.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                isDraggingStarted = false;
            }, { passive: false, capture: true });
        }
        
        function startDrag(e) {
            if (!isDraggingStarted) {
                console.log('isDraggingStarted false, iptal');
                return;
            }
            
            console.log(`Toolbar ${toolbarIndex} sürükleme başladı`);
            e.preventDefault();
            isDragging = true;
            window.isAnyToolbarDragging = true; // Global flag
            
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
            
            const rect = toolbar.getBoundingClientRect();
            startX = clientX - rect.left;
            startY = clientY - rect.top;
            
            toolbar.style.zIndex = '9999';
            header.style.cursor = 'grabbing';
            
            document.addEventListener('mousemove', doDrag);
            document.addEventListener('touchmove', doDrag, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }
        
        function doDrag(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
            
            currentX = clientX - startX;
            currentY = clientY - startY;
            
            // Ekran sınırları - daha esnek
            const minX = 0;
            const minY = 120; // Header altında
            const maxX = window.innerWidth - 100; // Sağ kenar için boşluk
            const maxY = window.innerHeight + window.scrollY - 50;
            
            if (currentX < minX) currentX = minX;
            if (currentY < minY) currentY = minY;
            if (currentX > maxX) currentX = maxX;
            if (currentY > maxY) currentY = maxY;
            
            toolbar.style.left = `${currentX}px`;
            toolbar.style.top = `${currentY}px`;
            
            // Dikey/Yatay mod - kenarlarda dikey
            updateOrientation(toolbar, clientX);
        }
        
        // Dikey/Yatay mod kontrolü
        function updateOrientation(toolbar, mouseX) {
            const content = toolbar.querySelector('.toolbar-content[data-content]');
            if (!content) {
                console.error('Content div bulunamadı!', toolbar);
                return;
            }
            
            const leftEdge = 200; // Sol 200px
            const rightEdge = window.innerWidth - 200; // Sağdan 200px
            
            console.log('Orientation kontrol - mouseX:', mouseX, 'leftEdge:', leftEdge, 'rightEdge:', rightEdge);
            
            if (mouseX < leftEdge || mouseX > rightEdge) {
                // DİKEY MOD
                console.log('DİKEY MOD AKTIF');
                toolbar.style.maxWidth = '140px';
                toolbar.style.width = '140px';
                content.style.flexDirection = 'column';
                content.style.maxWidth = '100%';
                content.style.width = '100%';
                content.style.gap = '3px';
                content.style.flexWrap = 'nowrap';
                
                // Elemanları dikey modda kompakt yap
                const labels = content.querySelectorAll('label');
                labels.forEach(label => {
                    if (!label.classList.contains('file-label')) {
                        label.style.fontSize = '8px';
                        label.style.display = 'block';
                        label.style.marginBottom = '1px';
                    }
                });
                
                const buttons = content.querySelectorAll('button, .btn, .file-label');
                buttons.forEach(btn => {
                    btn.style.width = '100%';
                    btn.style.fontSize = '8px';
                    btn.style.padding = '2px 3px';
                    btn.style.marginBottom = '1px';
                    btn.style.whiteSpace = 'nowrap';
                    btn.style.overflow = 'hidden';
                    btn.style.textOverflow = 'ellipsis';
                    btn.style.boxSizing = 'border-box';
                });
                
                const selects = content.querySelectorAll('select');
                selects.forEach(sel => {
                    sel.style.width = '100%';
                    sel.style.fontSize = '8px';
                    sel.style.marginBottom = '1px';
                    sel.style.padding = '1px';
                    sel.style.boxSizing = 'border-box';
                });
                
                const inputs = content.querySelectorAll('input[type="number"], input[type="text"]');
                inputs.forEach(inp => {
                    inp.style.width = '100%';
                    inp.style.fontSize = '8px';
                    inp.style.padding = '1px';
                    inp.style.marginBottom = '1px';
                    inp.style.boxSizing = 'border-box';
                });
                
                const divs = content.querySelectorAll('div');
                divs.forEach(div => {
                    div.style.display = 'flex';
                    div.style.flexDirection = 'column';
                    div.style.width = '100%';
                    div.style.boxSizing = 'border-box';
                });
            } else {
                // YATAY MOD
                console.log('YATAY MOD AKTIF');
                toolbar.style.maxWidth = '';
                toolbar.style.width = '';
                content.style.flexDirection = '';
                content.style.maxWidth = '';
                content.style.width = '';
                content.style.gap = '';
                content.style.flexWrap = '';
                
                // Stilleri sıfırla
                const labels = content.querySelectorAll('label');
                labels.forEach(label => {
                    label.style.fontSize = '';
                    label.style.display = '';
                    label.style.marginBottom = '';
                });
                
                const buttons = content.querySelectorAll('button, .btn, .file-label');
                buttons.forEach(btn => {
                    btn.style.width = '';
                    btn.style.fontSize = '';
                    btn.style.padding = '';
                    btn.style.marginBottom = '';
                    btn.style.whiteSpace = '';
                    btn.style.overflow = '';
                    btn.style.textOverflow = '';
                    btn.style.boxSizing = '';
                });
                
                const selects = content.querySelectorAll('select');
                selects.forEach(sel => {
                    sel.style.width = '';
                    sel.style.fontSize = '';
                    sel.style.marginBottom = '';
                    sel.style.padding = '';
                    sel.style.boxSizing = '';
                });
                
                const inputs = content.querySelectorAll('input[type="number"], input[type="text"]');
                inputs.forEach(inp => {
                    inp.style.width = '';
                    inp.style.fontSize = '';
                    inp.style.padding = '';
                    inp.style.marginBottom = '';
                    inp.style.boxSizing = '';
                });
                
                const divs = content.querySelectorAll('div');
                divs.forEach(div => {
                    div.style.display = '';
                    div.style.flexDirection = '';
                    div.style.width = '';
                    div.style.boxSizing = '';
                });
            }
        }
        
        function stopDrag() {
            if (!isDragging) return;
            console.log(`Toolbar ${toolbarIndex} sürükleme bitti: x=${currentX}, y=${currentY}`);
            isDragging = false;
            isDraggingStarted = false;
            header.style.cursor = 'move';
            toolbar.style.zIndex = String(1000 + toolbarIndex);
            
            // Global flag'i biraz gecikmeli sıfırla (dropdown için)
            setTimeout(() => {
                window.isAnyToolbarDragging = false;
            }, 150);
            
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('touchmove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
            
            // Çakışma kontrolü ve otomatik kaydırma
            checkAndResolveCollisions();
        }
        
        // Çakışma kontrolü ve çözümü
        function checkAndResolveCollisions() {
            const allToolbars = document.querySelectorAll('.draggable-toolbar');
            let attempts = 0;
            const maxAttempts = 5;
            
            function checkOnce() {
                const currentRect = toolbar.getBoundingClientRect();
                let hasCollision = false;
                
                allToolbars.forEach((otherToolbar, otherIndex) => {
                    if (otherToolbar === toolbar) return;
                    
                    const otherRect = otherToolbar.getBoundingClientRect();
                    
                    // Basit çakışma kontrolü - tolerance YOK
                    const isColliding = !(
                        currentRect.right <= otherRect.left || 
                        currentRect.left >= otherRect.right || 
                        currentRect.bottom <= otherRect.top || 
                        currentRect.top >= otherRect.bottom
                    );
                    
                    if (isColliding) {
                        console.log(`🔴 ÇAKIŞMA! Toolbar ${toolbarIndex} <-> Toolbar ${otherIndex}`);
                        hasCollision = true;
                        
                        // Merkez noktalarına göre karar ver
                        const currentCenterX = (currentRect.left + currentRect.right) / 2;
                        const currentCenterY = (currentRect.top + currentRect.bottom) / 2;
                        const otherCenterX = (otherRect.left + otherRect.right) / 2;
                        const otherCenterY = (otherRect.top + otherRect.bottom) / 2;
                        
                        const deltaX = currentCenterX - otherCenterX;
                        const deltaY = currentCenterY - otherCenterY;
                        
                        // Hangi yönde daha fazla ayrık?
                        if (Math.abs(deltaX) > Math.abs(deltaY)) {
                            // Yatayda ayır
                            if (deltaX > 0) {
                                // Sağa it - daha fazla mesafe
                                currentX = otherRect.right + 35;
                            } else {
                                // Sola it
                                currentX = otherRect.left - currentRect.width - 35;
                            }
                        } else {
                            // Dikeyde ayır
                            if (deltaY > 0) {
                                // Aşağı it
                                currentY = otherRect.bottom + 35;
                            } else {
                                // Yukarı it
                                currentY = otherRect.top - currentRect.height - 35;
                            }
                        }
                        
                        // Sınırları kontrol et
                        const minX = 0;
                        const minY = 120;
                        const maxX = window.innerWidth - currentRect.width - 10;
                        const maxY = window.innerHeight + window.scrollY - currentRect.height - 10;
                        
                        currentX = Math.max(minX, Math.min(maxX, currentX));
                        currentY = Math.max(minY, Math.min(maxY, currentY));
                        
                        toolbar.style.left = `${currentX}px`;
                        toolbar.style.top = `${currentY}px`;
                        
                        console.log(`✅ Kaydırıldı: x=${currentX}, y=${currentY}`);
                    }
                });
                
                // Eğer hala çakışma varsa ve deneme hakkımız varsa tekrar kontrol et
                if (hasCollision && attempts < maxAttempts) {
                    attempts++;
                    setTimeout(checkOnce, 50);
                }
            }
            
            checkOnce();
        }
    });
    
    console.log('Toolbar sistemi başarıyla kuruldu!');
});


