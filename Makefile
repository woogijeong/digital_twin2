# POSIX / CI convenience wrapper. On Windows without `make`, use the identical
# `pnpm <target>` scripts from package.json (pnpm dev / pnpm test / pnpm assets).
.PHONY: dev assets test test-api test-web test-e2e install

install:
	cd backend && uv sync
	pnpm install
	pnpm --dir frontend install

dev:
	pnpm dev

assets:
	pnpm assets

test: test-api test-web test-e2e

test-api:
	uv run --directory backend pytest -q

test-web:
	pnpm --dir frontend build

test-e2e:
	pnpm --dir frontend exec playwright test
