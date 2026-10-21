"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PRICING_SETTINGS,
  PAINT_OPTIONS,
  type PaintColorId,
  type PricingSettings
} from "@/lib/pricing";

type SliceResult = {
  status: string;
  filename: string;
  filament_grams: number;
  estimated_seconds: number;
  estimated_minutes: number;
  layer_height_mm?: number;
  note?: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SliceResult | null>(null);
  const [paintColor, setPaintColor] = useState<PaintColorId>("none");
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS);
  const [pricingAvailable, setPricingAvailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/pricing", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Fiyat ayarları alınamadı.");
        return response.json();
      })
      .then(data => {
        if (active && typeof data?.filamentPricePerGram === "number") {
          setPricing(data);
          setPricingAvailable(true);
        }
      })
      .catch(() => {
        if (active) setPricingAvailable(false);
      });
    return () => { active = false; };
  }, []);

  const selectedPaint = PAINT_OPTIONS.find(option => option.id === paintColor) ?? PAINT_OPTIONS[0];
  const filamentCost = result ? result.filament_grams * pricing.filamentPricePerGram : 0;
  const machineCost = result ? (result.estimated_seconds / 3600) * pricing.machinePricePerHour : 0;
  const paintCost = result && paintColor !== "none" ? pricing.paintLaborFee : 0;
  const quoteTotal = filamentCost + machineCost + paintCost;

  function selectFile(selected: File | null) {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".stl")) {
      setError("Yalnızca .stl dosyaları kabul edilir.");
      return;
    }
    if (selected.size === 0 || selected.size > 25 * 1024 * 1024) {
      setError("Dosya boş olamaz ve 25 MB sınırını aşamaz.");
      return;
    }
    setFile(selected);
    setError("");
    setResult(null);
  }

  async function readJson(response: Response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(response.status === 413 ? "İstek boyut sınırını aştı." : "Sunucudan geçerli bir yanıt alınamadı.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Lütfen bir STL dosyası seçin.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const urlResponse = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size })
      });
      const urlData = await readJson(urlResponse);
      if (!urlResponse.ok) throw new Error(urlData?.error || "Yükleme bağlantısı alınamadı.");
      if (typeof urlData.uploadUrl !== "string" || typeof urlData.key !== "string") {
        throw new Error("Sunucunun yükleme yanıtı geçersiz.");
      }

      const uploadResponse = await fetch(urlData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file
      });
      if (!uploadResponse.ok) throw new Error("STL dosyası R2'ye yüklenemedi. Bucket CORS ayarlarını kontrol edin.");

      const sliceResponse = await fetch("/api/slice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: urlData.key, filename: file.name })
      });
      const sliceData = await readJson(sliceResponse);
      if (!sliceResponse.ok) throw new Error(sliceData?.error || "Dilimleme başarısız oldu.");
      setResult(sliceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/"><span className="brandMark">K</span>KAYATECH<span className="brandLight">3D</span></a>
        <div className="navActions"><span className="navTag">3D BASKI ATÖLYESİ</span><a className="adminNavLink" href="/admin">Yönetici girişi ↗</a></div>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span className="dot" />GERÇEK DİLİMLEMEYLE TEKLİF</div>
        <h1>Fikrini <span>üç boyuta</span><br />taşı.</h1>
        <p className="intro">STL modelini yükle. Baskı süresini ve filament tüketimini dilimleme verileriyle hesaplayalım.</p>

        <div className="contentGrid">
          <form className="uploadCard" onSubmit={submit}>
            <div className="cardTop"><div><p className="step">01 / MODEL</p><h2>STL dosyanı yükle</h2></div><span className="fileIcon">↥</span></div>
            <input ref={inputRef} className="hiddenInput" type="file" accept=".stl,model/stl,application/sla" onChange={event => selectFile(event.target.files?.[0] ?? null)} />
            <button type="button" className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0] ?? null); }}>
              <span className="uploadGlyph">↑</span>
              <strong>{file ? file.name : "Dosyanı buraya bırak"}</strong>
              <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Seçildi` : "veya bilgisayarından seç"}</span>
              <small>STL · En fazla 25 MB</small>
            </button>

            <fieldset className="paintSelector">
              <legend>Renk / boya seçeneği</legend>
              <p>Boyasız seçeneği ücretsizdir. Renkli boya seçimi işçilik ücretini ekler.</p>
              <div className="paintOptions">
                {PAINT_OPTIONS.map(option => (
                  <button key={option.id} type="button" className={`paintOption ${paintColor === option.id ? "active" : ""}`} aria-pressed={paintColor === option.id} onClick={() => setPaintColor(option.id)}>
                    <span className={`paintSwatch ${option.id === "none" ? "paintSwatchNone" : ""}`} style={option.hex ? { backgroundColor: option.hex } : undefined} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
              <div className="paintInfo"><span>Seçilen seçenek</span><strong>{selectedPaint.label}</strong><span className="paintInfoFee">{paintColor === "none" ? "Ek boya işçiliği yok" : `+${pricing.paintLaborFee.toLocaleString("tr-TR")} TL işçilik`}</span></div>
            </fieldset>

            <button className="primary" type="submit" disabled={busy || !file}>{busy ? "Model yükleniyor ve dilimleniyor…" : "Modeli analiz et"}{!busy && <span> ↗</span>}</button>
            <p className="privacy">Dosyan analiz için işlenir. Bu aşamada otomatik fiyat veya sipariş oluşturulmaz.</p>
            {error && <div className="error" role="alert">{error}</div>}
          </form>

          <section className="resultCard" aria-live="polite">
            <p className="step">02 / ANALİZ SONUCU</p>
            {busy ? (
              <div className="empty"><span className="spinner dark" /><h2>Model analiz ediliyor</h2><p>Dosya güvenli depolamaya yükleniyor; ardından filament ve süre hesaplanıyor.</p></div>
            ) : result ? (
              <div className="result">
                <div className="successLine">✓ DİLİMLEME TAMAMLANDI</div>
                <h2>{result.filename}</h2>
                <div className="metrics">
                  <div><small>Filament tüketimi</small><strong>{result.filament_grams.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} <i>g</i></strong></div>
                  <div><small>Tahmini baskı süresi</small><strong>{result.estimated_minutes.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} <i>dk</i></strong></div>
                </div>
                <div className="detail"><span>Katman yüksekliği</span><strong>{result.layer_height_mm ? result.layer_height_mm.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "—"} mm</strong></div>
                <div className="quoteSummary">
                  <p className="step">03 / TAHMİNİ FİYAT</p>
                  <div className="quoteLine"><span>Filament · {result.filament_grams.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} g × {pricing.filamentPricePerGram.toLocaleString("tr-TR")} TL</span><strong>{filamentCost.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL</strong></div>
                  <div className="quoteLine"><span>Makine · {(result.estimated_seconds / 3600).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} sa × {pricing.machinePricePerHour.toLocaleString("tr-TR")} TL</span><strong>{machineCost.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL</strong></div>
                  <div className="quoteLine"><span>Boya işçiliği · {selectedPaint.label}</span><strong>{paintCost.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL</strong></div>
                  <div className="quoteGrandTotal"><span>Tahmini toplam</span><strong>{quoteTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</strong></div>
                  {!pricingAvailable && <p className="quoteWarning">Kaydedilmiş fiyat ayarlarına erişilemedi; varsayılan rakamlar gösteriliyor.</p>}
                </div>
                <p className="disclaimer">{result.note || "Süre ve gramaj tahminidir; fiyat baskı ayarlarına göre değişebilir."} KDV, boya malzemesi, fire ve ek işçilik henüz hesaba dahil değildir.</p>
              </div>
            ) : (
              <div className="empty"><div className="cube">◇</div><h2>Sonuç burada görünecek</h2><p>STL dosyanı yükleyip analizi başlattığında gramaj, süre ve tahmini fiyat burada görüntülenir.</p><div className="miniSteps"><span>01 <b>Yükle</b></span><span>02 <b>Dilimle</b></span><span>03 <b>Fiyatı gör</b></span></div></div>
            )}
          </section>
        </div>
      </section>

      <footer><span>© {new Date().getFullYear()} KAYATECH3D</span><span>Üretime giden yol, doğru hesaplamayla başlar.</span></footer>
    </main>
  );
}
