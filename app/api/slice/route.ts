
import { GoogleAuth } from "google-auth-library";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SERVICE_URL = process.env.SLICER_SERVICE_URL;
const MAX_BYTES = 25 * 1024 * 1024;

function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 ayarları eksik.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

export async function POST(request: NextRequest) {
  let key: string | undefined;
  let bucket: string | undefined;
  let s3: S3Client | undefined;

  try {
    if (!SERVICE_URL) {
      return NextResponse.json(
        { error: "Dilimleme servisi yapılandırılmamış." },
        { status: 500 }
      );
    }

    bucket = process.env.R2_BUCKET_NAME;

    if (!bucket) {
      return NextResponse.json(
        { error: "R2 bucket ayarı eksik." },
        { status: 500 }
      );
    }

    const body = await request.json();
    key = body?.key;

    if (
      typeof key !== "string" ||
      !/^uploads\/[0-9a-f-]{36}\.stl$/i.test(key)
    ) {
      return NextResponse.json(
        { error: "Geçersiz dosya anahtarı." },
        { status: 400 }
      );
    }

    s3 = createR2Client();

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    if (!object.Body) {
      return NextResponse.json(
        { error: "R2 dosyası okunamadı." },
        { status: 404 }
      );
    }

    if (
      object.ContentLength === undefined ||
      object.ContentLength <= 0 ||
      object.ContentLength > MAX_BYTES
    ) {
      return NextResponse.json(
        { error: "Dosya boş veya 25 MB sınırını aşıyor." },
        { status: 413 }
      );
    }

    const bytes = await object.Body.transformToByteArray();

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Dosya boş veya 25 MB sınırını aşıyor." },
        { status: 413 }
      );
    }

    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!credentialsJson) {
      return NextResponse.json(
        { error: "Google servis hesabı yapılandırılmamış." },
        { status: 500 }
      );
    }

    const credentials = JSON.parse(credentialsJson);

    const auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });

    const client = await auth.getIdTokenClient(SERVICE_URL);

    const form = new FormData();
    const fileBuffer = new ArrayBuffer(bytes.byteLength);
new Uint8Array(fileBuffer).set(bytes);

form.append(
  "file",
  new Blob([fileBuffer], { type: "application/octet-stream" }),
  "model.stl"
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
      name?: string;
      message?: string;
    };

console.error("STL dilimleme hatası:", {
  name: err.name,
  message: err.message,
  status: err.response?.status,
  responseData: err.response?.data
});

    return NextResponse.json(
      {
        error:
          err.name === "NoSuchKey"
            ? "R2'de dosya bulunamadı. Dosyayı yeniden yükleyin."
            : "Dilimleme başarısız oldu. Sunucu ayarlarını kontrol edin."
      },
      { status: err.response?.status || 502 }
    );
  } finally {
    if (s3 && bucket && key) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key
          })
        );
      } catch (error) {
        console.error("Geçici R2 dosyası silinemedi:", error);
      }

      s3.destroy();
    }
  }
}
