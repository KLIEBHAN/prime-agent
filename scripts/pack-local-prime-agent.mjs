#!/usr/bin/env node

/**
 * Pack the locally built workspace into an installable `prime-agent` package.
 *
 * Mirrors scripts/pack-prime-agent-release.mjs, but rewrites the internal
 * workspace dependencies to local tarball paths instead of R2 release URLs, so
 * a development build can be installed globally without publishing anything.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.PRIME_AGENT_LOCAL_BUILD_DIR || join(homedir(), ".prime", "local-build");
const publicCommandName = "prime-agent";
const publicPackageName = "prime-agent";

const internalPackages = [
	{ dir: "ai", name: "@earendil-works/pi-ai" },
	{ dir: "tui", name: "@earendil-works/pi-tui" },
	{ dir: "agent", name: "@earendil-works/pi-agent-core" },
];

function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, stdio: "pipe", encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
	}
	return result.stdout.trim();
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function requireBuilt(packageDir) {
	const dist = join(root, "packages", packageDir, "dist");
	if (!existsSync(dist)) {
		throw new Error(`Missing ${dist}. Run npm run build first.`);
	}
}

const artifactsDir = join(outDir, "artifacts");
const stageDir = join(outDir, publicPackageName);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(artifactsDir, { recursive: true });

const internalPackagePaths = new Map();
for (const pkg of internalPackages) {
	requireBuilt(pkg.dir);
	const packageDir = join(root, "packages", pkg.dir);
	const before = new Set(readdirSync(artifactsDir));
	run("npm", ["pack", "--pack-destination", artifactsDir, "--ignore-scripts"], packageDir);
	const created = readdirSync(artifactsDir).filter((entry) => !before.has(entry));
	if (created.length !== 1) {
		throw new Error(`Expected exactly one tarball for ${pkg.name}, got ${created.join(", ") || "none"}`);
	}
	internalPackagePaths.set(pkg.name, `file:${join(artifactsDir, created[0])}`);
}

requireBuilt("coding-agent");
const sourceDir = join(root, "packages", "coding-agent");
const sourcePackage = readJson(join(sourceDir, "package.json"));

function rewriteDependencies(dependencies) {
	if (!dependencies) return undefined;
	const rewritten = {};
	for (const [name, range] of Object.entries(dependencies)) {
		rewritten[name] = internalPackagePaths.get(name) || range;
	}
	return rewritten;
}

const packageJson = {
	...sourcePackage,
	name: publicPackageName,
	version: sourcePackage.version,
	bin: { [publicCommandName]: "dist/bundle/cli.js" },
	piConfig: { ...(sourcePackage.piConfig || {}), name: publicCommandName, configDir: ".prime/agent" },
	dependencies: rewriteDependencies(sourcePackage.dependencies),
	optionalDependencies: rewriteDependencies(sourcePackage.optionalDependencies),
	scripts: sourcePackage.scripts?.postinstall ? { postinstall: sourcePackage.scripts.postinstall } : undefined,
};
delete packageJson.devDependencies;
delete packageJson.overrides;
delete packageJson.private;

mkdirSync(stageDir, { recursive: true });
writeFileSync(join(stageDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
for (const entry of ["dist", "docs", "examples", "skills", "postinstall.cjs", "README.md", "CHANGELOG.md"]) {
	const source = join(sourceDir, entry);
	if (existsSync(source)) {
		cpSync(source, join(stageDir, entry), { recursive: true });
	}
}

// Installing from a directory only symlinks it, so pack a tarball: `npm install
// -g <tarball>` performs a real copy install with dependencies resolved.
const before = new Set(readdirSync(artifactsDir));
run("npm", ["pack", "--pack-destination", artifactsDir, "--ignore-scripts"], stageDir);
const created = readdirSync(artifactsDir).filter((entry) => !before.has(entry));
if (created.length !== 1) {
	throw new Error(`Expected exactly one ${publicPackageName} tarball, got ${created.join(", ") || "none"}`);
}

console.log(join(artifactsDir, created[0]));
