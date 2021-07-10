import * as utils from "@actions/cache/lib/internal/cacheUtils";
import { CompressionMethod } from "@actions/cache/lib/internal/constants";
import * as core from "@actions/core";
import * as minio from "minio";

export function newMinio() {
  return new minio.Client({
    endPoint: core.getInput("endpoint"),
    port: getInputAsInt("port"),
    useSSL: !getInputAsBoolean("insecure"),
    accessKey: core.getInput("accessKey"),
    secretKey: core.getInput("secretKey"),
  });
}

export function getInputAsBoolean(
  name: string,
  options?: core.InputOptions
): boolean {
  return core.getInput(name, options) === "true";
}

export function getInputAsArray(
  name: string,
  options?: core.InputOptions
): string[] {
  return core
    .getInput(name, options)
    .split("\n")
    .map((s) => s.trim())
    .filter((x) => x !== "");
}

export function getInputAsInt(
  name: string,
  options?: core.InputOptions
): number | undefined {
  const value = parseInt(core.getInput(name, options));
  if (isNaN(value) || value < 0) {
    return undefined;
  }
  return value;
}

export function formatSize(value?: number, format = "bi") {
  if (!value) return "";
  const [multiple, k, suffix] = (format === "bi"
    ? [1000, "k", "B"]
    : [1024, "K", "iB"]) as [number, string, string];
  const exp = (Math.log(value) / Math.log(multiple)) | 0;
  const size = Number((value / Math.pow(multiple, exp)).toFixed(2));
  return (
    size +
    (exp ? (k + "MGTPEZY")[exp - 1] + suffix : "byte" + (size !== 1 ? "s" : ""))
  );
}

export function setCacheHitOutput(isCacheHit: boolean): void {
  core.setOutput("cache-hit", isCacheHit.toString());
}

export async function findObject(
  mc: minio.Client,
  bucket: string,
  keys: string[],
  compressionMethod: CompressionMethod
): Promise<minio.BucketItem> {
  core.info("Restore keys: " + JSON.stringify(keys));
  for (const key of keys) {
    const fn = utils.getCacheFileName(compressionMethod);
    core.info(`Finding object with prefix: ${key}`);
    let objects = await listObjects(mc, bucket, key);
    core.info(`fn ${fn}`)
    core.info(`Objects, ${JSON.stringify(objects, null, '  ')}`)
    objects = objects.filter((o) => {
      core.info(`objects.filter ${o.name} includes ${fn} ? = ${o.name.includes(fn)}`)
      return o.name.includes(fn)
    });
    core.info(`Found ${JSON.stringify(objects, null, 2)}`);
    if (objects.length < 1) {
      continue;
    }
    const sorted = objects.sort(
      (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
    );
    core.info(`Using latest ${JSON.stringify(sorted[0])}`);
    return sorted[0];
  }
  throw new Error("Cache item not found");
}

export function listObjects(
  mc: minio.Client,
  bucket: string,
  prefix: string
): Promise<minio.BucketItem[]> {
  return new Promise((resolve, reject) => {
    console.log(`Try find objects in bucket ${bucket}`)
    const buckets = mc.listObjectsV2(bucket, undefined, true);
    const findedItems: minio.BucketItem[] = [];
    let resolved = false;
    buckets.on("data", (obj) => {
      console.log(`Buckets data ${JSON.stringify(obj)}`)
      findedItems.push(obj);
    });
    buckets.on("error", (e) => {
      console.log(`Buckets error ${JSON.stringify(e)}`)
      resolved = true;
      reject(e);
    });
    buckets.on("end", () => {
      console.log(`Buckets end: ${findedItems}`)
      resolved = true;
      resolve(findedItems);
    });
    setTimeout(() => {
      if (!resolved)
        reject(new Error("list objects no result after 10 seconds"));
    }, 10000);
  });
}
