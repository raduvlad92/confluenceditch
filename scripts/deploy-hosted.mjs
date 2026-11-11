import { execFileSync } from "node:child_process"
const sha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()
execFileSync("pnpm",["--filter","@confluenceditch/hosted","exec","wrangler","deploy","--var",`RELEASE:${sha}`],{stdio:"inherit"})
