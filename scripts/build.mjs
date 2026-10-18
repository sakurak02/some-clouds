import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildDevelopment, renderSitemap } from "./build-development.mjs";
import { buildReading } from "./build-reading.mjs";

try {
  const developmentEntries = await buildDevelopment();
  const readingEntries = await buildReading();
  await writeFile(
    fileURLToPath(new URL("../sitemap.xml", import.meta.url)),
    renderSitemap(developmentEntries, readingEntries),
    "utf8",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
