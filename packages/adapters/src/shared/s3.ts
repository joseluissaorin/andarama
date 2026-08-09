import { AwsClient } from "aws4fetch";

/**
 * Firma SigV4 para prefirmar subidas directas contra un endpoint S3
 * compatible: R2 (Cloudflare) o MinIO/S3 (self-host). Solo se usa para
 * PREFIRMAR URLs; las operaciones de servidor usan el binding R2 o el FS.
 */

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export class S3Presigner {
  private client: AwsClient;

  constructor(private cfg: S3Config) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: "s3",
      region: cfg.region ?? "auto",
    });
  }

  private objectUrl(key: string, query = ""): string {
    const base = this.cfg.endpoint.replace(/\/$/, "");
    return `${base}/${this.cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}${query}`;
  }

  async presignPut(key: string, expiresSeconds = 3600): Promise<string> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
    const signed = await this.client.sign(new Request(url.toString(), { method: "PUT" }), {
      aws: { signQuery: true },
    });
    return signed.url;
  }

  async createMultipartUpload(key: string, contentType?: string): Promise<string> {
    const url = this.objectUrl(key, "?uploads=");
    const res = await this.client.fetch(url, {
      method: "POST",
      headers: contentType != null ? { "content-type": contentType } : undefined,
    });
    if (!res.ok) throw new Error(`S3 createMultipartUpload fallo: ${res.status} ${await res.text()}`);
    const xml = await res.text();
    const m = /<UploadId>([^<]+)<\/UploadId>/.exec(xml);
    if (m == null) throw new Error("S3 createMultipartUpload: sin UploadId");
    return m[1]!;
  }

  async presignUploadPart(key: string, uploadId: string, partNumber: number, expiresSeconds = 3600): Promise<string> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set("partNumber", String(partNumber));
    url.searchParams.set("uploadId", uploadId);
    url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
    const signed = await this.client.sign(new Request(url.toString(), { method: "PUT" }), {
      aws: { signQuery: true },
    });
    return signed.url;
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set("uploadId", uploadId);
    const body = `<CompleteMultipartUpload>${parts
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
      .join("")}</CompleteMultipartUpload>`;
    const res = await this.client.fetch(url.toString(), { method: "POST", body });
    if (!res.ok) throw new Error(`S3 completeMultipart fallo: ${res.status} ${await res.text()}`);
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set("uploadId", uploadId);
    await this.client.fetch(url.toString(), { method: "DELETE" });
  }
}
