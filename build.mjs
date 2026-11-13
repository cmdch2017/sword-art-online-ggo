import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const isPrivate = process.argv.includes("--private");
const template = await readFile(path.join(root, "src/index.template.html"), "utf8");
const css = await readFile(path.join(root, "src/styles.css"), "utf8");
const defaultBgmAttr = isPrivate
  ? ` src="data:audio/mpeg;base64,${(
      await readFile(path.join(root, "assets/ggo-bgm.mp3"))
    ).toString("base64")}"`
  : "";

const result = await build({
  entryPoints: [path.join(root, "src/main.js")],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["chrome110", "firefox110", "safari16"],
  write: false,
  legalComments: "none",
  define: {
    __PUBLIC_BUILD__: JSON.stringify(!isPrivate),
    __PRIVATE_BUILD__: JSON.stringify(isPrivate)
  },
  plugins: isPrivate
    ? []
    : [
        {
          name: "public-model-loader",
          setup(buildApi) {
            buildApi.onResolve({ filter: /^\.\/model-loader\.js$/ }, () => ({
              path: path.join(root, "src/model-loader-public.js")
            }));
          }
        }
      ]
});

const script = result.outputFiles[0].text.replaceAll("</script>", "<\\/script>");
const html = template
  .replace("__STYLES__", () => css)
  .replace("__DEFAULT_BGM_ATTR__", () => defaultBgmAttr)
  .replace("__SCRIPT__", () => script);

const outputPath = isPrivate
  ? path.join(root, "刀剑神域GGO.html")
  : path.join(root, "docs", "index.html");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, "utf8");
console.log(
  `Built ${path.relative(root, outputPath)} (${Buffer.byteLength(html).toLocaleString()} bytes)`
);
