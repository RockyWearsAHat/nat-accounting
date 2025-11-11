import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import {globSync} from "glob";
import { extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import copy from "rollup-plugin-copy";

export default [
  {
    input: Object.fromEntries(
      globSync(
        [
          "src/server/**/*.ts",
          "src/server/*.ts",
        ],
        {
          ignore: ["**/*.d.ts", "**/*.test.ts"],
        }
      )
        .map((file) => [
          // Remove src/ prefix and .ts extension for output path
          file.slice(4, file.length - extname(file).length),
          fileURLToPath(new URL(file, import.meta.url)),
        ])
    ),
    output: {
      dir: "dist",
      format: "esm",
      sourcemap: false,
      preserveModules: true,
      preserveModulesRoot: "src",
    },
    external(id) {
      // Mark node_modules and built-in modules as external
      return id.includes(sep + "node_modules" + sep) || builtinModules.includes(id) || builtinModules.includes(id.replace(/^node:/, ''));
    },
    plugins: [
      typescript({ 
        moduleResolution: "bundler",
        tsconfig: "./tsconfig.json",
        noEmit: false,
        outDir: "dist"
      }),
      resolve({ 
        preferBuiltins: true,
        jsnext: true,
        main: true,
        exportConditions: ['node']
      }),
      commonjs({ 
        ignoreDynamicRequires: true,
        ignore: builtinModules
      }),
      copy({
        targets: [
          // Copy any additional files needed
        ],
      })
    ],
  },
];