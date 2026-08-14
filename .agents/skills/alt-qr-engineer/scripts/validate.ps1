$ErrorActionPreference = "Stop"
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:scanner
npm.cmd run build
