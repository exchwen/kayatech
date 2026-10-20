
import { GoogleAuth } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SERVICE_URL = process.env.SLICER_SERVICE_URL;
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    if (!SERVICE_URL) {
      return NextResponse.json(
        { error: "Dilimleme servisi yapılandırılmamış." },
        { status: 500 }
      );
    }

    const incoming = await request.formData();
    const file = incoming.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "STL dosyası gönderilmedi." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".stl")) {
      return NextResponse.json(
        { error: "Yalnızca STL dosyaları kabul edilir." },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Dosya boş olamaz ve 25 MB sınırını aşamaz." },
        { status: 413 }
      );
    }

    const credentialsJson =
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!credentialsJson) {
      return NextResponse.json(
        { error: "Google servis hesabı yapılandırılmamış." },
        { status: 500 }
      );
    }

    const credentials = JSON.parse(credentialsJson);

    const auth = new GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform"
      ]
    });

    const client = await auth.getIdTokenClient(SERVICE_URL);

    const form = new FormData();
    form.append(
      "file",
      new Blob([await file.arrayBuffer()], {
        type: "application/octet-stream"
      }),
      file.name
    );

    const response = await client.request({
      url: `${SERVICE_URL.replace(/\/$/, "")}/slice`,
      method: "POST",
      data: form,
      timeout: 270000
    });

    return NextResponse.json(response.data);
  } catch (error: unknown) {
    const err = error as {
      response?: { status?: number };
      message?: string;
    };

    console.error("STL dilimleme hatası:", err.message);

    return NextResponse.json(
      { error: "Dilimleme başarısız oldu. Sunucu ayarlarını kontrol edin." },
      { status: err.response?.status || 502 }
    );
  }
}
