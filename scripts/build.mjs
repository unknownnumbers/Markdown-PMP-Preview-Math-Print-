import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/extension.cjs"],
  outfile: "dist/extension.cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["vscode", "bufferutil", "utf-8-validate"],
  minify: true,
  sourcemap: false,
  metafile: true,
  legalComments: "linked",
  define: {
    "process.env.WS_NO_BUFFER_UTIL": '"1"',
    "process.env.WS_NO_UTF_8_VALIDATE": '"1"',
  },
  logLevel: "warning",
});
const licenses = path.join(root, "assets/licenses/dependencies");
await fs.mkdir(licenses, { recursive: true });
const packages = new Map();
for (const filename of Object.keys(result.metafile.inputs)) {
  if (!filename.includes("node_modules/")) continue;
  let folder = path.dirname(path.resolve(root, filename));
  while (folder.startsWith(root) && folder !== root) {
    try {
      const pkg = JSON.parse(
        await fs.readFile(path.join(folder, "package.json"), "utf8"),
      );
      if (pkg.name && pkg.version) {
        packages.set(pkg.name + "@" + pkg.version, { folder, pkg });
        break;
      }
    } catch {
      /* Find the package boundary of this input. */
    }
    folder = path.dirname(folder);
  }
}
const index = [];
for (const [id, { folder, pkg }] of [...packages].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const entries = await fs.readdir(folder);
  const licenseFiles = entries.filter((name) =>
    /^(?:license|licence|copying|notice)(?:[._-]|$)/i.test(name),
  );
  // This release includes its MIT declaration in README rather than a LICENSE file.
  if (!licenseFiles.length && pkg.name === "@pdf-lib/fontkit")
    licenseFiles.push("README.md");
  if (!licenseFiles.length)
    throw new Error(`Missing license for bundled package ${id}`);
  const text = (
    await Promise.all(
      licenseFiles.map(
        async (name) =>
          `${name}\n${await fs.readFile(path.join(folder, name), "utf8")}`,
      ),
    )
  ).join("\n\n");
  const filename = id.replace(/[^a-zA-Z0-9._-]/g, "_") + ".txt";
  await fs.writeFile(
    path.join(licenses, filename),
    `${id}\nLicense: ${pkg.license}\n\n${text}`,
    "utf8",
  );
  index.push({
    package: id,
    license: pkg.license,
    notice: `assets/licenses/dependencies/${filename}`,
  });
}
await fs.writeFile(
  path.join(licenses, "index.json"),
  JSON.stringify(index, null, 2) + "\n",
);
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "assets/font-manifest.json"), "utf8"),
);
for (const font of manifest)
  await fs.access(path.join(root, "assets", font.file));
console.log(
  `Built extension; ${index.length} dependency notices; ${manifest.length} complete fonts.`,
);
