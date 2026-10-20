
import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

export async function POST(request: NextRequest) {
  try {
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      return NextResponse.json(
        { error: "R2 ayarları eksik." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const filename = body?.filename;
    const size = body?.size;

    if (
      typeof filename !== "string" ||
      !filename.toLowerCase().endsWith(".stl") ||
      typeof size !== "number" ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > 25 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: "Geçerli, en fazla 25 MB boyutunda bir STL dosyası gerekli." },
        { status: 400 }
      );
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    });

    const key = `uploads/${randomUUID()}.stl`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "application/octet-stream"
      }),
      { expiresIn: 300 }
    );

    return NextResponse.json({ uploadUrl, key });
  } catch (error) {
    console.error("R2 yükleme URL'si oluşturulamadı:", error);
    return NextResponse.json(
      { error: "Yükleme bağlantısı oluşturulamadı." },
      { status: 500 }
    );
  }
}
