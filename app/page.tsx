
"use client";

import { useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  function selectFile(selected: File | null) {
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith(".stl")) {
      setError("Yalnızca .stl dosyası kabul edilir.");
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
      throw new Error(
        response.status === 413
          ? "İstek boyut sınırını aştı."
          : "Sunucudan geçerli bir yanıt alınamadı."
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!file) {
      setError("Lütfen bir STL dosyası seçin.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      // 1. R2 için geçici, imzalı yükleme URL'si al.
      const urlResponse = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          size: file.size
        })
      });

      const urlData = await readJson(urlResponse);

      if (!urlResponse.ok) {
        throw new Error(urlData?.error || "Yükleme bağlantısı alınamadı.");
      }

      if (
        typeof urlData.uploadUrl !== "string" ||
        typeof urlData.key !== "string"
      ) {
        throw new Error("Sunucunun yükleme yanıtı geçersiz.");
      }

      // 2. Dosyayı Vercel üzerinden geçirmeden doğrudan R2'ye yükle.
      const uploadResponse = await fetch(urlData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error(
          "STL dosyası R2'ye yüklenemedi. Bucket CORS ayarlarını kontrol edin."
        );
      }

      // 3. R2 nesne anahtarını dilimleme API'sine gönder.
      const sliceResponse = await fetch("/api/slice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: urlData.key,
          filename: file.name
        })
      });

      const sliceData = await readJson(sliceResponse);

      if (!sliceResponse.ok) {
        throw new Error(sliceData?.error || "Dilimleme başarısız oldu.");
      }

      setResult(sliceData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Beklenmeyen bir hata oluştu."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="#">
          <span className="brandMark">K</span>
          KAYATECH<span className="brandLight">3D</span>
        </a>
        <span className="navTag">3D BASKI ATÖLYESİ</span>
      </nav>

      <section className="hero">
        <div className="eyebrow">
          <span className="dot" />
          GERÇEK DİLİMLEMEYLE TEKLİF
        </div>

        <h1>
          Fikrini <span>üç boyuta</span>
          <br />
          taşı.
        </h1>

        <p className="intro">
          STL modelini yükle. Baskı süresini ve filament
          tüketimini dilimleme verileriyle hesaplayalım.
        </p>

        <div className="contentGrid">
          <form className="uploadCard" onSubmit={submit}>
            <div className="cardTop">
              <div>
                <p className="step">01 / MODEL</p>
                <h2>STL dosyanı yükle</h2>
              </div>
              <span className="fileIcon">↥</span>
            </div>

            <input
              ref={inputRef}
              className="hiddenInput"
              type="file"
              accept=".stl,model/stl,application/sla"
              onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              className="dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                selectFile(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <span className="uploadGlyph">↑</span>
              <strong>
                {file ? file.name : "Dosyanı buraya bırak"}
              </strong>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Seçildi`
                  : "veya bilgisayarından seç"}
              </span>
              <small>STL · En fazla 25 MB</small>
            </button>

            <button
              className="primary"
              type="submit"
              disabled={busy || !file}
            >
              {busy ? "Model yükleniyor ve dilimleniyor…" : "Modeli analiz et"}
              {!busy && <span>↗</span>}
            </button>

            <p className="privacy">
              Dosyan analiz için işlenir. Bu aşamada otomatik
              fiyat veya sipariş oluşturulmaz.
            </p>

            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
          </form>

          <section className="resultCard" aria-live="polite">
            <p className="step">02 / ANALİZ SONUCU</p>

            {busy ? (
              <div className="empty">
                <span className="spinner dark" />
                <h2>Model analiz ediliyor</h2>
                <p>
                  Dosya güvenli depolamaya yükleniyor;
                  ardından filament ve süre hesaplanıyor.
                </p>
              </div>
            ) : result ? (
              <div className="result">
                <div className="successLine">
                  ✓ DİLİMLEME TAMAMLANDI
                </div>

                <h2>{result.filename}</h2>

                <div className="metrics">
                  <div>
                    <small>Filament tüketimi</small>
                    <strong>
                      {result.filament_grams.toLocaleString("tr-TR", {
                        maximumFractionDigits: 3
                      })}{" "}
                      <i>g</i>
                    </strong>
                  </div>

                  <div>
                    <small>Tahmini baskı süresi</small>
                    <strong>
                      {result.estimated_minutes.toLocaleString("tr-TR", {
                        maximumFractionDigits: 2
                      })}{" "}
                      <i>dk</i>
                    </strong>
                  </div>
                </div>

                <div className="detail">
                  <span>Katman yüksekliği</span>
                  <strong>
                    {result.layer_height_mm
                      ? result.layer_height_mm.toLocaleString("tr-TR", {
                          maximumFractionDigits: 2
                        })
                      : "—"}{" "}
                    mm
                  </strong>
                </div>

                <p className="disclaimer">
                  {result.note ||
                    "Süre ve gramaj tahminidir; sonuç baskı ayarlarına göre değişebilir."}
                </p>
              </div>
            ) : (
              <div className="empty">
                <div className="cube">◇</div>
                <h2>Sonuç burada görünecek</h2>
                <p>
                  STL dosyanı yükleyip analizi başlattığında
                  gramaj ve tahmini baskı süresi burada görüntülenir.
                </p>
                <div className="miniSteps">
                  <span>01 <b>Yükle</b></span>
                  <span>02 <b>Dilimle</b></span>
                  <span>03 <b>Sonucu gör</b></span>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>

      <footer>
        <span>© {new Date().getFullYear()} KAYATECH3D</span>
        <span>Üretime giden yol, doğru hesaplamayla başlar.</span>
      </footer>
    </main>
  );
}
