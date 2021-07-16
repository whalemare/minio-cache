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

export function setCacheHitOutput(key: string, isCacheHit: boolean): void {
  core.setOutput("cache-hit", isCacheHit.toString());
  if (isCacheHit) {
    core.saveState(`cache-hit-${key}`, isCacheHit)
  }
}

export function getCacheHitOutput(key: string): boolean {
  const state = core.getState(`cache-hit-${key}`)
  core.info(`state for key ${key} = ${state}`)
  return !!(state === "true")
}

export async function findObject(
  mc: minio.Client,
  bucket: string,
  key: string,
  compressionMethod: CompressionMethod
): Promise<minio.BucketItem> {
  core.info(`Try find object with prefix: ${key}`);
  const cacheFileName = utils.getCacheFileName(compressionMethod);
  let objects = await listObjects(mc, bucket);
  core.info(`fn ${cacheFileName}`)
  core.info(`Objects, ${JSON.stringify(objects, null, '  ')}`)
  objects = objects.filter((o) => {
    const isIncludes = o.name.includes(key)
    core.info(`objects.filter ${o.name} includes ${key} ? = ${isIncludes}`)
    return isIncludes
  });
  core.info(`Found ${JSON.stringify(objects, null, 2)}`);
  const sorted = objects.sort(
    (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
  );
  if (sorted.length > 0){
    core.info(`Using latest ${JSON.stringify(sorted[0])}`);
    return sorted[0]
  }

  throw new Error("Cache item not found");
}

export function listObjects(
  mc: minio.Client,
  bucket: string,
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
